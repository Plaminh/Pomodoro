/**
 * src/services/backup.ts
 *
 * JSON Backup & Restore Service for Pomodoro Lite (Phase 7).
 *
 * Architectural Responsibilities:
 * - Define and validate versioned PomodoroBackup JSON schema.
 * - Safely serialize and export live PomodoroController state as downloadable JSON file.
 * - Normalize running timer sessions to "paused" in export without affecting running state.
 * - Safely parse, size-limit (1 MB), and strictly validate imported JSON files.
 * - Require explicit user confirmation before overwriting current session progress.
 * - Atomically restore validated state into PomodoroController and immediately persist to LocalStorage.
 * - Maintain complete isolation from IndexedDB custom background storage.
 * - Provide graceful, user-visible feedback without external framework dependencies.
 */

import type { AppState, PomodoroBackup, PomodoroBackupData, TimerPhase } from "../types.ts";
import { FOCUS_DURATION_MS, BREAK_DURATION_MS } from "../types.ts";
import type { PomodoroController } from "../core/pomodoro.ts";
import { getStorage, savePomodoroState } from "./storage.ts";

export const BACKUP_APP_ID = "pomodoro-lite";
export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_SIZE_BYTES = 1024 * 1024; // 1 MB

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  data?: PomodoroBackup;
}

export interface ImportBackupOptions {
  storage?: Storage | null;
  confirm?: (message: string) => boolean;
  alert?: (message: string) => void;
}

export interface ImportResult {
  success: boolean;
  error?: string;
  restored?: PomodoroBackupData;
}

export interface ExportBackupOptions {
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  triggerDownload?: (blobUrl: string, filename: string) => void;
  timestamp?: string;
}

/**
 * Creates a valid versioned PomodoroBackup payload from live AppState.
 * Running timers are normalized to 'paused' status to prevent uncontrolled time drift.
 * Pure function: does not mutate the input state or the live controller.
 */
export function createBackupPayload(
  state: AppState,
  timestamp: string = new Date().toISOString()
): PomodoroBackup {
  const normalizedStatus: "idle" | "paused" = state.status === "running" ? "paused" : state.status;

  return {
    app: BACKUP_APP_ID,
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: timestamp,
    data: {
      phase: state.phase,
      remainingMs: Math.max(0, state.remainingMs),
      completedSessions: Math.max(0, Math.floor(state.completedSessions)),
      status: normalizedStatus,
    },
  };
}

/**
 * Generates a standard formatted backup filename: pomodoro-lite-backup-YYYY-MM-DD.json.
 */
export function generateBackupFilename(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `pomodoro-lite-backup-${yyyy}-${mm}-${dd}.json`;
}

/**
 * Strictly validates an arbitrary parsed JSON structure against the PomodoroBackup schema.
 * Rejects missing fields, invalid types, out-of-range durations, negative values, and wrong versions.
 */
export function validateBackupObject(parsed: unknown): BackupValidationResult {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: "Invalid backup file: Root structure must be a JSON object." };
  }

  const record = parsed as Record<string, unknown>;

  // 1. Application identifier check
  if (record.app !== BACKUP_APP_ID) {
    return {
      valid: false,
      error: `Invalid application identifier '${String(record.app)}'. Expected '${BACKUP_APP_ID}'.`,
    };
  }

  // 2. Schema version check
  if (record.version !== BACKUP_SCHEMA_VERSION) {
    return {
      valid: false,
      error: `Unsupported backup version '${String(record.version)}'. Only version ${BACKUP_SCHEMA_VERSION} is supported.`,
    };
  }

  // 3. ExportedAt timestamp check
  if (
    typeof record.exportedAt !== "string" ||
    !record.exportedAt.trim() ||
    Number.isNaN(Date.parse(record.exportedAt))
  ) {
    return {
      valid: false,
      error: "Invalid or missing exportedAt timestamp in backup file.",
    };
  }

  // 4. Data object structure check
  if (
    typeof record.data !== "object" ||
    record.data === null ||
    Array.isArray(record.data)
  ) {
    return {
      valid: false,
      error: "Missing or invalid 'data' section in backup file.",
    };
  }

  const data = record.data as Record<string, unknown>;

  // 5. Phase validation: must be 'focus' or 'break'
  if (data.phase !== "focus" && data.phase !== "break") {
    return {
      valid: false,
      error: `Invalid phase '${String(data.phase)}'. Must be 'focus' or 'break'.`,
    };
  }

  // 6. Status validation: must be 'idle' or 'paused'
  if (data.status !== "idle" && data.status !== "paused") {
    return {
      valid: false,
      error: `Invalid status '${String(data.status)}'. Must be 'idle' or 'paused'.`,
    };
  }

  // 7. Remaining time validation: finite number, >= 0, <= phase duration
  if (
    typeof data.remainingMs !== "number" ||
    !Number.isFinite(data.remainingMs)
  ) {
    return {
      valid: false,
      error: "Invalid remainingMs: Must be a finite number.",
    };
  }

  if (data.remainingMs < 0) {
    return {
      valid: false,
      error: "Invalid remainingMs: Cannot be negative.",
    };
  }

  const maxDuration = data.phase === "focus" ? FOCUS_DURATION_MS : BREAK_DURATION_MS;
  if (data.remainingMs > maxDuration) {
    return {
      valid: false,
      error: `Invalid remainingMs: Exceeds maximum allowed ${data.phase} duration (${maxDuration} ms).`,
    };
  }

  // 8. Completed sessions validation: finite non-negative integer
  if (
    typeof data.completedSessions !== "number" ||
    !Number.isFinite(data.completedSessions) ||
    !Number.isInteger(data.completedSessions)
  ) {
    return {
      valid: false,
      error: "Invalid completedSessions: Must be an integer.",
    };
  }

  if (data.completedSessions < 0) {
    return {
      valid: false,
      error: "Invalid completedSessions: Cannot be negative.",
    };
  }

  // Clean, sanitized copy with only known fields
  const validatedBackup: PomodoroBackup = {
    app: BACKUP_APP_ID,
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: record.exportedAt,
    data: {
      phase: data.phase as TimerPhase,
      remainingMs: data.remainingMs,
      completedSessions: data.completedSessions,
      status: data.status as "idle" | "paused",
    },
  };

  return { valid: true, data: validatedBackup };
}

