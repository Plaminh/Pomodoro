/**
 * src/main.ts
 *
 * Application entry point for Pomodoro Lite.
 * Coordinates PomodoroController, LocalStorage persistence, and minimal UI.
 */

import "./style.css";
import type { AppState } from "./types.ts";
import { FOCUS_DURATION_MS } from "./types.ts";
import { PomodoroController } from "./core/pomodoro.ts";
import { formatTimeMMSS } from "./core/timer.ts";
import { loadPomodoroState, setupPersistence } from "./services/storage.ts";
import { BackgroundManager } from "./services/background.ts";

export { setupPersistence, BackgroundManager };

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
  bgUpload: HTMLInputElement | null;
  btnChangeBg: HTMLButtonElement | null;
  btnRemoveBg: HTMLButtonElement | null;
}

export function getAppElements(): AppElements {
  return {
    timerDisplay: document.getElementById("timer-display"),
    phaseLabel: document.getElementById("phase-label"),
    focusHours: document.getElementById("focus-hours"),
    btnStart: document.getElementById("btn-start") as HTMLButtonElement | null,
    btnPause: document.getElementById("btn-pause") as HTMLButtonElement | null,
    btnReset: document.getElementById("btn-reset") as HTMLButtonElement | null,
    bgUpload: document.getElementById("background-upload") as HTMLInputElement | null,
    btnChangeBg: document.getElementById("btn-change-background") as HTMLButtonElement | null,
    btnRemoveBg: document.getElementById("btn-remove-background") as HTMLButtonElement | null,
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
 * Initializes and wires the PomodoroController with LocalStorage and UI controls.
 */
export function initApp(options?: { backgroundManager?: BackgroundManager }): PomodoroController {
  const elements = getAppElements();

  // 1. Attempt to load persisted state
  const savedState = loadPomodoroState();

  // 2. Initialize controller with restored state or default values
  const pomodoro = new PomodoroController(
    savedState
      ? {
          initialPhase: savedState.phase,
          initialRemainingMs: savedState.remainingMs,
          initialCompletedSessions: savedState.completedSessions,
          initialStatus: savedState.status,
        }
      : {}
  );

  // 3. Render restored state immediately
  renderState(elements, pomodoro.getState());

  // 4. Subscribe UI renderer to controller state updates
  pomodoro.subscribe((state) => {
    renderState(elements, state);
  });

  // 5. Setup persistence strategy
  setupPersistence(pomodoro);

  // 6. Initialize and restore custom background asynchronously
  const backgroundManager = options?.backgroundManager ?? new BackgroundManager();
  backgroundManager.restore().catch((error) => {
    console.warn("[Pomodoro Lite] Could not restore custom background:", error);
  });

  // 7. Wire UI control events
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

  // 8. Wire background UI controls
  elements.btnChangeBg?.addEventListener("click", () => {
    elements.bgUpload?.click();
  });

  elements.bgUpload?.addEventListener("change", async (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      try {
        const result = await backgroundManager.changeBackground(file);
        if (!result.valid) {
          console.warn("[Pomodoro Lite] Invalid background image:", result.error);
        }
      } catch (error) {
        console.error("[Pomodoro Lite] Failed to update background image:", error);
      }
    }
    // Reset file input value to allow re-selection of the same file
    target.value = "";
  });

  elements.btnRemoveBg?.addEventListener("click", async () => {
    try {
      await backgroundManager.removeBackground();
    } catch (error) {
      console.error("[Pomodoro Lite] Failed to remove background image:", error);
    }
  });

  console.info("[Pomodoro Lite] Application initialized successfully with persistence.");
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
