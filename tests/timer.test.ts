/**
 * tests/timer.test.ts
 *
 * Automated tests for Phase 2: Timestamp-Based Timer Engine.
 * Executed via Node's built-in test runner (node:test).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { TimerEngine, formatTimeMMSS } from "../src/core/timer.ts";

const FOCUS_DURATION_MS = 50 * 60 * 1000; // 3,000,000 ms

test("Case 1: Initial display and remaining time is 50:00", () => {
  const timer = new TimerEngine({ durationMs: FOCUS_DURATION_MS });

  assert.equal(timer.getStatus(), "idle");
  assert.equal(timer.getRemainingMs(), FOCUS_DURATION_MS);
  assert.equal(formatTimeMMSS(timer.getRemainingMs()), "50:00");

  // Math.ceil prevents immediate jump: 2,999,900 ms should still display 50:00
  assert.equal(formatTimeMMSS(2999900), "50:00");
  assert.equal(formatTimeMMSS(2999001), "50:00");
  // Only drops to 49:59 once a full second has passed
  assert.equal(formatTimeMMSS(2998999), "49:59");

  timer.dispose();
});

test("Case 2: Start begins countdown and updates status", async () => {
  const timer = new TimerEngine({
    durationMs: 5000,
    tickIntervalMs: 25,
  });

  assert.equal(timer.getStatus(), "idle");
  timer.start();

  assert.equal(timer.getStatus(), "running");
  assert.ok(timer.endTime !== null);
  assert.ok(timer.endTime > Date.now());

  // Wait 100ms and check elapsed
  await new Promise((resolve) => setTimeout(resolve, 100));

  const remaining = timer.getRemainingMs();
  assert.ok(remaining < 5000, `Expected remaining (${remaining}) to be less than 5000`);
  assert.ok(remaining > 4500, `Expected remaining (${remaining}) to be greater than 4500`);

  timer.dispose();
});

test("Case 3: Pause freezes countdown and preserves exact remaining time", async () => {
  const timer = new TimerEngine({
    durationMs: 5000,
    tickIntervalMs: 25,
  });

  timer.start();
  await new Promise((resolve) => setTimeout(resolve, 100));

  timer.pause();
  assert.equal(timer.getStatus(), "paused");
  assert.equal(timer.endTime, null);

  const frozenRemaining = timer.getRemainingMs();
  assert.ok(frozenRemaining < 5000);

  // Wait 100ms while paused
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(
    timer.getRemainingMs(),
    frozenRemaining,
    "Remaining time must remain strictly frozen during pause"
  );
  assert.equal(timer.getStatus(), "paused");

  timer.dispose();
});

test("Case 4: Resume continues from remaining time without restarting duration", async () => {
  const timer = new TimerEngine({
    durationMs: 5000,
    tickIntervalMs: 25,
  });

  timer.start();
  await new Promise((resolve) => setTimeout(resolve, 120));

  timer.pause();
  const pausedRemaining = timer.getRemainingMs();
  assert.ok(pausedRemaining <= 4900, "Should have decremented before pause");

  timer.resume();
  assert.equal(timer.getStatus(), "running");

  // Verify it did not restart the original 5000ms duration
  const resumedRemaining = timer.getRemainingMs();
  assert.ok(
    resumedRemaining <= pausedRemaining,
    "Resumed timer must continue from paused remaining time"
  );
  assert.ok(resumedRemaining < 4950, "Timer must not have restarted to 5000ms");

  timer.dispose();
});

test("Case 5: Reset restores 50:00 and sets status to idle without triggering completion", async () => {
  let completeCalled = false;
  const timer = new TimerEngine({
    durationMs: FOCUS_DURATION_MS,
    tickIntervalMs: 25,
    onComplete: () => {
      completeCalled = true;
    },
  });

  timer.start();
  await new Promise((resolve) => setTimeout(resolve, 60));

  timer.reset();

  assert.equal(timer.getStatus(), "idle");
  assert.equal(timer.getRemainingMs(), FOCUS_DURATION_MS);
  assert.equal(formatTimeMMSS(timer.getRemainingMs()), "50:00");
  assert.equal(completeCalled, false, "Reset must not trigger completion");

  timer.dispose();
});

test("Case 6: Repeated Start does not create multiple intervals or push endTime forward", async () => {
  const timer = new TimerEngine({
    durationMs: 5000,
    tickIntervalMs: 25,
  });

  timer.start();
  const initialEndTime = timer.endTime;

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Call start multiple times while already running
  timer.start();
  timer.start();

  assert.equal(timer.getStatus(), "running");
  assert.equal(
    timer.endTime,
    initialEndTime,
    "Repeated start calls while running must not alter endTime"
  );

  timer.dispose();
});

test("Case 7: Timer never displays or returns negative time", () => {
  assert.equal(formatTimeMMSS(0), "00:00");
  assert.equal(formatTimeMMSS(-1), "00:00");
  assert.equal(formatTimeMMSS(-50000), "00:00");

  const timer = new TimerEngine({ durationMs: 0 });
  assert.equal(timer.getRemainingMs(), 0);
  assert.equal(formatTimeMMSS(timer.getRemainingMs()), "00:00");

  timer.dispose();
});

test("Case 8: Completion callback fires exactly once when countdown finishes", async () => {
  let completionCount = 0;
  const timer = new TimerEngine({
    durationMs: 80,
    tickIntervalMs: 15,
    onComplete: () => {
      completionCount++;
    },
  });

  timer.start();

  // Wait long enough for completion and extra ticks
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.equal(completionCount, 1, "Completion callback must fire exactly once");
  assert.equal(timer.getStatus(), "idle");
  assert.equal(timer.getRemainingMs(), 0);
  assert.equal(formatTimeMMSS(timer.getRemainingMs()), "00:00");

  timer.dispose();
});

test("Case 9: Delayed interval callbacks do not cause timer drift", () => {
  const timer = new TimerEngine({
    durationMs: 10000,
    tickIntervalMs: 1000,
  });

  // Temporarily mock Date.now to simulate interval delay
  const originalNow = Date.now;
  let simulatedTime = 1_000_000;

  try {
    Date.now = () => simulatedTime;
    timer.start();

    // Verify initial calculation
    assert.equal(timer.getRemainingMs(), 10000);

    // Simulate 4.5 seconds passing with zero intermediate setInterval ticks
    simulatedTime += 4500;

    // Direct timestamp calculation reflects 4.5s elapsed without drift
    assert.equal(timer.getRemainingMs(), 5500);
    assert.equal(formatTimeMMSS(timer.getRemainingMs()), "00:06");

    // Simulate another 3 seconds passing
    simulatedTime += 3000;
    assert.equal(timer.getRemainingMs(), 2500);
    assert.equal(formatTimeMMSS(timer.getRemainingMs()), "00:03");
  } finally {
    Date.now = originalNow;
    timer.dispose();
  }
});

test("Case 10: Disposing the timer stops all updates and clears subscriptions", async () => {
  let tickCount = 0;
  let completeCount = 0;

  const timer = new TimerEngine({
    durationMs: 80,
    tickIntervalMs: 15,
    onTick: () => {
      tickCount++;
    },
    onComplete: () => {
      completeCount++;
    },
  });

  timer.start();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const ticksBeforeDispose = tickCount;
  assert.ok(ticksBeforeDispose > 0);

  timer.dispose();
  assert.equal(timer.getStatus(), "idle");

  // Wait additional time; verify no new ticks or completion occur
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(tickCount, ticksBeforeDispose, "Ticks must stop completely after dispose");
  assert.equal(completeCount, 0, "Disposed timer must not fire completion");
});

test("Subscription API: subscribe and onComplete return unsubscription functions", async () => {
  const timer = new TimerEngine({
    durationMs: 100,
    tickIntervalMs: 20,
  });

  let customTickCount = 0;
  const unsubscribeTick = timer.subscribe(() => {
    customTickCount++;
  });

  timer.start();
  await new Promise((resolve) => setTimeout(resolve, 45));

  const countAtUnsubscribe = customTickCount;
  assert.ok(countAtUnsubscribe > 0);

  // Unsubscribe
  unsubscribeTick();

  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(
    customTickCount,
    countAtUnsubscribe,
    "Unsubscribed listener must not receive further ticks"
  );

  timer.dispose();
});

/* ==========================================================================
   Lifecycle Correctness & Reentrancy Regression Tests
   ========================================================================== */

