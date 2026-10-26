/**
 * tests/storage.test.ts
 *
 * Automated tests for Phase 4: LocalStorage Persistence & Safe State Restoration.
 * Executed via Node's built-in test runner (node:test).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  savePomodoroState,
  loadPomodoroState,
  clearPomodoroState,
  STORAGE_KEY,
  STORAGE_SCHEMA_VERSION,
} from "../src/services/storage.ts";
import { PomodoroController } from "../src/core/pomodoro.ts";
import type { AppState } from "../src/types.ts";
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

test("Case 1: Saving valid state writes versioned JSON to STORAGE_KEY", () => {
  const storage = new MemoryStorage();
  const state: AppState = {
    phase: "focus",
    status: "paused",
    remainingMs: 25 * 60 * 1000,
    endTime: null,
    completedSessions: 2,
  };

  savePomodoroState(state, storage);

  const raw = storage.getItem(STORAGE_KEY);
  assert.ok(raw !== null, "Storage must contain item for STORAGE_KEY");

  const parsed = JSON.parse(raw!);
  assert.equal(parsed.version, STORAGE_SCHEMA_VERSION);
  assert.equal(parsed.phase, "focus");
  assert.equal(parsed.status, "paused");
  assert.equal(parsed.remainingMs, 25 * 60 * 1000);
  assert.equal(parsed.completedSessions, 2);
});

test("Case 2: Loading valid state correctly parses persisted payload", () => {
  const storage = new MemoryStorage();
  const state: AppState = {
    phase: "break",
    status: "idle",
    remainingMs: BREAK_DURATION_MS,
    endTime: null,
    completedSessions: 3,
  };

  savePomodoroState(state, storage);
  const loaded = loadPomodoroState(storage);

  assert.ok(loaded !== null);
  assert.equal(loaded.version, 1);
  assert.equal(loaded.phase, "break");
  assert.equal(loaded.status, "idle");
  assert.equal(loaded.remainingMs, BREAK_DURATION_MS);
  assert.equal(loaded.completedSessions, 3);
});

test("Case 3: First visit with no saved data returns null", () => {
  const storage = new MemoryStorage();
  const loaded = loadPomodoroState(storage);
  assert.equal(loaded, null);
});

test("Case 4: Malformed JSON returns null without crashing", () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, "{ malformed: json, ");

  const loaded = loadPomodoroState(storage);
  assert.equal(loaded, null);
});

test("Case 5: Unsupported schema version returns null", () => {
  const storage = new MemoryStorage();
  const invalidVersion = {
    version: 99,
    phase: "focus",
    remainingMs: 10000,
    completedSessions: 0,
    status: "idle",
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(invalidVersion));

  assert.equal(loadPomodoroState(storage), null);
});

test("Case 6: Invalid phase value returns null", () => {
  const storage = new MemoryStorage();
  const invalidPhase = {
    version: 1,
    phase: "invalid_phase",
    remainingMs: 10000,
    completedSessions: 0,
    status: "idle",
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(invalidPhase));

  assert.equal(loadPomodoroState(storage), null);
});

test("Case 7: Invalid remainingMs values return null", () => {
  const storage = new MemoryStorage();

  const testCases = [
    { remainingMs: -100 },
    { remainingMs: NaN },
    { remainingMs: Infinity },
    { remainingMs: "5000" },
    { remainingMs: FOCUS_DURATION_MS + 1000 }, // Exceeds 50 min focus duration
  ];

  for (const tc of testCases) {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        phase: "focus",
        remainingMs: tc.remainingMs,
        completedSessions: 0,
        status: "idle",
      })
    );
    assert.equal(
      loadPomodoroState(storage),
      null,
      `Expected remainingMs: ${tc.remainingMs} to be rejected`
    );
  }
});

test("Case 8: Invalid completedSessions values return null", () => {
  const storage = new MemoryStorage();

  const testCases = [
    { completedSessions: -1 },
    { completedSessions: 2.5 },
    { completedSessions: NaN },
    { completedSessions: Infinity },
    { completedSessions: "3" },
  ];

  for (const tc of testCases) {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        phase: "focus",
        remainingMs: 10000,
        completedSessions: tc.completedSessions,
        status: "idle",
      })
    );
    assert.equal(
      loadPomodoroState(storage),
      null,
      `Expected completedSessions: ${tc.completedSessions} to be rejected`
    );
  }
});

test("Case 9: Running state is normalized and persisted as paused", () => {
  const storage = new MemoryStorage();
  const runningState: AppState = {
    phase: "focus",
    status: "running",
    remainingMs: 40 * 60 * 1000,
    endTime: Date.now() + 40 * 60 * 1000,
    completedSessions: 1,
  };

  savePomodoroState(runningState, storage);
  const loaded = loadPomodoroState(storage);

  assert.ok(loaded !== null);
  assert.equal(loaded.status, "paused", "Running state must normalize to paused");
});

test("Case 10: Idle state remains idle when persisted", () => {
  const storage = new MemoryStorage();
  const idleState: AppState = {
    phase: "focus",
    status: "idle",
    remainingMs: FOCUS_DURATION_MS,
    endTime: null,
    completedSessions: 0,
  };

  savePomodoroState(idleState, storage);
  const loaded = loadPomodoroState(storage);

  assert.ok(loaded !== null);
  assert.equal(loaded.status, "idle");
});

test("Case 11: Restored Focus countdown remains paused and matches saved remaining time", () => {
  const savedRemaining = 35 * 60 * 1000 + 42 * 1000; // 35:42
  const controller = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: savedRemaining,
    initialStatus: "paused",
    initialCompletedSessions: 2,
  });

  const state = controller.getState();
  assert.equal(state.phase, "focus");
  assert.equal(state.status, "paused");
  assert.equal(state.remainingMs, savedRemaining);
  assert.equal(state.completedSessions, 2);
  assert.equal(state.endTime, null);

  controller.dispose();
});

test("Case 12: Restored Break countdown remains paused and matches saved remaining time", () => {
  const savedRemaining = 7 * 60 * 1000 + 15 * 1000; // 07:15
  const controller = new PomodoroController({
    initialPhase: "break",
    initialRemainingMs: savedRemaining,
    initialStatus: "paused",
    initialCompletedSessions: 3,
  });

  const state = controller.getState();
  assert.equal(state.phase, "break");
  assert.equal(state.status, "paused");
  assert.equal(state.remainingMs, savedRemaining);
  assert.equal(state.completedSessions, 3);
  assert.equal(state.endTime, null);

  controller.dispose();
});

test("Case 13: Restored completedSessions remains unchanged", () => {
  const controller = new PomodoroController({
    initialPhase: "focus",
    initialCompletedSessions: 5,
  });

  assert.equal(controller.getState().completedSessions, 5);
  controller.dispose();
});

test("Case 14: Restoration does not trigger completion callbacks", async () => {
  let completionFired = false;
  const controller = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: 0,
    initialStatus: "idle",
  });

  controller.subscribe((state) => {
    if (state.completedSessions > 0) {
      completionFired = true;
    }
  });

  await new Promise((r) => setTimeout(r, 60));

  assert.equal(completionFired, false, "Restoration must never trigger completion callback");
  assert.equal(controller.getState().completedSessions, 0);

  controller.dispose();
});

test("Case 15: Restoration does not start an interval", async () => {
  const remaining = 2000;
  const controller = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: remaining,
    initialStatus: "paused",
  });

  await new Promise((r) => setTimeout(r, 80));

  assert.equal(controller.getState().remainingMs, remaining, "Remaining time must not decrement while paused");
  assert.equal(controller.getState().status, "paused");

  controller.dispose();
});

test("Case 16: Reset state persists correctly as idle with full phase duration", () => {
  const storage = new MemoryStorage();
  const controller = new PomodoroController({
    focusDurationMs: 5000,
  });

  controller.start();
  controller.reset();

  savePomodoroState(controller.getState(), storage);
  const loaded = loadPomodoroState(storage);

  assert.ok(loaded !== null);
  assert.equal(loaded.status, "idle");
  assert.equal(loaded.remainingMs, 5000);

  controller.dispose();
});

test("Case 17: Completed Focus transitions and persists correctly", async () => {
  const storage = new MemoryStorage();
  const controller = new PomodoroController({
    focusDurationMs: 40,
    breakDurationMs: 30,
    tickIntervalMs: 10,
  });

  controller.start();
  await new Promise((r) => setTimeout(r, 80));

  // Focus has finished, transitioned to Break, session incremented
  const stateAfterCompletion = controller.getState();
  assert.equal(stateAfterCompletion.phase, "break");
  assert.equal(stateAfterCompletion.completedSessions, 1);
  assert.equal(stateAfterCompletion.status, "idle");

  savePomodoroState(stateAfterCompletion, storage);
  const loaded = loadPomodoroState(storage);

  assert.ok(loaded !== null);
  assert.equal(loaded.phase, "break");
  assert.equal(loaded.status, "idle");
  assert.equal(loaded.completedSessions, 1);
  assert.equal(loaded.remainingMs, 30);

  controller.dispose();
});

test("Case 18: Storage access errors do not crash the application", () => {
  const errorStorage: Storage = {
    length: 0,
    clear: () => {
      throw new Error("SecurityError: Access denied");
    },
    getItem: () => {
      throw new Error("QuotaExceededError: Out of memory");
    },
    key: () => null,
    removeItem: () => {
      throw new Error("SecurityError: Access denied");
    },
    setItem: () => {
      throw new Error("QuotaExceededError: Out of memory");
    },
  };

  const state: AppState = {
    phase: "focus",
    status: "idle",
    remainingMs: FOCUS_DURATION_MS,
    endTime: null,
    completedSessions: 0,
  };

  // Must not throw exceptions
  assert.doesNotThrow(() => {
    savePomodoroState(state, errorStorage);
  });

  assert.doesNotThrow(() => {
    const loaded = loadPomodoroState(errorStorage);
    assert.equal(loaded, null);
  });

  assert.doesNotThrow(() => {
    clearPomodoroState(errorStorage);
  });
});

/* ==========================================================================
   Phase 4 Edge Case Regression Tests
   ========================================================================== */

