/**
 * src/main.ts
 *
 * Application entry point for Pomodoro Lite.
 *
 * Responsibilities:
 * - Initialize UI references and bind event listeners.
 * - Connect UI to the Pomodoro Controller, Timer Engine, Storage, and Background services.
 * - Render initial application state.
 */

import "./style.css";
import type { AppState } from "./types";
import { FOCUS_DURATION_MS } from "./types";

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

interface AppElements {
  timerDisplay: HTMLElement | null;
  phaseLabel: HTMLElement | null;
  focusHours: HTMLElement | null;
  btnStart: HTMLButtonElement | null;
  btnPause: HTMLButtonElement | null;
  btnReset: HTMLButtonElement | null;
}

function getAppElements(): AppElements {
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
 * Prepares UI listeners and attaches event hooks.
 * Controls are wired for readiness; core engine execution will be connected in the Timer phase.
 */
function setupControls(elements: AppElements): void {
  elements.btnStart?.addEventListener("click", () => {
    // Will connect to PomodoroController.start()
    console.debug("[Pomodoro Lite] START clicked (engine pending integration)");
  });

  elements.btnPause?.addEventListener("click", () => {
    // Will connect to PomodoroController.pause()
    console.debug("[Pomodoro Lite] PAUSE clicked (engine pending integration)");
  });

  elements.btnReset?.addEventListener("click", () => {
    // Will connect to PomodoroController.reset()
    console.debug("[Pomodoro Lite] RESET clicked (engine pending integration)");
  });
}

/**
 * Initialize Pomodoro Lite application entry point.
 */
export function initApp(): void {
  const elements = getAppElements();
  setupControls(elements);
  console.info("[Pomodoro Lite] Initialized static preview successfully.");
}

// Bootstrap once the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
