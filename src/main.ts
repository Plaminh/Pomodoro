/**
 * src/main.ts
 *
 * Application entry point for Pomodoro Lite.
 * Connects the Timestamp-Based Timer Engine to the minimal UI controls.
 */

import "./style.css";
import type { AppState } from "./types";
import { FOCUS_DURATION_MS } from "./types";
import { TimerEngine, formatTimeMMSS } from "./core/timer";

/**
 * Initial default application state for Pomodoro Lite.
 */
export const initialAppState: AppState = {
  phase: "focus",
  status: "idle",
  remainingMs: FOCUS_DURATION_MS,
  endTime: null,
  completedSessions: 0,
};

export interface AppElements {
  timerDisplay: HTMLElement | null;
  phaseLabel: HTMLElement | null;
  focusHours: HTMLElement | null;
  btnStart: HTMLButtonElement | null;
  btnPause: HTMLButtonElement | null;
  btnReset: HTMLButtonElement | null;
}

export function getAppElements(): AppElements {
  return {
    timerDisplay: document.getElementById("timer-display"),
    phaseLabel: document.getElementById("phase-label"),
    focusHours: document.getElementById("focus-hours"),
    btnStart: document.getElementById("btn-start") as HTMLButtonElement | null,
    btnPause: document.getElementById("btn-pause") as HTMLButtonElement | null,
    btnReset: document.getElementById("btn-reset") as HTMLButtonElement | null,
  };
}

/**
 * Initializes and wires the TimerEngine with the DOM UI controls.
 */
export function initApp(): TimerEngine {
  const elements = getAppElements();

  const timer = new TimerEngine({
    durationMs: FOCUS_DURATION_MS,
    onTick: (remainingMs) => {
      if (elements.timerDisplay) {
        elements.timerDisplay.textContent = formatTimeMMSS(remainingMs);
      }
    },
    onComplete: () => {
      if (elements.timerDisplay) {
        elements.timerDisplay.textContent = formatTimeMMSS(0);
      }
      console.info("[Pomodoro Lite] Timer completed.");
    },
  });

  // Ensure initial display reflects the configured starting time (50:00)
  if (elements.timerDisplay) {
    elements.timerDisplay.textContent = formatTimeMMSS(timer.getRemainingMs());
  }

  // Wire control events
  elements.btnStart?.addEventListener("click", () => {
    if (timer.getStatus() === "paused") {
      timer.resume();
    } else {
      timer.start();
    }
  });

  elements.btnPause?.addEventListener("click", () => {
    timer.pause();
  });

  elements.btnReset?.addEventListener("click", () => {
    timer.reset();
  });

  console.info("[Pomodoro Lite] Timer engine connected to UI successfully.");
  return timer;
}

// Bootstrap once the DOM is ready in browser environment
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initApp();
    });
  } else {
    initApp();
  }
}
