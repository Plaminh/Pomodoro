/**
 * src/core/timer.ts
 *
 * Reusable Timestamp-Based Timer Engine.
 *
 * Architectural Features:
 * - Independent calculation of remaining time based on Date.now() timestamps.
 * - Immune to timer drift from throttled or delayed setInterval callbacks.
 * - Decoupled from the DOM and presentation layer.
 * - Handles start, pause, resume, reset, remaining time calculation,
 *   completion detection, and subscription to updates.
 * - Robust reentrancy protection: safe to call pause(), reset(), or start()
 *   inside tick or completion callbacks without interval leaks, duplicate
 *   completions, or state corruption across sessions.
 */

import type { TimerStatus } from "../types.ts";

export type TimerTickCallback = (remainingMs: number) => void;
export type TimerCompleteCallback = () => void;

export interface TimerEngineOptions {
  durationMs: number;
  initialRemainingMs?: number;
  initialStatus?: "idle" | "paused";
  tickIntervalMs?: number;
  onTick?: TimerTickCallback;
  onComplete?: TimerCompleteCallback;
}

export interface ITimerEngine {
  readonly status: TimerStatus;
  readonly remainingMs: number;
  readonly endTime: number | null;
  readonly hasActiveInterval?: boolean;

  start(durationMs?: number): void;
  pause(): void;
  resume(): void;
  reset(durationMs?: number): void;
  getRemainingMs(): number;
  getStatus(): TimerStatus;
  dispose(): void;
  subscribe(listener: TimerTickCallback): () => void;
  onComplete(listener: TimerCompleteCallback): () => void;
}

/**
 * Formats a duration in milliseconds into MM:SS format.
 * Uses Math.ceil(remainingMs / 1000) so that 50:00 does not immediately jump to 49:59.
 */
