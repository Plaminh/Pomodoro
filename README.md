# Pomodoro Lite

A lightweight, minimal fullscreen Pomodoro timer featuring pixel-style typography and user-uploaded custom background images.

## Project Overview

Pomodoro Lite provides a distraction-free, aesthetically minimal productivity timer designed to run entirely client-side in modern web browsers. It adheres strictly to fixed 50-minute focus blocks and 10-minute break periods, automatically aggregating verified focus hours without unnecessary UI widgets, borders, or external cloud dependencies.

## Technology Stack

- **Vanilla TypeScript** (Strict type checking, ESNext/ES2022)
- **HTML5 & Modern CSS3** (CSS Grid/Flexbox, `clamp()` responsive fluid typography)
- **Vite** (Next-generation lightning-fast frontend tooling and bundler)
- **LocalStorage** (State persistence for active countdowns and completed focus sessions)
- **IndexedDB** (High-capacity client-side Blob storage for user background images)
- **GitHub Pages** (Static hosting and automated continuous deployment)

*Zero external frontend frameworks (React/Vue/Angular), zero CSS utility bloat (Tailwind), zero external animation or icon libraries.*

## Folder Structure

```text
pomodoro-lite/
│
├── public/
│   └── fonts/             # Custom font assets (e.g. Pixelify Sans)
│
├── src/
│   ├── core/
│   │   ├── timer.ts       # Timestamp-based countdown engine
│   │   └── pomodoro.ts    # Phase management & focus hour calculations
│   │
│   ├── services/
│   │   ├── storage.ts     # LocalStorage state & session persistence
│   │   └── background.ts  # Native IndexedDB image storage & retrieval
│   │
│   ├── style.css          # Reset, fullscreen layout & pixel typography
│   ├── main.ts            # Application bootstrap & DOM event binding
│   └── types.ts           # Shared TypeScript interfaces & duration constants
│
├── index.html             # Fullscreen semantic HTML layout
├── package.json           # Minimal NPM scripts and devDependencies
├── tsconfig.json          # Strict TypeScript compiler configuration
├── vite.config.ts         # Vite build and base path configuration
├── .gitignore             # Git ignore patterns
└── README.md              # Project documentation
```

## Setup Instructions

### Prerequisites

- Node.js (v18.0.0 or later recommended, tested on Node v24+)
- npm (v9.0.0 or later)

### Installation

Clone the repository and install the development dependencies:

```bash
git clone https://github.com/<your-username>/pomodoro-lite.git
cd pomodoro-lite
npm install
```

## Development Commands

- **Start local development server:**
  ```bash
  npm run dev
  ```
  Spins up the local Vite development server with Hot Module Replacement (HMR).

- **TypeScript verification & production build:**
  ```bash
  npm run build
  ```
  Runs the TypeScript typechecker (`tsc`) and compiles optimized static assets into `dist/`.

- **Preview production build locally:**
  ```bash
  npm run preview
  ```
  Hosts the compiled `dist/` directory locally to verify production builds before deploying.

## GitHub Pages Deployment

The application is pre-configured to deploy seamlessly to GitHub Pages.

### Base Path Configuration

In `vite.config.ts`, the `base` property is set to:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "/pomodoro-lite/",
});
```

> **Changing the Repository Name**:
> - If your repository is named something other than `pomodoro-lite`, update `base: "/<your-repo-name>/"` in `vite.config.ts`.
> - If deploying to a user or organization root page (e.g. `<username>.github.io`), update `base: "/"`.

### Deployment Steps

1. In your GitHub repository, navigate to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, choose **GitHub Actions**.
3. Create a `.github/workflows/deploy.yml` workflow to run `npm ci`, `npm run build`, and deploy the generated `dist/` folder via `actions/deploy-pages`.

## Planned Features

1. **Timestamp-Based Timer Engine (`src/core/timer.ts`)**
   - True timestamp delta calculation to eliminate drift when browser tabs background or throttle intervals.
   - Start, pause, resume, and reset transitions.
2. **Pomodoro Phase Controller (`src/core/pomodoro.ts`)**
   - 50-minute Focus phase and 10-minute Break phase transitions.
   - Strict Focus Hour calculation: only completed 50-minute focus blocks award +1 Focus Hour (integer-only, no fractions, breaks excluded).
3. **Persistent State Management (`src/services/storage.ts`)**
   - LocalStorage persistence for timer state and session counts across page refreshes.
   - Guards against false completions resulting from browser closures or duplications.
4. **IndexedDB Background Service (`src/services/background.ts`)**
   - Fullscreen background upload for PNG, JPG, and WebP images.
   - Stored locally as raw Blobs in IndexedDB and restored on startup.
5. **JSON Backup & Restore**
   - Export and import focus statistics as portable JSON files.
