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
 * - Coordinate with Timer Engine and Storage Service.
 *
 * Note: Full engine implementation will be added in subsequent phases.
 */

import {
  AppState,
  TimerPhase,
  FOCUS_DURATION_MS,
  BREAK_DURATION_MS,
} from "../types";

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

export interface IPomodoroController {
  getState(): AppState;
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  switchPhase(nextPhase: TimerPhase): void;
  subscribe(listener: PomodoroStateListener): () => void;
}
