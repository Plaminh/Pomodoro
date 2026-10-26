/**
 * src/main.ts
 *
 * Application entry point for Pomodoro Lite.
 * Connects the Pomodoro Controller to the minimal fullscreen UI.
 */

import "./style.css";
import type { AppState } from "./types.ts";
import { FOCUS_DURATION_MS } from "./types.ts";
import { PomodoroController } from "./core/pomodoro.ts";
import { formatTimeMMSS } from "./core/timer.ts";

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
 * Renders the state snapshot to the DOM elements using textContent.
 */
export function renderState(elements: AppElements, state: AppState): void {
  if (elements.timerDisplay) {
    elements.timerDisplay.textContent = formatTimeMMSS(state.remainingMs);
  }
  if (elements.phaseLabel) {
    elements.phaseLabel.textContent = state.phase === "focus" ? "FOCUS TIME" : "BREAK TIME";
  }
  if (elements.focusHours) {
    elements.focusHours.textContent = `TOTAL HOURS: ${state.completedSessions}h`;
  }
}

/**
 * Initializes and wires the PomodoroController with the DOM UI controls.
 */
export function initApp(): PomodoroController {
  const elements = getAppElements();
  const pomodoro = new PomodoroController();

  // Subscribe to state updates
  pomodoro.subscribe((state) => {
    renderState(elements, state);
  });

  // Render initial display
  renderState(elements, pomodoro.getState());

  // Wire control events
  elements.btnStart?.addEventListener("click", () => {
    const currentState = pomodoro.getState();
    if (currentState.status === "paused") {
      pomodoro.resume();
    } else {
      pomodoro.start();
    }
  });

  elements.btnPause?.addEventListener("click", () => {
    pomodoro.pause();
  });

  elements.btnReset?.addEventListener("click", () => {
    pomodoro.reset();
  });

  console.info("[Pomodoro Lite] Pomodoro controller connected to UI successfully.");
  return pomodoro;
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
