/**
 * src/core/pomodoro.ts
 *
 * Pomodoro Controller Module.
 *
 * Architectural Responsibilities:
 * - Manage Pomodoro phases (Focus phase: 50 minutes, Break phase: 10 minutes).
 * - Orchestrate transitions between Focus and Break phases.
 * - Track completed Focus sessions (each completed 50-minute focus session = exactly 1 Focus Hour).
 * - Partial sessions and break sessions do not increment Focus Hours.
 * - Total Focus Hours calculation (always returns an integer).
 * - Own and coordinate the Timer Engine independent of the DOM.
 * - Expose immutable application state snapshots and notify subscribers.
 * - Robust notification trampoline: delivers reentrant state changes without dropping
 *   events, prevents infinite recursive loops, and cleanly handles unsubscriptions/disposal.
 */

import type { AppState, TimerPhase } from "../types.ts";
import { FOCUS_DURATION_MS, BREAK_DURATION_MS } from "../types.ts";
import { TimerEngine } from "./timer.ts";

export { FOCUS_DURATION_MS, BREAK_DURATION_MS };

export type PomodoroStateListener = (state: AppState) => void;

/**
 * Calculates total integer focus hours from completed focus sessions.
 * Each completed 50-minute focus session equals exactly 1 Focus Hour.
 */
export function calculateFocusHours(completedSessions: number): number {
  if (completedSessions < 0 || !Number.isFinite(completedSessions)) {
    return 0;
  }
  return Math.floor(completedSessions);
}

export interface PomodoroControllerOptions {
  focusDurationMs?: number;
  breakDurationMs?: number;
  tickIntervalMs?: number;
  initialPhase?: TimerPhase;
  initialCompletedSessions?: number;
  initialRemainingMs?: number;
  initialStatus?: "idle" | "paused";
}

export interface IPomodoroController {
  getState(): AppState;
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  skipBreak(): void;
  switchPhase(nextPhase: TimerPhase): void;
  restoreState(state: {
    phase: TimerPhase;
    remainingMs: number;
    completedSessions: number;
    status: import("../types.ts").TimerStatus;
  }): void;
  subscribe(listener: PomodoroStateListener): () => void;
  dispose(): void;
}

export class PomodoroController implements IPomodoroController {
  private phase: TimerPhase;
  private completedSessions: number;
  private readonly focusDurationMs: number;
  private readonly breakDurationMs: number;
  private readonly timer: TimerEngine;
  private isDisposed = false;
  private isNotifying = false;
  private hasPendingNotification = false;
  private lastEmittedState: AppState | null = null;

  private static readonly MAX_REENTRANT_NOTIFICATIONS = 10;

  private readonly listeners = new Set<PomodoroStateListener>();

  constructor(options: PomodoroControllerOptions = {}) {
    this.focusDurationMs = Math.max(0, options.focusDurationMs ?? FOCUS_DURATION_MS);
    this.breakDurationMs = Math.max(0, options.breakDurationMs ?? BREAK_DURATION_MS);
    this.phase = options.initialPhase ?? "focus";
    this.completedSessions = Math.max(0, options.initialCompletedSessions ?? 0);

    const phaseDuration = this.phase === "focus" ? this.focusDurationMs : this.breakDurationMs;
    const initialRemaining = options.initialRemainingMs !== undefined
      ? Math.min(phaseDuration, Math.max(0, options.initialRemainingMs))
      : phaseDuration;

    this.timer = new TimerEngine({
      durationMs: phaseDuration,
      initialRemainingMs: initialRemaining,
      initialStatus: options.initialStatus ?? "idle",
      tickIntervalMs: options.tickIntervalMs ?? 100,
      onTick: () => {
        this.notifyStateChange();
      },
      onComplete: () => {
        this.handlePhaseCompletion();
      },
    });
  }

  /**
   * Returns an immutable snapshot of current application state.
   */
  getState(): AppState {
    return Object.freeze({
      phase: this.phase,
      status: this.timer.status,
      remainingMs: this.timer.remainingMs,
      endTime: this.timer.endTime,
      completedSessions: this.completedSessions,
    });
  }

  /**
   * Starts an idle countdown or resumes a paused session.
   */
  start(): void {
    if (this.isDisposed || this.timer.status === "running") {
      return;
    }

    if (this.timer.status === "paused") {
      this.timer.resume();
    } else {
      this.timer.start();
    }
    this.notifyStateChange();
  }

  /**
   * Pauses the active countdown. Phase and completedSessions remain unchanged.
   */
  pause(): void {
    if (this.isDisposed || this.timer.status !== "running") {
      return;
    }

    this.timer.pause();
    this.notifyStateChange();
  }