test("Regression 1: Tick callback calling pause() during initial start() leaves no active interval", async () => {
  let timerRef: TimerEngine | null = null;
  timerRef = new TimerEngine({
    durationMs: 5000,
    tickIntervalMs: 20,
    onTick: () => {
      // Pause immediately inside the first tick
      timerRef?.pause();
    },
  });

  timerRef.start();

  assert.equal(timerRef.getStatus(), "paused");
  assert.equal(timerRef.hasActiveInterval, false, "Interval must be stopped after pause in onTick");

  // Wait to ensure no delayed interval is active
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(timerRef.hasActiveInterval, false);
  assert.equal(timerRef.getStatus(), "paused");

  timerRef.dispose();
});

test("Regression 2: Tick callback calling reset() during initial start() leaves no active interval", async () => {
  let timerRef: TimerEngine | null = null;
  let callCount = 0;

  timerRef = new TimerEngine({
    durationMs: 5000,
    tickIntervalMs: 20,
    onTick: () => {
      callCount++;
      if (callCount === 1) {
        timerRef?.reset();
      }
    },
  });

  timerRef.start();

  assert.equal(timerRef.getStatus(), "idle");
  assert.equal(timerRef.hasActiveInterval, false, "Interval must be stopped after reset in onTick");
  assert.equal(timerRef.getRemainingMs(), 5000);

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(timerRef.hasActiveInterval, false);

  timerRef.dispose();
});

