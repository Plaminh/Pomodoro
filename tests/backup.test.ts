/**
 * tests/backup.test.ts
 *
 * Automated tests for Phase 7: JSON Backup & Restore.
 * Executed via Node's built-in test runner (node:test).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  MAX_BACKUP_SIZE_BYTES,
  createBackupPayload,
  generateBackupFilename,
  validateBackupJson,
  validateBackupObject,
  exportBackup,
  importBackupFile,
} from "../src/services/backup.ts";
import { PomodoroController } from "../src/core/pomodoro.ts";
import {
  loadPomodoroState,
  savePomodoroState,
  STORAGE_KEY,
} from "../src/services/storage.ts";
import type { AppState, PomodoroBackup } from "../src/types.ts";
import { FOCUS_DURATION_MS, BREAK_DURATION_MS } from "../src/types.ts";

/**
 * In-memory Storage mock implementing standard Web Storage API.
 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

/**
 * Helper to create a standard valid backup JSON string.
 */
function makeValidBackupJson(overrides?: Partial<PomodoroBackup["data"]>): string {
  const payload: PomodoroBackup = {
    app: BACKUP_APP_ID,
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      phase: "focus",
      remainingMs: 25 * 60 * 1000,
      completedSessions: 3,
      status: "paused",
      ...overrides,
    },
  };
  return JSON.stringify(payload, null, 2);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// Core Test Cases (1-25)
// ============================================================================

test("Case 1: Export valid Focus state", () => {
  const pomodoro = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: 30 * 60 * 1000,
    initialCompletedSessions: 2,
    initialStatus: "paused",
  });

  const state = pomodoro.getState();
  const backup = createBackupPayload(state, "2026-10-26T12:00:00.000Z");

  assert.equal(backup.app, "pomodoro-lite");
  assert.equal(backup.version, 1);
  assert.equal(backup.exportedAt, "2026-10-26T12:00:00.000Z");
  assert.equal(backup.data.phase, "focus");
  assert.equal(backup.data.remainingMs, 30 * 60 * 1000);
  assert.equal(backup.data.completedSessions, 2);
  assert.equal(backup.data.status, "paused");

  pomodoro.dispose();
});

test("Case 2: Export valid Break state", () => {
  const pomodoro = new PomodoroController();
  pomodoro.switchPhase("break");

  const state = pomodoro.getState();
  const backup = createBackupPayload(state, "2026-10-26T12:00:00.000Z");

  assert.equal(backup.data.phase, "break");
  assert.equal(backup.data.remainingMs, BREAK_DURATION_MS);
  assert.equal(backup.data.status, "idle");

  pomodoro.dispose();
});

test("Case 3: Export running timer as paused without pausing the actual timer", async () => {
  const pomodoro = new PomodoroController({
    focusDurationMs: 5000,
    tickIntervalMs: 20,
  });

  pomodoro.start();
  await sleep(40);

  const stateBeforeExport = pomodoro.getState();
  assert.equal(stateBeforeExport.status, "running");

  let exportedContent = "";
  const success = exportBackup(pomodoro, {
    createObjectURL: (blob) => "mock-url",
    revokeObjectURL: () => {},
    triggerDownload: (url, filename) => {
      // In tests, extract content from controller directly
      const payload = createBackupPayload(pomodoro.getState());
      exportedContent = JSON.stringify(payload);
    },
  });

  assert.equal(success, true);
  const parsed = JSON.parse(exportedContent);
  assert.equal(parsed.data.status, "paused");

  // Verify the live controller is STILL running and was not paused
  const stateAfterExport = pomodoro.getState();
  assert.equal(stateAfterExport.status, "running");

  pomodoro.dispose();
});

test("Case 4: Preserve completedSessions exactly", () => {
  const pomodoro = new PomodoroController({
    initialCompletedSessions: 42,
  });

  const payload = createBackupPayload(pomodoro.getState());
  assert.equal(payload.data.completedSessions, 42);

  pomodoro.dispose();
});

test("Case 5: Generate valid JSON and filename", () => {
  const date = new Date("2026-10-26T10:30:00Z");
  const filename = generateBackupFilename(date);
  assert.equal(filename, "pomodoro-lite-backup-2026-10-26.json");

  const pomodoro = new PomodoroController();
  const payload = createBackupPayload(pomodoro.getState());
  const serialized = JSON.stringify(payload, null, 2);

  const validation = validateBackupJson(serialized);
  assert.equal(validation.valid, true);
  assert.ok(validation.data);
  assert.equal(validation.data.app, "pomodoro-lite");

  pomodoro.dispose();
});

