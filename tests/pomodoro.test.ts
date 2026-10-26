/**
 * tests/pomodoro.test.ts
 *
 * Automated tests for Phase 3: Pomodoro Controller & Focus Hours Tracking.
 * Executed via Node's built-in test runner (node:test).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  PomodoroController,
  calculateFocusHours,
  FOCUS_DURATION_MS,
  BREAK_DURATION_MS,
} from "../src/core/pomodoro.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("Case 1: Initial phase is Focus", () => {
  const p = new PomodoroController();
  const state = p.getState();

  assert.equal(state.phase, "focus");
  assert.equal(state.status, "idle");
  p.dispose();
});

test("Case 2: Initial duration is 50 minutes", () => {
  const p = new PomodoroController();
  const state = p.getState();

  assert.equal(state.remainingMs, FOCUS_DURATION_MS);
  assert.equal(FOCUS_DURATION_MS, 50 * 60 * 1000);
  p.dispose();
});

test("Case 3: START begins Focus", () => {
  const p = new PomodoroController({
    focusDurationMs: 2000,
    tickIntervalMs: 20,
  });

  p.start();
  const state = p.getState();

  assert.equal(state.status, "running");
  assert.equal(state.phase, "focus");
  p.dispose();
});

test("Case 4: PAUSE freezes Focus countdown", async () => {
  const p = new PomodoroController({
    focusDurationMs: 2000,
    tickIntervalMs: 20,
  });

  p.start();
  await sleep(60);

  p.pause();
  const state = p.getState();

  assert.equal(state.status, "paused");
  assert.equal(state.phase, "focus");
  const frozenMs = state.remainingMs;
  assert.ok(frozenMs < 2000);

  await sleep(60);
  assert.equal(p.getState().remainingMs, frozenMs, "Remaining time must stay frozen");

  p.dispose();
});

test("Case 5: RESUME continues Focus without resetting duration", async () => {
  const p = new PomodoroController({
    focusDurationMs: 2000,
    tickIntervalMs: 20,
  });

  p.start();
  await sleep(60);

  p.pause();
  const pausedRemaining = p.getState().remainingMs;

  p.resume();
  assert.equal(p.getState().status, "running");
  assert.equal(p.getState().phase, "focus");

  await sleep(60);
  const resumedRemaining = p.getState().remainingMs;
  assert.ok(resumedRemaining < pausedRemaining, "Resumed timer must decrement from paused remaining time");

  p.dispose();
});

test("Case 6: RESET restores the current phase duration", async () => {
  const p = new PomodoroController({
    focusDurationMs: 2000,
    breakDurationMs: 1000,
    tickIntervalMs: 20,
  });

  p.start();
  await sleep(50);

  p.reset();
  assert.equal(p.getState().status, "idle");
  assert.equal(p.getState().remainingMs, 2000);
  assert.equal(p.getState().phase, "focus");

  // Verify reset in Break phase restores break duration
  p.switchPhase("break");
  assert.equal(p.getState().remainingMs, 1000);
  p.start();
  await sleep(50);
  p.reset();
  assert.equal(p.getState().status, "idle");
  assert.equal(p.getState().remainingMs, 1000);
  assert.equal(p.getState().phase, "break");

  p.dispose();
});

test("Case 7: Completed Focus increments completedSessions exactly once", async () => {
  const p = new PomodoroController({
    focusDurationMs: 40,
    breakDurationMs: 40,
    tickIntervalMs: 10,
  });

  assert.equal(p.getState().completedSessions, 0);
  p.start();

  await sleep(80);

  assert.equal(p.getState().completedSessions, 1, "Completed focus session must increment completedSessions by 1");
  p.dispose();
});

test("Case 8: Completed Focus transitions to Break", async () => {
  const p = new PomodoroController({
    focusDurationMs: 40,
    breakDurationMs: 40,
    tickIntervalMs: 10,
  });

  p.start();
  await sleep(80);

  const state = p.getState();
  assert.equal(state.phase, "break");
  assert.equal(state.status, "idle", "Break must not automatically start running");
  p.dispose();
});

test("Case 9: Break starts at 10 minutes", () => {
  const p = new PomodoroController();
  p.switchPhase("break");

  const state = p.getState();
  assert.equal(state.phase, "break");
  assert.equal(state.remainingMs, BREAK_DURATION_MS);
  assert.equal(BREAK_DURATION_MS, 10 * 60 * 1000);
  assert.equal(state.status, "idle");
  p.dispose();
});

test("Case 10: Break completion does not increment completedSessions", async () => {
  const p = new PomodoroController({
    focusDurationMs: 30,
    breakDurationMs: 30,
    tickIntervalMs: 10,
    initialPhase: "break",
    initialCompletedSessions: 2,
  });

  assert.equal(p.getState().completedSessions, 2);
  p.start();

  await sleep(70);

  assert.equal(p.getState().completedSessions, 2, "Break completion must not increment completed sessions");
  p.dispose();
});

test("Case 11: Break completion transitions back to Focus", async () => {
  const p = new PomodoroController({
    focusDurationMs: 30,
    breakDurationMs: 30,
    tickIntervalMs: 10,
    initialPhase: "break",
  });

  p.start();
  await sleep(70);

  const state = p.getState();
  assert.equal(state.phase, "focus");
  assert.equal(state.status, "idle", "Focus must not automatically start running");
  p.dispose();
});

test("Case 12: Repeated START does not create duplicate sessions", () => {
  const p = new PomodoroController({
    focusDurationMs: 5000,
    tickIntervalMs: 20,
  });

  p.start();
  const initialEndTime = p.getState().endTime;

  p.start();
  p.start();

  assert.equal(p.getState().status, "running");
  assert.equal(p.getState().endTime, initialEndTime);
  p.dispose();
});

test("Case 13: Resetting an incomplete Focus does not award hours", async () => {
  const p = new PomodoroController({
    focusDurationMs: 1000,
    tickIntervalMs: 20,
  });

  p.start();
  await sleep(50);

  p.reset();
  assert.equal(p.getState().completedSessions, 0, "Partial or reset session must not award hours");
  assert.equal(p.getState().phase, "focus");
  p.dispose();
});

test("Case 14: Pausing does not award hours", async () => {
  const p = new PomodoroController({
    focusDurationMs: 1000,
    tickIntervalMs: 20,
  });

  p.start();
  await sleep(50);

  p.pause();
  assert.equal(p.getState().completedSessions, 0, "Paused session must not award hours");
  p.dispose();
});

test("Case 15: Reentrant completion cannot award duplicate hours", async () => {
  const p = new PomodoroController({
    focusDurationMs: 30,
    breakDurationMs: 30,
    tickIntervalMs: 10,
  });

  let reentrantAttempted = false;
  p.subscribe((state) => {
    if (!reentrantAttempted && state.phase === "break") {
      reentrantAttempted = true;
      p.reset();
    }
  });

  p.start();
  await sleep(70);

  assert.equal(p.getState().completedSessions, 1, "Session count must strictly remain 1");
  p.dispose();
});

test("Case 16: State subscribers receive correct phase and hour updates", async () => {
  const p = new PomodoroController({
    focusDurationMs: 40,
    breakDurationMs: 20,
    tickIntervalMs: 10,
  });

  const phasesObserved: string[] = [];
  const hoursObserved: number[] = [];

  p.subscribe((state) => {
    phasesObserved.push(state.phase);
    hoursObserved.push(state.completedSessions);
  });

  p.start();
  await sleep(80);

  assert.ok(phasesObserved.includes("focus"), "Must observe focus phase");
  assert.ok(phasesObserved.includes("break"), "Must observe break phase");
  assert.ok(hoursObserved.includes(1), "Must observe 1 focus hour after focus completion");

  p.dispose();
});

test("Case 17: Disposing the controller stops the timer and subscriptions", async () => {
  const p = new PomodoroController({
    focusDurationMs: 40,
    tickIntervalMs: 10,
  });

  let notificationsAfterDispose = 0;
  p.subscribe(() => {
    notificationsAfterDispose++;
  });

  p.start();
  await sleep(25);

  const countBeforeDispose = notificationsAfterDispose;
  assert.ok(countBeforeDispose > 0);

  p.dispose();
  await sleep(60);

  assert.equal(
    notificationsAfterDispose,
    countBeforeDispose,
    "No notifications should be received after dispose"
  );
});

test("Focus Hour Calculation: calculateFocusHours handles valid and edge cases", () => {
  assert.equal(calculateFocusHours(0), 0);
  assert.equal(calculateFocusHours(1), 1);
  assert.equal(calculateFocusHours(5), 5);
  assert.equal(calculateFocusHours(-1), 0);
  assert.equal(calculateFocusHours(NaN), 0);
  assert.equal(calculateFocusHours(Infinity), 0);
  assert.equal(calculateFocusHours(1.9), 1);
});

/* ==========================================================================
   State Notification Reentrancy Regression Tests
   ========================================================================== */

