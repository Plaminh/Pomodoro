/**
 * src/services/storage.ts
 *
 * LocalStorage Service.
 *
 * Architectural Responsibilities:
 * - Persist and restore completed sessions count.
 * - Persist and restore active timer state (phase, status, remainingMs, endTime).
 * - Validate retrieved data to prevent corrupted state from breaking the application.
 * - Guard against awarding completed sessions simply because the page/browser was closed.
 * - Guard against duplicate completion records upon restoration.
 *
 * Note: Storage integration will be activated alongside the Pomodoro Controller.
 */

import type { AppState } from "../types";

export const STORAGE_KEYS = {
  APP_STATE: "pomodoro_lite_state",
  COMPLETED_SESSIONS: "pomodoro_lite_completed_sessions",
} as const;

export interface IStorageService {
  saveState(state: AppState): void;
  loadState(): AppState | null;
  clearState(): void;
  saveCompletedSessions(count: number): void;
  loadCompletedSessions(): number;
}