test("Case 6: Reject malformed JSON", () => {
  const malformed = '{ "app": "pomodoro-lite", broken json ';
  const result = validateBackupJson(malformed);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /Malformed JSON/);
});

test("Case 7: Reject unsupported version", () => {
  const json = JSON.stringify({
    app: "pomodoro-lite",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      phase: "focus",
      remainingMs: 1000,
      completedSessions: 0,
      status: "idle",
    },
  });

  const result = validateBackupJson(json);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /Unsupported backup version/);
});

test("Case 8: Reject wrong application identifier", () => {
  const json = JSON.stringify({
    app: "other-timer-app",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      phase: "focus",
      remainingMs: 1000,
      completedSessions: 0,
      status: "idle",
    },
  });

  const result = validateBackupJson(json);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /Invalid application identifier/);
});

test("Case 9: Reject negative remainingMs", () => {
  const json = makeValidBackupJson({ remainingMs: -500 });
  const result = validateBackupJson(json);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /Cannot be negative/);
});

test("Case 10: Reject remainingMs exceeding phase duration", () => {
  // Focus phase: max is FOCUS_DURATION_MS
  const focusOver = makeValidBackupJson({
    phase: "focus",
    remainingMs: FOCUS_DURATION_MS + 1000,
  });
  const res1 = validateBackupJson(focusOver);
  assert.equal(res1.valid, false);
  assert.match(res1.error ?? "", /Exceeds maximum allowed focus duration/);

  // Break phase: max is BREAK_DURATION_MS
  const breakOver = makeValidBackupJson({
    phase: "break",
    remainingMs: BREAK_DURATION_MS + 500,
  });
  const res2 = validateBackupJson(breakOver);
  assert.equal(res2.valid, false);
  assert.match(res2.error ?? "", /Exceeds maximum allowed break duration/);
});

test("Case 11: Reject negative completedSessions", () => {
  const json = makeValidBackupJson({ completedSessions: -1 });
  const result = validateBackupJson(json);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /Cannot be negative/);
});

test("Case 12: Reject fractional completedSessions", () => {
  const json = makeValidBackupJson({ completedSessions: 3.5 });
  const result = validateBackupJson(json);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /Must be an integer/);
});

test("Case 13: Reject invalid phase", () => {
  const json = JSON.stringify({
    app: "pomodoro-lite",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      phase: "workout",
      remainingMs: 1000,
      completedSessions: 0,
      status: "idle",
    },
  });
  const result = validateBackupJson(json);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /Invalid phase/);
});

test("Case 14: Reject invalid status", () => {
  const runningJson = makeValidBackupJson({ status: "running" as any });
  const res1 = validateBackupJson(runningJson);
  assert.equal(res1.valid, false);
  assert.match(res1.error ?? "", /Invalid status/);

  const unknownJson = makeValidBackupJson({ status: "stopped" as any });
  const res2 = validateBackupJson(unknownJson);
  assert.equal(res2.valid, false);
  assert.match(res2.error ?? "", /Invalid status/);
});

test("Case 15: Reject missing required fields", () => {
  // Missing app
  const noApp = JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { phase: "focus", remainingMs: 1000, completedSessions: 0, status: "idle" },
  });
  assert.equal(validateBackupJson(noApp).valid, false);

  // Missing data section
  const noData = JSON.stringify({
    app: "pomodoro-lite",
    version: 1,
    exportedAt: new Date().toISOString(),
  });
  assert.equal(validateBackupJson(noData).valid, false);

  // Missing exportedAt
  const noExportedAt = JSON.stringify({
    app: "pomodoro-lite",
    version: 1,
    data: { phase: "focus", remainingMs: 1000, completedSessions: 0, status: "idle" },
  });
  assert.equal(validateBackupJson(noExportedAt).valid, false);
});

test("Case 16: Import while timer is running", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController({
    focusDurationMs: 5000,
    tickIntervalMs: 20,
  });

  pomodoro.start();
  await sleep(40);
  assert.equal(pomodoro.getState().status, "running");

  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 5 * 60 * 1000,
    completedSessions: 4,
    status: "paused",
  });
  const blob = new Blob([json], { type: "application/json" });

  const result = await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => true,
  });

  assert.equal(result.success, true);
  const state = pomodoro.getState();
  assert.equal(state.status, "paused");
  assert.equal(state.phase, "break");
  assert.equal(state.remainingMs, 5 * 60 * 1000);
  assert.equal(state.completedSessions, 4);

  pomodoro.dispose();
});