test("Regression 3: Tick callback calling dispose() during initial start() leaves no active interval", async () => {
  let timerRef: TimerEngine | null = null;

  timerRef = new TimerEngine({
    durationMs: 5000,
    tickIntervalMs: 20,
    onTick: () => {
      timerRef?.dispose();
    },
  });

  timerRef.start();

  assert.equal(timerRef.hasActiveInterval, false, "Interval must be stopped after dispose in onTick");

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(timerRef.hasActiveInterval, false);
});

test("Regression 4: Tick callback calling pause() during active countdown stops interval cleanly", async () => {
  const timer = new TimerEngine({
    durationMs: 200,
    tickIntervalMs: 15,
  });

  let paused = false;
  timer.subscribe((remainingMs) => {
    if (!paused && remainingMs < 180) {
      paused = true;
      timer.pause();
    }
  });

  timer.start();
  await new Promise((resolve) => setTimeout(resolve, 70));

  assert.equal(timer.getStatus(), "paused");
  assert.equal(timer.hasActiveInterval, false, "Active interval must be stopped when paused from interval tick");

  const remainingAfterPause = timer.getRemainingMs();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(timer.getRemainingMs(), remainingAfterPause, "Time must not change while paused");

  timer.dispose();
});

test("Regression 5: Tick callback calling reset() during active countdown stops interval cleanly", async () => {
  const timer = new TimerEngine({
    durationMs: 200,
    tickIntervalMs: 15,
  });

  let resetDone = false;
  timer.subscribe((remainingMs) => {
    if (!resetDone && remainingMs < 180) {
      resetDone = true;
      timer.reset();
    }
  });

  timer.start();
  await new Promise((resolve) => setTimeout(resolve, 70));

  assert.equal(timer.getStatus(), "idle");
  assert.equal(timer.hasActiveInterval, false, "Active interval must be stopped after reset in interval tick");
  assert.equal(timer.getRemainingMs(), 200);

  timer.dispose();
});