export function formatTimeMMSS(remainingMs: number): string {
  const safeMs = Math.max(0, remainingMs);
  const totalSeconds = Math.max(0, Math.ceil(safeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export class TimerEngine implements ITimerEngine {
  private durationMs: number;
  private readonly tickIntervalMs: number;
  private _status: TimerStatus = "idle";
  private _remainingMs: number;
  private _endTime: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private completedFired = false;
  private isDisposed = false;
  private sessionId = 0;

  private readonly tickListeners = new Set<TimerTickCallback>();
  private readonly completeListeners = new Set<TimerCompleteCallback>();

  constructor(options: TimerEngineOptions) {
    this.durationMs = Math.max(0, options.durationMs);
    this.tickIntervalMs = options.tickIntervalMs ?? 100;
    this._status = options.initialStatus ?? "idle";
    this._remainingMs = options.initialRemainingMs !== undefined
      ? Math.max(0, options.initialRemainingMs)
      : this.durationMs;

    if (options.onTick) {
      this.tickListeners.add(options.onTick);
    }
    if (options.onComplete) {
      this.completeListeners.add(options.onComplete);
    }
  }

  get status(): TimerStatus {
    return this._status;
  }

  getStatus(): TimerStatus {
    return this._status;
  }

  get remainingMs(): number {
    return this.getRemainingMs();
  }

  get endTime(): number | null {
    return this._endTime;
  }

  get hasActiveInterval(): boolean {
    return this.intervalId !== null;
  }

  /**
   * Returns remaining milliseconds.
   * Dynamically calculated from Date.now() when running to prevent drift.
   */
  getRemainingMs(): number {
    if (this._status === "running" && this._endTime !== null) {
      return Math.max(0, this._endTime - Date.now());
    }
    return this._remainingMs;
  }

  /**
   * Starts a countdown using the configured duration.
   * Ignores repeated start calls while already running.
   */
  start(durationMs?: number): void {
    if (this.isDisposed || this._status === "running") {
      return;
    }

    this.sessionId++;
    const currentSession = this.sessionId;

    if (durationMs !== undefined && durationMs >= 0) {
      this.durationMs = durationMs;
    }

    this._remainingMs = this.durationMs;
    this.completedFired = false;

    if (this._remainingMs <= 0) {
      this.stopInterval();
      this._remainingMs = 0;
      this._endTime = null;
      this._status = "idle";
      this.notifyTick(0);
      if (this.sessionId === currentSession && !this.completedFired) {
        this.completedFired = true;
        this.triggerCompletion();
      }
      return;
    }

    this._endTime = Date.now() + this._remainingMs;
    this._status = "running";
    this.startInterval();
    this.notifyTick(this._remainingMs);

    // Reentrancy guard: if a tick callback paused, reset, or disposed during notifyTick
    if (this.isDisposed || (this._status as TimerStatus) !== "running") {
      this.stopInterval();
    }
  }

  /**
   * Pauses the countdown and freezes exact remaining time.
   */
  pause(): void {
    if (this.isDisposed || this._status !== "running") {
      return;
    }

    this.stopInterval();

    const now = Date.now();
    const remaining = this._endTime !== null ? Math.max(0, this._endTime - now) : this._remainingMs;
    this._remainingMs = remaining;
    this._endTime = null;

    if (remaining <= 0) {
      const currentSession = this.sessionId;
      this._remainingMs = 0;
      this._status = "idle";
      this.notifyTick(0);
      if (this.sessionId === currentSession && !this.completedFired) {
        this.completedFired = true;
        this.triggerCompletion();
      }
      return;
    }

    this._status = "paused";
    this.notifyTick(this._remainingMs);
  }

  /**
   * Continues the countdown from the saved remaining time.
   * Ignores resume calls if already running or not paused.
   */
  resume(): void {
    if (this.isDisposed || this._status === "running" || this._status !== "paused") {
      return;
    }

    if (this._remainingMs <= 0) {
      const currentSession = this.sessionId;
      this.stopInterval();
      this._remainingMs = 0;
      this._endTime = null;
      this._status = "idle";
      this.notifyTick(0);
      if (this.sessionId === currentSession && !this.completedFired) {
        this.completedFired = true;
        this.triggerCompletion();
      }
      return;
    }

    this._endTime = Date.now() + this._remainingMs;
    this._status = "running";
    this.startInterval();
    this.notifyTick(this._remainingMs);

    // Reentrancy guard: if a tick callback paused, reset, or disposed during notifyTick
    if (this.isDisposed || (this._status as TimerStatus) !== "running") {
      this.stopInterval();
    }
  }

  /**
   * Stops the countdown and restores the configured duration.
   * Status resets to idle and does not trigger completion.
   */
  reset(durationMs?: number): void {
    if (this.isDisposed) {
      return;
    }

    this.sessionId++;
    this.stopInterval();

    if (durationMs !== undefined && durationMs >= 0) {
      this.durationMs = durationMs;
    }

    this._remainingMs = this.durationMs;
    this._endTime = null;
    this._status = "idle";
    this.completedFired = false;
    this.notifyTick(this._remainingMs);
  }

  /**
   * Subscribes a listener to tick updates.
   * Returns an unsubscribe function.
   */
  subscribe(listener: TimerTickCallback): () => void {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  /**
   * Subscribes a listener to completion events.
   * Returns an unsubscribe function.
   */
  onComplete(listener: TimerCompleteCallback): () => void {
    this.completeListeners.add(listener);
    return () => {
      this.completeListeners.delete(listener);
    };
  }

  /**
   * Disposes the timer, stops any active interval, and clears all subscriptions.
   */
  dispose(): void {
    this.sessionId++;
    this.stopInterval();
    this.tickListeners.clear();
    this.completeListeners.clear();
    this._endTime = null;
    this._status = "idle";
    this.isDisposed = true;
  }

  private tick(): void {
    if (this.isDisposed || this._status !== "running" || this._endTime === null) {
      this.stopInterval();
      return;
    }

    const now = Date.now();
    const remaining = Math.max(0, this._endTime - now);
    this._remainingMs = remaining;

    if (remaining <= 0) {
      const currentSession = this.sessionId;
      this.stopInterval();
      this._remainingMs = 0;
      this._endTime = null;
      this._status = "idle";

      this.notifyTick(0);

      if (this.sessionId === currentSession && !this.completedFired) {
        this.completedFired = true;
        this.triggerCompletion();
      }
    } else {
      this.notifyTick(remaining);

      // Reentrancy guard: if a tick listener paused, reset, or disposed during this tick
      if (this.isDisposed || (this._status as TimerStatus) !== "running") {
        this.stopInterval();
      }
    }
  }

  private triggerCompletion(): void {
    const dispatchSession = this.sessionId;
    const listeners = Array.from(this.completeListeners);
    for (const listener of listeners) {
      if (this.isDisposed) {
        break;
      }
      if (!this.completeListeners.has(listener)) {
        continue;
      }
      try {
        listener();
      } catch (err) {
        console.error("[TimerEngine] Error in completion listener:", err);
      }
      // If a completion listener started a new session or disposed the timer,
      // subsequent listeners for the old completed session shouldn't corrupt the new session
      if (this.sessionId !== dispatchSession) {
        break;
      }
    }
  }

  private notifyTick(remainingMs: number): void {
    const listeners = Array.from(this.tickListeners);
    for (const listener of listeners) {
      if (this.isDisposed) {
        break;
      }
      if (!this.tickListeners.has(listener)) {
        continue;
      }
      try {
        listener(remainingMs);
      } catch (err) {
        console.error("[TimerEngine] Error in tick listener:", err);
      }
    }
  }

  private startInterval(): void {
    this.stopInterval();
    if (this.isDisposed || this._status !== "running") {
      return;
    }
    this.intervalId = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
