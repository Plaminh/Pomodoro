/**
 * src/services/storage.ts
 *
 * LocalStorage Persistence Service for Pomodoro Lite.
 *
 * Responsibilities:
 * - Persist minimal essential Pomodoro state (phase, remainingMs, completedSessions, status).
 * - Normalize running timer sessions to "paused" to prevent automated time drift on restore.
 * - Safely restore and strictly validate state against corruption or invalid values.
 * - Gracefully handle unavailable LocalStorage, security sandboxes, and quota exceptions.
 * - Manage event-driven and throttled persistence hooks (setupPersistence).
 */

import type { AppState, PersistedPomodoroState, TimerPhase, TimerStatus } from "../types.ts";
import { FOCUS_DURATION_MS, BREAK_DURATION_MS } from "../types.ts";
import type { PomodoroController } from "../core/pomodoro.ts";

export const STORAGE_KEY = "pomodoro-lite-state";
export const STORAGE_SCHEMA_VERSION = 1;

/**
 * Safely accesses browser or global LocalStorage instance.
 */
export function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Restricted environment (e.g. iframe sandbox, private browsing)
  }
  return null;
}

/**
 * Saves the current Pomodoro application state to LocalStorage.
 * Running timers are normalized to "paused" status.
 */
export function savePomodoroState(state: AppState, storage: Storage | null = getStorage()): boolean {
  if (!storage || !state) {
    return false;
  }

  const normalizedStatus: "idle" | "paused" =
    state.status === "running" ? "paused" : state.status === "paused" ? "paused" : "idle";

  const payload: PersistedPomodoroState = {
    version: STORAGE_SCHEMA_VERSION,
    phase: state.phase === "break" ? "break" : "focus",
    remainingMs: Math.max(0, state.remainingMs),
    completedSessions: Math.max(0, Math.floor(state.completedSessions)),
    status: normalizedStatus,
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn("[Storage] Failed to persist Pomodoro state:", err);
    return false;
  }
}

/**
 * Loads and validates the persisted Pomodoro state from LocalStorage.
 * Returns null if data is absent, corrupt, or invalid.
 */
export function loadPomodoroState(storage: Storage | null = getStorage()): PersistedPomodoroState | null {
  if (!storage) {
    return null;
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== "string") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  // 1. Schema version validation: only version 1 supported
  if (record.version !== STORAGE_SCHEMA_VERSION) {
    return null;
  }

  // 2. Phase validation: must be 'focus' or 'break'
  if (record.phase !== "focus" && record.phase !== "break") {
    return null;
  }

  // 3. Status validation: must be 'idle' or 'paused'
  if (record.status !== "idle" && record.status !== "paused") {
    return null;
  }

  // 4. Remaining time validation: must be finite number, >= 0, and not exceeding phase duration
  if (
    typeof record.remainingMs !== "number" ||
    !Number.isFinite(record.remainingMs) ||
    record.remainingMs < 0
  ) {
    return null;
  }

  const maxAllowedDuration = record.phase === "focus" ? FOCUS_DURATION_MS : BREAK_DURATION_MS;
  if (record.remainingMs > maxAllowedDuration) {
    return null;
  }

  // 5. Completed sessions validation: must be non-negative integer
  if (
    typeof record.completedSessions !== "number" ||
    !Number.isFinite(record.completedSessions) ||
    !Number.isInteger(record.completedSessions) ||
    record.completedSessions < 0
  ) {
    return null;
  }

  return {
    version: 1,
    phase: record.phase,
    remainingMs: record.remainingMs,
    completedSessions: record.completedSessions,
    status: record.status,
  };
}

/**
 * Clears the stored Pomodoro state from LocalStorage.
 */
export function clearPomodoroState(storage: Storage | null = getStorage()): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[Storage] Failed to clear Pomodoro state:", err);
  }
}

/**
 * Sets up persistence hooks for PomodoroController state.
 *
 * Persistence Strategy:
 * - Save immediately on status change (START, PAUSE, RESET).
 * - Save immediately on phase change (focus <-> break).
 * - Save immediately when completedSessions changes.
 * - Save immediately when remainingMs changes while idle or paused (e.g. reset while idle).
 * - Throttles running countdown saves to approximately once per second.
 * - Saves latest state on document visibilitychange ('hidden') and window pagehide.
 */
export function setupPersistence(
  pomodoro: PomodoroController,
  storage: Storage | null = getStorage()
): void {
  let lastSavedTime = 0;
  let lastStatus: TimerStatus = pomodoro.getState().status;
  let lastPhase: TimerPhase = pomodoro.getState().phase;
  let lastSessions: number = pomodoro.getState().completedSessions;
  let lastRemainingMs: number = pomodoro.getState().remainingMs;

  const persistNow = (): void => {
    const currentState = pomodoro.getState();
    savePomodoroState(currentState, storage);
    lastSavedTime = Date.now();
    lastStatus = currentState.status;
    lastPhase = currentState.phase;
    lastSessions = currentState.completedSessions;
    lastRemainingMs = currentState.remainingMs;
  };

  pomodoro.subscribe((state) => {
    const statusChanged = state.status !== lastStatus;
    const phaseChanged = state.phase !== lastPhase;
    const sessionsChanged = state.completedSessions !== lastSessions;
    const isRunning = state.status === "running";
    const nonRunningRemainingChanged = !isRunning && state.remainingMs !== lastRemainingMs;
    const throttledRunningTick = isRunning && Date.now() - lastSavedTime >= 1000;

    // Save immediately on status change, phase change, session count change,
    // or remainingMs change while idle/paused.
    // Periodically save (~1s) while actively running.
    if (
      statusChanged ||
      phaseChanged ||
      sessionsChanged ||
      nonRunningRemainingChanged ||
      throttledRunningTick
    ) {
      persistNow();
    }
  });

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        persistNow();
      }
    });
  }

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      persistNow();
    });
  }
}