  /**
   * Resumes a paused countdown.
   */
  resume(): void {
    if (this.isDisposed || this.timer.status !== "paused") {
      return;
    }

    this.timer.resume();
    this.notifyStateChange();
  }

  /**
   * Restores the full duration of the current phase and stops active countdown.
   * Does not change phase or modify completedSessions.
   */
  reset(): void {
    if (this.isDisposed) {
      return;
    }

    const duration = this.phase === "focus" ? this.focusDurationMs : this.breakDurationMs;
    this.timer.reset(duration);
    this.notifyStateChange();
  }

  /**
   * Stops and skips the current Break, returning to a full idle Focus session.
   * Focus calls are ignored and completedSessions is never modified.
   */
  skipBreak(): void {
    if (this.isDisposed || this.phase !== "break") {
      return;
    }

    this.phase = "focus";
    this.timer.reset(this.focusDurationMs);
    this.notifyStateChange();
  }

  /**
   * Explicitly switches phase to Focus or Break and resets the timer accordingly.
   * Does not award completedSessions.
   */
  switchPhase(nextPhase: TimerPhase): void {
    if (this.isDisposed) {
      return;
    }

    this.phase = nextPhase;
    const duration = nextPhase === "focus" ? this.focusDurationMs : this.breakDurationMs;
    this.timer.reset(duration);
    this.notifyStateChange();
  }

  /**
   * Restores a validated state into the controller.
   * Stops any currently running timer, invalidates pending completion callbacks,
   * updates phase, remainingMs, completedSessions, and status, and notifies subscribers.
   * If status is 'running', safely restarts active countdown.
   */
  restoreState(state: {
    phase: TimerPhase;
    remainingMs: number;
    completedSessions: number;
    status: import("../types.ts").TimerStatus;
  }): void {
    if (this.isDisposed) {
      return;
    }

    this.phase = state.phase;
    this.completedSessions = Math.max(0, Math.floor(state.completedSessions));
    const phaseDuration = this.phase === "focus" ? this.focusDurationMs : this.breakDurationMs;
    const remainingMs = Math.min(phaseDuration, Math.max(0, state.remainingMs));

    this.timer.restore(remainingMs, state.status, phaseDuration);
    this.notifyStateChange();
  }

  /**
   * Subscribes a listener to application state changes.
   * Returns an unsubscription function.
   */
  subscribe(listener: PomodoroStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Disposes the controller, stops the timer engine, and removes all listeners.
   */
  dispose(): void {
    this.isDisposed = true;
    this.timer.dispose();
    this.listeners.clear();
    this.lastEmittedState = null;
    this.hasPendingNotification = false;
  }

  /**
   * Handles completion of a countdown phase.
   * - Focus completed: +1 completedSession, transitions to Break (10m), waits for START.
   * - Break completed: 0 completedSession changes, transitions to Focus (50m), waits for START.
   */
  private handlePhaseCompletion(): void {
    if (this.isDisposed) {
      return;
    }

    if (this.phase === "focus") {
      this.completedSessions += 1;
      this.phase = "break";
      this.timer.reset(this.breakDurationMs);
    } else {
      this.phase = "focus";
      this.timer.reset(this.focusDurationMs);
    }

    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    if (this.isDisposed) {
      return;
    }

    if (this.isNotifying) {
      this.hasPendingNotification = true;
      return;
    }

    this.isNotifying = true;
    let iterations = 0;

    try {
      while (!this.isDisposed && iterations < PomodoroController.MAX_REENTRANT_NOTIFICATIONS) {
        iterations++;
        this.hasPendingNotification = false;

        const currentState = this.getState();
        if (this.isSameState(this.lastEmittedState, currentState)) {
          if (!this.hasPendingNotification) {
            break;
          }
          continue;
        }

        this.lastEmittedState = currentState;

        const listeners = Array.from(this.listeners);
        for (const listener of listeners) {
          if (this.isDisposed) {
            break;
          }
          if (!this.listeners.has(listener)) {
            continue;
          }
          try {
            listener(currentState);
          } catch (err) {
            console.error("[PomodoroController] Error in state listener:", err);
          }
        }

        if (!this.hasPendingNotification) {
          break;
        }
      }

      if (iterations >= PomodoroController.MAX_REENTRANT_NOTIFICATIONS) {
        console.warn("[PomodoroController] Reentrancy limit reached; breaking notification loop.");
      }
    } finally {
      this.isNotifying = false;
      this.hasPendingNotification = false;
    }
  }

  private isSameState(a: AppState | null, b: AppState | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.phase === b.phase &&
      a.status === b.status &&
      a.remainingMs === b.remainingMs &&
      a.endTime === b.endTime &&
      a.completedSessions === b.completedSessions
    );
  }
}