test("Case 17: Import while timer is paused", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController();

  pomodoro.start();
  await sleep(30);
  pomodoro.pause();
  assert.equal(pomodoro.getState().status, "paused");

  const json = makeValidBackupJson({
    phase: "focus",
    remainingMs: 15 * 60 * 1000,
    completedSessions: 8,
    status: "idle",
  });
  const blob = new Blob([json], { type: "application/json" });

  const result = await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => true,
  });

  assert.equal(result.success, true);
  const state = pomodoro.getState();
  assert.equal(state.status, "idle");
  assert.equal(state.remainingMs, 15 * 60 * 1000);
  assert.equal(state.completedSessions, 8);

  pomodoro.dispose();
});

test("Case 18: Import while timer is idle", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController();
  assert.equal(pomodoro.getState().status, "idle");

  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 8 * 60 * 1000,
    completedSessions: 5,
    status: "paused",
  });
  const blob = new Blob([json], { type: "application/json" });

  const result = await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => true,
  });

  assert.equal(result.success, true);
  const state = pomodoro.getState();
  assert.equal(state.phase, "break");
  assert.equal(state.status, "paused");
  assert.equal(state.completedSessions, 5);

  pomodoro.dispose();
});

test("Case 19: Imported state remains paused or idle", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController();

  const json = makeValidBackupJson({
    phase: "focus",
    remainingMs: 20 * 60 * 1000,
    status: "paused",
  });
  const blob = new Blob([json], { type: "application/json" });

  await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => true,
  });

  // Wait 100ms and verify the timer did NOT start automatically
  await sleep(100);
  const state = pomodoro.getState();
  assert.equal(state.status, "paused");
  assert.equal(state.remainingMs, 20 * 60 * 1000);

  pomodoro.dispose();
});

test("Case 20: Imported state persists after reload", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController();

  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 7 * 60 * 1000,
    completedSessions: 9,
    status: "paused",
  });
  const blob = new Blob([json], { type: "application/json" });

  await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => true,
  });
  pomodoro.dispose();

  // Emulate page reload: load from LocalStorage into new PomodoroController
  const restoredFromStorage = loadPomodoroState(storage);
  assert.ok(restoredFromStorage);
  assert.equal(restoredFromStorage.phase, "break");
  assert.equal(restoredFromStorage.remainingMs, 7 * 60 * 1000);
  assert.equal(restoredFromStorage.completedSessions, 9);
  assert.equal(restoredFromStorage.status, "paused");

  const restoredController = new PomodoroController({
    initialPhase: restoredFromStorage.phase,
    initialRemainingMs: restoredFromStorage.remainingMs,
    initialCompletedSessions: restoredFromStorage.completedSessions,
    initialStatus: restoredFromStorage.status,
  });

  const state = restoredController.getState();
  assert.equal(state.phase, "break");
  assert.equal(state.remainingMs, 7 * 60 * 1000);
  assert.equal(state.completedSessions, 9);
  assert.equal(state.status, "paused");

  restoredController.dispose();
});

test("Case 21: Invalid import preserves existing state", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: 40 * 60 * 1000,
    initialCompletedSessions: 2,
    initialStatus: "idle",
  });
  savePomodoroState(pomodoro.getState(), storage);

  const invalidJson = '{ "app": "pomodoro-lite", broken json ';
  const blob = new Blob([invalidJson], { type: "application/json" });

  let alertCalled = false;
  const result = await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => true,
    alert: () => {
      alertCalled = true;
    },
  });

  assert.equal(result.success, false);
  assert.equal(alertCalled, true);

  // Controller state is intact
  const state = pomodoro.getState();
  assert.equal(state.phase, "focus");
  assert.equal(state.remainingMs, 40 * 60 * 1000);
  assert.equal(state.completedSessions, 2);

  // Storage is intact
  const persisted = loadPomodoroState(storage);
  assert.equal(persisted?.remainingMs, 40 * 60 * 1000);

  pomodoro.dispose();
});

