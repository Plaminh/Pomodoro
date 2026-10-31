import type { AppState } from "./types.ts";
import { formatTimeMMSS } from "./core/timer.ts";

export interface AppElements {
  timerDisplay: HTMLElement | null;
  phaseLabel: HTMLElement | null;
  focusHours: HTMLElement | null;
  btnStart: HTMLButtonElement | null;
  btnPause: HTMLButtonElement | null;
  btnReset: HTMLButtonElement | null;
  btnSkipBreak: HTMLButtonElement | null;
  bgUpload: HTMLInputElement | null;
  btnChangeBg: HTMLButtonElement | null;
  btnRemoveBg: HTMLButtonElement | null;
  backupImport: HTMLInputElement | null;
  btnExportBackup: HTMLButtonElement | null;
  btnImportBackup: HTMLButtonElement | null;
}

export function getAppElements(): AppElements {
  return {
    timerDisplay: document.getElementById("timer-display"),
    phaseLabel: document.getElementById("phase-label"),
    focusHours: document.getElementById("focus-hours"),
    btnStart: document.getElementById("btn-start") as HTMLButtonElement | null,
    btnPause: document.getElementById("btn-pause") as HTMLButtonElement | null,
    btnReset: document.getElementById("btn-reset") as HTMLButtonElement | null,
    btnSkipBreak: document.getElementById("skip-break-btn") as HTMLButtonElement | null,
    bgUpload: document.getElementById("background-upload") as HTMLInputElement | null,
    btnChangeBg: document.getElementById("btn-change-background") as HTMLButtonElement | null,
    btnRemoveBg: document.getElementById("btn-remove-background") as HTMLButtonElement | null,
    backupImport: document.getElementById("backup-import") as HTMLInputElement | null,
    btnExportBackup: document.getElementById("btn-export-backup") as HTMLButtonElement | null,
    btnImportBackup: document.getElementById("btn-import-backup") as HTMLButtonElement | null,
  };
}

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
  if (elements.btnSkipBreak) {
    elements.btnSkipBreak.hidden = state.phase !== "break";
  }
}
