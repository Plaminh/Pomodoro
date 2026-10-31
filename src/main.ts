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
import { loadPomodoroState, setupPersistence } from "./services/storage.ts";
import { BackgroundManager } from "./services/background.ts";
import { exportBackup, importBackupFile } from "./services/backup.ts";
import { getAppElements, renderState } from "./ui.ts";

export { setupPersistence, BackgroundManager, exportBackup, importBackupFile };
export { getAppElements, renderState } from "./ui.ts";
export type { AppElements } from "./ui.ts";

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

  elements.btnSkipBreak?.addEventListener("click", () => {
    pomodoro.skipBreak();
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

  // 9. Wire backup UI controls
  elements.btnExportBackup?.addEventListener("click", () => {
    const success = exportBackup(pomodoro);
    if (!success) {
      window.alert("Failed to export backup.");
    }
  });

  elements.btnImportBackup?.addEventListener("click", () => {
    elements.backupImport?.click();
  });

  elements.backupImport?.addEventListener("change", async (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      try {
        const result = await importBackupFile(file, pomodoro);
        if (result.success) {
          window.alert("Backup restored successfully.");
        } else if (result.error && result.error !== "Import cancelled by user.") {
          window.alert(`Import failed: ${result.error}`);
        }
      } catch (error) {
        console.error("[Pomodoro Lite] Failed to import backup:", error);
        window.alert("Failed to import backup due to an unexpected error.");
      }
    }
    target.value = "";
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