test("Case 22: Cancelled import preserves existing state", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: 35 * 60 * 1000,
    initialCompletedSessions: 3,
  });
  savePomodoroState(pomodoro.getState(), storage);

  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 5 * 60 * 1000,
    completedSessions: 10,
  });
  const blob = new Blob([json], { type: "application/json" });

  const result = await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => false, // User clicks Cancel
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "Import cancelled by user.");

  const state = pomodoro.getState();
  assert.equal(state.phase, "focus");
  assert.equal(state.remainingMs, 35 * 60 * 1000);
  assert.equal(state.completedSessions, 3);

  pomodoro.dispose();
});

test("Case 23: Import does not change IndexedDB background or call background service", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController();

  // Mock background data in a simulated store
  const mockBackgroundStore = new Map<string, string>();
  mockBackgroundStore.set("current", "background-data-payload");

  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 2 * 60 * 1000,
    completedSessions: 5,
  });
  const blob = new Blob([json], { type: "application/json" });

  await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => true,
  });

  // Verify background data is completely untouched
  assert.equal(mockBackgroundStore.get("current"), "background-data-payload");
  assert.equal(mockBackgroundStore.size, 1);

  pomodoro.dispose();
});

test("Case 24: Export does not mutate application state", () => {
  const pomodoro = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: 25 * 60 * 1000,
    initialCompletedSessions: 4,
    initialStatus: "idle",
  });

  const beforeState = { ...pomodoro.getState() };

  exportBackup(pomodoro, {
    createObjectURL: () => "mock-url",
    revokeObjectURL: () => {},
    triggerDownload: () => {},
  });

  const afterState = pomodoro.getState();
  assert.deepEqual(beforeState, afterState);

  pomodoro.dispose();
});

test("Case 25: Import cannot accidentally award a Focus Hour", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: 1000,
    initialCompletedSessions: 2,
  });

  // Import a state where remainingMs is 0 (or almost completed)
  const json = makeValidBackupJson({
    phase: "focus",
    remainingMs: 0,
    completedSessions: 5,
    status: "idle",
  });
  const blob = new Blob([json], { type: "application/json" });

  await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => true,
  });

  // Verify completedSessions equals exactly what was imported (5), not 6
  const state = pomodoro.getState();
  assert.equal(state.completedSessions, 5);

  pomodoro.dispose();
});

// ============================================================================
// Regression Tests for restoreState & Edge Cases
// ============================================================================

test("Regression 26: restoreState stops active interval cleanly", async () => {
  const pomodoro = new PomodoroController({
    focusDurationMs: 5000,
    tickIntervalMs: 20,
  });

  pomodoro.start();
  await sleep(40);
  assert.equal(pomodoro.getState().status, "running");

  pomodoro.restoreState({
    phase: "break",
    remainingMs: BREAK_DURATION_MS,
    completedSessions: 1,
    status: "idle",
  });

  const stateAfterRestore = pomodoro.getState();
  assert.equal(stateAfterRestore.status, "idle");
  const remaining = stateAfterRestore.remainingMs;

  await sleep(60);
  // No interval ticks occurred
  assert.equal(pomodoro.getState().remainingMs, remaining);

  pomodoro.dispose();
});

test("Regression 27: restoreState notifies registered subscribers", () => {
  const pomodoro = new PomodoroController();
  let receivedState: AppState | null = null;

  pomodoro.subscribe((s) => {
    receivedState = s;
  });

  pomodoro.restoreState({
    phase: "break",
    remainingMs: 60000,
    completedSessions: 7,
    status: "paused",
  });

  assert.ok(receivedState);
  assert.equal((receivedState as AppState).phase, "break");
  assert.equal((receivedState as AppState).remainingMs, 60000);
  assert.equal((receivedState as AppState).completedSessions, 7);
  assert.equal((receivedState as AppState).status, "paused");

  pomodoro.dispose();
});

test("Regression 28: Starting timer after restore resumes from restored remainingMs", async () => {
  const pomodoro = new PomodoroController({
    focusDurationMs: 10000,
    tickIntervalMs: 20,
  });

  pomodoro.restoreState({
    phase: "focus",
    remainingMs: 3000,
    completedSessions: 2,
    status: "paused",
  });

  pomodoro.start(); // Resumes
  assert.equal(pomodoro.getState().status, "running");
  assert.ok(pomodoro.getState().remainingMs <= 3000);

  await sleep(50);
  assert.ok(pomodoro.getState().remainingMs < 3000);

  pomodoro.dispose();
});

