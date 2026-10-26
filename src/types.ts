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
 * Persisted schema for LocalStorage (Phase 4).
 * Single versioned structure capturing essential session state.
 */
export interface PersistedPomodoroState {
  version: 1;
  phase: "focus" | "break";
  remainingMs: number;
  completedSessions: number;
  status: "idle" | "paused";
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

/**
 * Backup format schema for Phase 7 (JSON Backup & Restore).
 */
export interface PomodoroBackupData {
  phase: TimerPhase;
  remainingMs: number;
  completedSessions: number;
  status: "idle" | "paused";
}

export interface PomodoroBackup {
  app: "pomodoro-lite";
  version: 1;
  exportedAt: string;
  data: PomodoroBackupData;
}
