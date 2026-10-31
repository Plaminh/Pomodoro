import test from "node:test";
import assert from "node:assert/strict";
import { PomodoroController, FOCUS_DURATION_MS } from "../src/core/pomodoro.ts";
import { renderState, type AppElements } from "../src/ui.ts";
import { loadPomodoroState, setupPersistence } from "../src/services/storage.ts";
import { importBackupFile } from "../src/services/backup.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function makeElements(skipButton: { hidden: boolean }): AppElements {
  return {
    timerDisplay: null,
    phaseLabel: null,
    focusHours: null,
    btnStart: null,
    btnPause: null,
    btnReset: null,
    btnSkipBreak: skipButton as HTMLButtonElement,
    bgUpload: null,
    btnChangeBg: null,
    btnRemoveBg: null,
    backupImport: null,
    btnExportBackup: null,
    btnImportBackup: null,
  };
}

test("Skip Break while running cancels the timer and returns to idle Focus", async () => {
  const controller = new PomodoroController({
    initialPhase: "break",
    breakDurationMs: 200,
    tickIntervalMs: 10,
  });
  controller.start();
  await sleep(20);
  controller.skipBreak();

  assert.deepEqual(
    { phase: controller.getState().phase, status: controller.getState().status },
    { phase: "focus", status: "idle" },
  );
  assert.equal(controller.getState().remainingMs, FOCUS_DURATION_MS);
  controller.dispose();
});

test("Skip Break works while paused and idle", () => {
  for (const status of ["paused", "idle"] as const) {
    const controller = new PomodoroController({
      initialPhase: "break",
      initialRemainingMs: 1234,
      initialStatus: status,
      initialCompletedSessions: 4,
    });
    controller.skipBreak();
    const state = controller.getState();
    assert.equal(state.phase, "focus");
    assert.equal(state.status, "idle");
    assert.equal(state.remainingMs, FOCUS_DURATION_MS);
    assert.equal(state.completedSessions, 4);
    controller.dispose();
  }
});

test("Skip Break during Focus is a safe no-op", () => {
  const controller = new PomodoroController({
    initialRemainingMs: 1234,
    initialStatus: "paused",
    initialCompletedSessions: 3,
  });
  const before = controller.getState();
  controller.skipBreak();
  assert.deepEqual(controller.getState(), before);
  controller.dispose();
});

test("Skip Break cancels stale Break completion and awards no duplicate credit", async () => {
  const controller = new PomodoroController({
    initialPhase: "break",
    initialCompletedSessions: 2,
    breakDurationMs: 35,
    tickIntervalMs: 5,
  });
  controller.start();
  await sleep(10);
  controller.skipBreak();
  await sleep(70);

  const state = controller.getState();
  assert.equal(state.phase, "focus");
  assert.equal(state.status, "idle");
  assert.equal(state.remainingMs, FOCUS_DURATION_MS);
  assert.equal(state.completedSessions, 2);
  controller.dispose();
});

test("Skip Break persists immediately and refresh restores full idle Focus", () => {
  const storage = new MemoryStorage();
  const controller = new PomodoroController({
    initialPhase: "break",
    initialStatus: "paused",
    initialRemainingMs: 1000,
    initialCompletedSessions: 5,
  });
  setupPersistence(controller, storage);
  controller.skipBreak();

  const saved = loadPomodoroState(storage);
  assert.deepEqual(saved, {
    version: 1,
    phase: "focus",
    remainingMs: FOCUS_DURATION_MS,
    completedSessions: 5,
    status: "idle",
  });

  const refreshed = new PomodoroController({
    initialPhase: saved!.phase,
    initialRemainingMs: saved!.remainingMs,
    initialCompletedSessions: saved!.completedSessions,
    initialStatus: saved!.status,
  });
  assert.equal(refreshed.getState().phase, "focus");
  assert.equal(refreshed.getState().remainingMs, FOCUS_DURATION_MS);
  assert.equal(refreshed.getState().status, "idle");
  controller.dispose();
  refreshed.dispose();
});

test("Skip Break button is hidden in Focus and visible in Break", () => {
  const button = { hidden: false };
  const elements = makeElements(button);
  const controller = new PomodoroController();

  renderState(elements, controller.getState());
  assert.equal(button.hidden, true);
  controller.switchPhase("break");
  renderState(elements, controller.getState());
  assert.equal(button.hidden, false);
  controller.dispose();
});

test("Skip Break button visibility updates after JSON import", async () => {
  const storage = new MemoryStorage();
  const button = { hidden: true };
  const elements = makeElements(button);
  const controller = new PomodoroController();
  controller.subscribe((state) => renderState(elements, state));

  const backup = new Blob([JSON.stringify({
    app: "pomodoro-lite",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { phase: "break", remainingMs: 1000, completedSessions: 1, status: "idle" },
  })], { type: "application/json" });
  const result = await importBackupFile(backup, controller, {
    storage,
    confirm: () => true,
  });

  assert.equal(result.success, true);
  assert.equal(button.hidden, false);
  controller.dispose();
});