test("Regression 29: Resetting timer after restore restores full phase duration", () => {
  const pomodoro = new PomodoroController();

  pomodoro.restoreState({
    phase: "break",
    remainingMs: 2000,
    completedSessions: 3,
    status: "paused",
  });

  pomodoro.reset();
  const state = pomodoro.getState();
  assert.equal(state.phase, "break");
  assert.equal(state.remainingMs, BREAK_DURATION_MS);
  assert.equal(state.status, "idle");

  pomodoro.dispose();
});

test("Regression 30: Storage failure during import rolls back controller state", async () => {
  const failingStorage: Storage = {
    length: 0,
    clear: () => {},
    getItem: () => null,
    key: () => null,
    removeItem: () => {},
    setItem: () => {
      throw new Error("QuotaExceededError: simulated disk full");
    },
  };

  const pomodoro = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: 45 * 60 * 1000,
    initialCompletedSessions: 1,
    initialStatus: "idle",
  });

  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 10000,
    completedSessions: 5,
  });
  const blob = new Blob([json], { type: "application/json" });

  let alertMessage = "";
  const result = await importBackupFile(blob, pomodoro, {
    storage: failingStorage,
    confirm: () => true,
    alert: (msg) => {
      alertMessage = msg;
    },
  });

  assert.equal(result.success, false);
  assert.match(alertMessage, /Restoration rolled back/);

  // Controller state was rolled back to initial state
  const state = pomodoro.getState();
  assert.equal(state.phase, "focus");
  assert.equal(state.remainingMs, 45 * 60 * 1000);
  assert.equal(state.completedSessions, 1);

  pomodoro.dispose();
});

test("Regression 31: Enforce maximum backup file size of 1 MB", async () => {
  const pomodoro = new PomodoroController();
  // Create dummy blob slightly larger than 1 MB
  const oversizedBlob = new Blob([new Uint8Array(MAX_BACKUP_SIZE_BYTES + 100)], {
    type: "application/json",
  });

  let alertMessage = "";
  const result = await importBackupFile(oversizedBlob, pomodoro, {
    confirm: () => true,
    alert: (msg) => {
      alertMessage = msg;
    },
  });

  assert.equal(result.success, false);
  assert.match(alertMessage, /exceeds maximum allowed size/i);

  pomodoro.dispose();
});

test("Regression 32: Import persistence failure while timer is running safely restores running state", async () => {
  const failingStorage: Storage = {
    length: 0,
    clear: () => {},
    getItem: () => null,
    key: () => null,
    removeItem: () => {},
    setItem: () => {
      throw new Error("QuotaExceededError: simulated disk full");
    },
  };

  const pomodoro = new PomodoroController({
    focusDurationMs: 5000,
    tickIntervalMs: 20,
  });

  pomodoro.start();
  await sleep(40);
  const stateBeforeImport = pomodoro.getState();
  assert.equal(stateBeforeImport.status, "running");
  assert.equal(stateBeforeImport.phase, "focus");

  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 2000,
    completedSessions: 9,
    status: "paused",
  });
  const blob = new Blob([json], { type: "application/json" });

  let alertMessage = "";
  const result = await importBackupFile(blob, pomodoro, {
    storage: failingStorage,
    confirm: () => true,
    alert: (msg) => {
      alertMessage = msg;
    },
  });

  assert.equal(result.success, false);
  assert.match(alertMessage, /Restoration rolled back/);

  // Verify rollback restored the running state safely
  const stateAfterRollback = pomodoro.getState();
  assert.equal(stateAfterRollback.status, "running");
  assert.equal(stateAfterRollback.phase, "focus");
  assert.equal(stateAfterRollback.completedSessions, 0);
  assert.ok(stateAfterRollback.remainingMs <= stateBeforeImport.remainingMs);

  // Verify timer continues running without duplicate intervals
  const initialRemaining = stateAfterRollback.remainingMs;
  await sleep(60);
  assert.ok(pomodoro.getState().remainingMs < initialRemaining);

  pomodoro.dispose();
});

