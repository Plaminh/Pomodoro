/**
 * Shared TypeScript types and constants for Pomodoro Lite.
 */

export type TimerPhase = "focus" | "break";

export type TimerStatus =
  | "idle"
  | "running"
  | "paused";

export interface AppState {
  phase: TimerPhase;
  status: TimerStatus;
  remainingMs: number;
  endTime: number | null;
  completedSessions: number;
}

/**
 * Timer duration constants.
 * Focus: 50 minutes.
 * Break: 10 minutes.
 */
export const FOCUS_DURATION_MINUTES = 50;
export const BREAK_DURATION_MINUTES = 10;
export const FOCUS_DURATION_MS = FOCUS_DURATION_MINUTES * 60 * 1000;
export const BREAK_DURATION_MS = BREAK_DURATION_MINUTES * 60 * 1000;