test("Reentrancy Regression: subscriber calling reset() receives updated state matching getState()", async () => {
  const p = new PomodoroController({
    focusDurationMs: 5000,
    tickIntervalMs: 20,
  });

  const receivedStates: import("../src/types.ts").AppState[] = [];
  let resetCalled = false;

  p.subscribe((state) => {
    receivedStates.push(state);
    if (!resetCalled && state.status === "running") {
      resetCalled = true;
      p.reset();
    }
  });

  p.start();
  await sleep(60);

  assert.ok(resetCalled, "Subscriber should have invoked reset() reentrantly");
  const lastReceivedState = receivedStates[receivedStates.length - 1];
  assert.equal(lastReceivedState.status, "idle");
  assert.equal(lastReceivedState.remainingMs, 5000);
  assert.deepEqual(lastReceivedState, p.getState(), "Final emitted state must match p.getState()");

  p.dispose();
});

test("Reentrancy Regression: subscriber calling start() receives updated state matching getState()", async () => {
  const p = new PomodoroController({
    focusDurationMs: 5000,
    tickIntervalMs: 20,
  });

  const receivedStates: import("../src/types.ts").AppState[] = [];
  let startCalled = false;

  p.subscribe((state) => {
    receivedStates.push(state);
    if (!startCalled && state.status === "idle") {
      startCalled = true;
      p.start();
    }
  });

  p.reset();
  await sleep(40);

  assert.ok(startCalled, "Subscriber should have invoked start() reentrantly");
  const lastReceivedState = receivedStates[receivedStates.length - 1];
  assert.equal(lastReceivedState.status, "running");
  assert.equal(lastReceivedState.phase, "focus");
  assert.equal(lastReceivedState.endTime, p.getState().endTime);
  assert.equal(lastReceivedState.completedSessions, p.getState().completedSessions);
  assert.ok(
    Math.abs(lastReceivedState.remainingMs - p.getState().remainingMs) < 30,
    "Emitted remainingMs must match running getState() within timer resolution"
  );

  p.dispose();
});