test("Regression 6: Completion callback can safely start a new timer without state corruption", async () => {
  let secondSessionStarted = false;
  const timer = new TimerEngine({
    durationMs: 40,
    tickIntervalMs: 10,
    onComplete: () => {
      secondSessionStarted = true;
      timer.start(5000);
    },
  });

  timer.start();

  // Wait for the first countdown to complete (40ms) and trigger onComplete
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.ok(secondSessionStarted, "Completion callback must have been executed");
  assert.equal(timer.getStatus(), "running", "Timer must transition to running for the new session");
  assert.equal(timer.hasActiveInterval, true, "New session must have an active interval");
  assert.ok(timer.getRemainingMs() <= 5000 && timer.getRemainingMs() > 4700);

  timer.dispose();
  assert.equal(timer.hasActiveInterval, false);
});

test("Regression 7: Completion callback can safely reset the timer", async () => {
  let resetInComplete = false;
  const timer = new TimerEngine({
    durationMs: 40,
    tickIntervalMs: 10,
    onComplete: () => {
      resetInComplete = true;
      timer.reset(10000);
    },
  });

  timer.start();

  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.ok(resetInComplete, "Completion callback must have been executed");
  assert.equal(timer.getStatus(), "idle", "Timer must be idle after reset in onComplete");
  assert.equal(timer.hasActiveInterval, false, "Interval must be stopped");
  assert.equal(timer.getRemainingMs(), 10000);

  // Wait extra time to ensure no residual interval fires
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(timer.hasActiveInterval, false);

  timer.dispose();
});

test("Regression 8: Tick callback calling pause() during resume() leaves no active interval", async () => {
  const timer = new TimerEngine({
    durationMs: 5000,
    tickIntervalMs: 20,
  });

  timer.start();
  timer.pause();
  assert.equal(timer.getStatus(), "paused");
  assert.equal(timer.hasActiveInterval, false);

  let shouldPauseOnTick = true;
  timer.subscribe(() => {
    if (shouldPauseOnTick) {
      shouldPauseOnTick = false;
      timer.pause();
    }
  });

  timer.resume();

  assert.equal(timer.getStatus(), "paused");
  assert.equal(timer.hasActiveInterval, false, "Interval must not be left active after pause in resume onTick");

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(timer.hasActiveInterval, false);

  timer.dispose();
});

test("Regression 9: onTick(0) calling reset() cancels completion callback", async () => {
  let completionFired = false;
  const timer = new TimerEngine({
    durationMs: 40,
    tickIntervalMs: 10,
    onTick: (remainingMs) => {
      if (remainingMs === 0) {
        timer.reset(5000);
      }
    },
    onComplete: () => {
      completionFired = true;
    },
  });

  timer.start();
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(completionFired, false, "Resetting during onTick(0) must cancel stale completion");
  assert.equal(timer.getStatus(), "idle");
  assert.equal(timer.getRemainingMs(), 5000);
  assert.equal(timer.hasActiveInterval, false);

  timer.dispose();
});

test("Regression 10: onTick(0) calling start() does not trigger stale completion on new session", async () => {
  let completionCallCount = 0;
  const timer = new TimerEngine({
    durationMs: 40,
    tickIntervalMs: 10,
    onTick: (remainingMs) => {
      if (remainingMs === 0) {
        timer.start(5000);
      }
    },
    onComplete: () => {
      completionCallCount++;
    },
  });

  timer.start();
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(completionCallCount, 0, "Starting new session from onTick(0) must not fire stale completion");
  assert.equal(timer.getStatus(), "running");
  assert.ok(timer.getRemainingMs() <= 5000 && timer.getRemainingMs() > 4700);
  assert.equal(timer.hasActiveInterval, true);

  timer.dispose();
});