/**
 * Safely parses and validates a raw JSON string into a validated PomodoroBackup.
 */
export function validateBackupJson(jsonString: string): BackupValidationResult {
  if (typeof jsonString !== "string" || !jsonString.trim()) {
    return { valid: false, error: "Backup file is empty." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { valid: false, error: "Malformed JSON: Failed to parse backup file." };
  }

  return validateBackupObject(parsed);
}

/**
 * Exports current live Pomodoro state to a downloadable JSON file.
 * Does not mutate active timer or pause active countdown.
 */
export function exportBackup(
  pomodoro: PomodoroController,
  options?: ExportBackupOptions
): boolean {
  try {
    const currentState = pomodoro.getState();
    const backup = createBackupPayload(currentState, options?.timestamp);
    const jsonString = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });

    const createUrl =
      options?.createObjectURL ??
      ((b: Blob) => (typeof URL !== "undefined" ? URL.createObjectURL(b) : ""));
    const revokeUrl =
      options?.revokeObjectURL ??
      ((u: string) => {
        if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(u);
        }
      });

    const filename = generateBackupFilename();
    const blobUrl = createUrl(blob);

    if (options?.triggerDownload) {
      options.triggerDownload(blobUrl, filename);
    } else if (typeof document !== "undefined") {
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }

    if (blobUrl) {
      revokeUrl(blobUrl);
    }

    return true;
  } catch (err) {
    console.error("[Backup] Failed to export backup:", err);
    return false;
  }
}

/**
 * Validates and restores a user-selected backup file into PomodoroController and LocalStorage.
 * Prompts user confirmation before destructive overwrite.
 * If storage persistence fails, rolls back in-memory state to prevent inconsistency.
 */
export async function importBackupFile(
  file: File | Blob,
  pomodoro: PomodoroController,
  options?: ImportBackupOptions
): Promise<ImportResult> {
  // 1. File size enforcement (<= 1 MB)
  if (file.size > MAX_BACKUP_SIZE_BYTES) {
    const msg = `Backup file exceeds maximum allowed size of ${MAX_BACKUP_SIZE_BYTES / (1024 * 1024)} MB.`;
    options?.alert?.(msg);
    return { success: false, error: msg };
  }

  // 2. Read file content safely
  let content: string;
  try {
    if (typeof file.text === "function") {
      content = await file.text();
    } else {
      content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
    }
  } catch (err) {
    const msg = "Failed to read backup file.";
    options?.alert?.(msg);
    return { success: false, error: msg };
  }

  // 3. Strict schema validation
  const validation = validateBackupJson(content);
  if (!validation.valid || !validation.data) {
    const msg = validation.error ?? "Invalid backup file structure.";
    options?.alert?.(msg);
    return { success: false, error: msg };
  }

  // 4. User confirmation
  const confirmFn =
    options?.confirm ??
    ((message: string) => {
      if (typeof window !== "undefined" && typeof window.confirm === "function") {
        return window.confirm(message);
      }
      return true;
    });

  const confirmed = confirmFn("Replace current Pomodoro progress with imported backup?");
  if (!confirmed) {
    return { success: false, error: "Import cancelled by user." };
  }

  // 5. Atomic restoration with rollback safeguard
  const previousState = pomodoro.getState();
  const backupData = validation.data.data;

  // Restore controller state in memory
  pomodoro.restoreState(backupData);

  // Persist to LocalStorage immediately
  const storage = options?.storage !== undefined ? options?.storage : getStorage();
  const saved = savePomodoroState(pomodoro.getState(), storage);

  // If storage was explicitly provided or available but save failed, rollback to preserve consistency
  if (storage && !saved) {
    pomodoro.restoreState({
      phase: previousState.phase,
      remainingMs: previousState.remainingMs,
      completedSessions: previousState.completedSessions,
      status: previousState.status,
    });
    const msg = "Failed to persist imported backup to LocalStorage. Restoration rolled back.";
    options?.alert?.(msg);
    return { success: false, error: msg };
  }

  return { success: true, restored: backupData };
}
