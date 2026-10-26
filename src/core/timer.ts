/**
 * src/core/timer.ts
 *
 * Timer Engine Module.
 *
 * Architectural Responsibilities:
 * - Independent calculation of remaining countdown time based on system timestamps (performance.now / Date.now).
 * - Avoid relying on counting setInterval ticks to prevent timer drift.
 * - Manage timer execution lifecycle:
 *   - Start: Initiate a timestamp-based countdown with a specified target duration.
 *   - Pause: Freeze countdown and preserve exact remaining duration.
 *   - Resume: Recalculate new end timestamp from preserved remaining duration.
 *   - Reset: Clear active intervals and reset remaining time to initial duration.
 * - Accurate completion detection and dispatching completion callbacks.
 * - Completely decoupled from the DOM and presentation layer.
 *
 * Note: Full implementation will be added in subsequent phases.
 */

import type { TimerStatus } from "../types";

export type TimerTickCallback = (remainingMs: number) => void;
export type TimerCompleteCallback = () => void;

export interface TimerEngineOptions {
  durationMs: number;
  onTick?: TimerTickCallback;
  onComplete?: TimerCompleteCallback;
}

export interface ITimerEngine {
  readonly status: TimerStatus;
  readonly remainingMs: number;
  readonly endTime: number | null;

  start(durationMs?: number): void;
  pause(): void;
  resume(): void;
  reset(durationMs?: number): void;
}