import { setupPersistence } from "../src/services/storage.ts";

test("Regression 19: Reset while idle with a changed remainingMs saves immediately", () => {
  const storage = new MemoryStorage();
  const partialMs = 20 * 60 * 1000;
  const controller = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: partialMs,
    initialStatus: "idle",
  });

  setupPersistence(controller, storage);

  // Calling reset while idle restores full 50:00 duration
  controller.reset();

  const saved = loadPomodoroState(storage);
  assert.ok(saved !== null, "State must be saved immediately upon reset while idle");
  assert.equal(saved.status, "idle");
  assert.equal(saved.remainingMs, FOCUS_DURATION_MS, "Saved remainingMs must match full 50 min duration");
  assert.equal(saved.phase, "focus");

  controller.dispose();
});

test("Regression 20: Restoring the saved state after reset while idle preserves full duration", () => {
  const storage = new MemoryStorage();
  const controller1 = new PomodoroController({
    initialPhase: "focus",
    initialRemainingMs: 15 * 60 * 1000,
    initialStatus: "idle",
  });

  setupPersistence(controller1, storage);
  controller1.reset();
  controller1.dispose();

  // Load the state saved after reset
  const saved = loadPomodoroState(storage);
  assert.ok(saved !== null);

  // Restore into a fresh controller
  const controller2 = new PomodoroController({
    initialPhase: saved.phase,
    initialRemainingMs: saved.remainingMs,
    initialStatus: saved.status,
    initialCompletedSessions: saved.completedSessions,
  });

  const state2 = controller2.getState();
  assert.equal(state2.phase, "focus");
  assert.equal(state2.status, "idle");
  assert.equal(state2.remainingMs, FOCUS_DURATION_MS);
  assert.equal(state2.completedSessions, 0);

  controller2.dispose();
});

test("Regression 21: Running countdown writes remain throttled (~1s)", async () => {
  const storage = new MemoryStorage();
  let setItemCallCount = 0;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key: string, value: string) => {
    setItemCallCount++;
    originalSetItem(key, value);
  };

  const controller = new PomodoroController({
    focusDurationMs: 5000,
    tickIntervalMs: 25, // Ticks every 25ms (40 ticks per second)
  });

  setupPersistence(controller, storage);
  assert.equal(setItemCallCount, 0, "No writes before action");

  // 1. START triggers immediate write
  controller.start();
  assert.equal(setItemCallCount, 1, "START must write immediately");

  // Wait 200ms (~8 ticks): should NOT write because < 1000ms has elapsed
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(setItemCallCount, 1, "Active ticks within 1s must remain throttled (no additional writes)");

  // Wait another 900ms (total > 1000ms from start)
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(setItemCallCount, 2, "Approximately 1s elapsed must trigger exactly 1 periodic write");

  // 2. PAUSE triggers immediate write
  controller.pause();
  assert.equal(setItemCallCount, 3, "PAUSE must write immediately");

  controller.dispose();
});