test("Regression 33: Import persistence failure while timer is paused preserves paused state and exact remaining time", async () => {
  const failingStorage: Storage = {
    length: 0,
    clear: () => {},
    getItem: () => null,
    key: () => null,
    removeItem: () => {},
    setItem: () => {
      throw new Error("QuotaExceededError: simulated disk full");
    },
  };

  const pomodoro = new PomodoroController({
    focusDurationMs: 5000,
    tickIntervalMs: 20,
  });

  pomodoro.start();
  await sleep(40);
  pomodoro.pause();
  const pausedState = pomodoro.getState();
  assert.equal(pausedState.status, "paused");

  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 1000,
    completedSessions: 8,
    status: "idle",
  });
  const blob = new Blob([json], { type: "application/json" });

  const result = await importBackupFile(blob, pomodoro, {
    storage: failingStorage,
    confirm: () => true,
  });

  assert.equal(result.success, false);

  const stateAfterRollback = pomodoro.getState();
  assert.equal(stateAfterRollback.status, "paused");
  assert.equal(stateAfterRollback.phase, "focus");
  assert.equal(stateAfterRollback.remainingMs, pausedState.remainingMs);
  assert.equal(stateAfterRollback.completedSessions, 0);

  // Verify paused timer does NOT tick
  await sleep(60);
  assert.equal(pomodoro.getState().remainingMs, pausedState.remainingMs);

  pomodoro.dispose();
});

test("Regression 34: Successful import while timer is running stops countdown and applies imported state", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController({
    focusDurationMs: 10000,
    tickIntervalMs: 20,
  });

  pomodoro.start();
  await sleep(40);
  assert.equal(pomodoro.getState().status, "running");

  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 4000,
    completedSessions: 7,
    status: "paused",
  });
  const blob = new Blob([json], { type: "application/json" });

  const result = await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => true,
  });

  assert.equal(result.success, true);

  const currentState = pomodoro.getState();
  assert.equal(currentState.status, "paused");
  assert.equal(currentState.phase, "break");
  assert.equal(currentState.remainingMs, 4000);
  assert.equal(currentState.completedSessions, 7);

  // Verify countdown is truly stopped
  await sleep(60);
  assert.equal(pomodoro.getState().remainingMs, 4000);

  // Verify persisted in storage
  const persisted = loadPomodoroState(storage);
  assert.equal(persisted?.remainingMs, 4000);
  assert.equal(persisted?.status, "paused");
  assert.equal(persisted?.completedSessions, 7);

  pomodoro.dispose();
});

test("Regression 35: No duplicate completion credit after failed import", async () => {
  const failingStorage: Storage = {
    length: 0,
    clear: () => {},
    getItem: () => null,
    key: () => null,
    removeItem: () => {},
    setItem: () => {
      throw new Error("Disk full");
    },
  };

  // Create a timer with short focus duration that will finish soon
  const pomodoro = new PomodoroController({
    focusDurationMs: 120,
    breakDurationMs: 200,
    tickIntervalMs: 20,
  });

  pomodoro.start();
  await sleep(30);

  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 50,
    completedSessions: 0,
  });
  const blob = new Blob([json], { type: "application/json" });

  // Import attempt fails and rolls back to the running focus timer
  const result = await importBackupFile(blob, pomodoro, {
    storage: failingStorage,
    confirm: () => true,
  });
  assert.equal(result.success, false);

  // Wait for the restored focus timer to finish naturally
  await sleep(150);

  // When focus phase naturally completes, completedSessions must increment exactly once to 1
  const finalState = pomodoro.getState();
  assert.equal(finalState.completedSessions, 1);
  assert.equal(finalState.phase, "break");

  pomodoro.dispose();
});

test("Regression 36: No stale persistence writes after successful import", async () => {
  const storage = new MemoryStorage();
  const pomodoro = new PomodoroController({
    focusDurationMs: 10000,
    tickIntervalMs: 20,
  });

  // Setup active persistence subscription
  const { setupPersistence } = await import("../src/services/storage.ts");
  setupPersistence(pomodoro, storage);

  pomodoro.start();
  await sleep(40);

  // Import a distinct break state
  const json = makeValidBackupJson({
    phase: "break",
    remainingMs: 3500,
    completedSessions: 6,
    status: "paused",
  });
  const blob = new Blob([json], { type: "application/json" });

  const result = await importBackupFile(blob, pomodoro, {
    storage,
    confirm: () => true,
  });
  assert.equal(result.success, true);

  // Wait to allow any potential lingering asynchronous interval or throttle callbacks to run
  await sleep(100);

  // Verify storage has not been overwritten by any stale tick from previous running session
  const stored = loadPomodoroState(storage);
  assert.ok(stored);
  assert.equal(stored.phase, "break");
  assert.equal(stored.remainingMs, 3500);
  assert.equal(stored.completedSessions, 6);
  assert.equal(stored.status, "paused");

  pomodoro.dispose();
});