test("Reentrancy Regression: subscriber calling switchPhase() receives updated state matching getState()", async () => {
  const p = new PomodoroController({
    focusDurationMs: 5000,
    breakDurationMs: 2000,
    tickIntervalMs: 20,
  });

  const receivedStates: import("../src/types.ts").AppState[] = [];
  let switched = false;

  p.subscribe((state) => {
    receivedStates.push(state);
    if (!switched && state.phase === "focus") {
      switched = true;
      p.switchPhase("break");
    }
  });

  p.reset();
  await sleep(60);

  assert.ok(switched, "Subscriber should have invoked switchPhase() reentrantly");
  const lastReceivedState = receivedStates[receivedStates.length - 1];
  assert.equal(lastReceivedState.phase, "break");
  assert.equal(lastReceivedState.remainingMs, 2000);
  assert.deepEqual(lastReceivedState, p.getState(), "Final emitted state must match p.getState()");

  p.dispose();
});

test("Reentrancy Regression: subscriber unsubscription during notification is handled safely", async () => {
  const p = new PomodoroController({
    focusDurationMs: 5000,
    tickIntervalMs: 20,
  });

  let sub2Calls = 0;
  let unsub2: () => void = () => {};

  p.subscribe(() => {
    unsub2();
  });

  unsub2 = p.subscribe(() => {
    sub2Calls++;
  });

  p.start();
  await sleep(40);

  assert.equal(sub2Calls, 0, "Unsubscribed listener must not receive notifications");
  p.dispose();
});
