# Pomodoro Lite

A lightweight, minimal fullscreen Pomodoro timer featuring retro pixel-style typography, user-uploaded custom background images, and portable JSON backup & restore.

- **Expected Production URL**: [https://plaminh.github.io/Pomodoro/](https://plaminh.github.io/Pomodoro/)
- **Repository**: [https://github.com/Plaminh/Pomodoro](https://github.com/Plaminh/Pomodoro)

---

## Project Overview

Pomodoro Lite provides a distraction-free, aesthetically minimal productivity timer designed to run entirely client-side in modern web browsers. It adheres strictly to fixed 50-minute focus blocks and 10-minute break periods, automatically aggregating verified focus hours without unnecessary UI widgets, borders, or external cloud dependencies.

## Key Features

- **Drift-Free Timestamp Engine**: Accurate countdown calculation using wall-clock timestamp deltas, immune to browser background tab throttling.
- **Strict Focus Tracking**: Exactly 1 integer Focus Hour awarded per completed 50-minute focus session; zero credit for partial sessions or break periods.
- **Robust LocalStorage Persistence**: Normalized paused restoration across browser reloads, throttling storage writes to protect disk performance.
- **Custom Background Images**: Native IndexedDB Blob persistence supporting JPEG, PNG, and WebP images up to 10 MB with Object URL lifecycle safety.
- **Responsive Retro Pixel UI**: High-contrast, accessibility-tested layout supporting mobile, tablet, and desktop viewports with fluid `clamp()` typography and `:focus-visible` indicators.
- **JSON Backup & Restore**: Safe, portable schema-validated import and export of focus progress with atomic state rollback safeguards.
- **Zero Third-Party Runtime Dependencies**: Pure Vanilla TypeScript, native browser Web APIs, and CSS.

## Technology Stack

- **Vanilla TypeScript** (Strict type checking, ES2022 / ESNext bundler resolution)
- **HTML5 & Modern CSS3** (CSS Flexbox, fluid `clamp()` responsive typography)
- **Vite** (Optimized bundling and static asset pipeline)
- **LocalStorage API** (Client-side session state persistence)
- **IndexedDB API** (High-capacity client-side Blob storage for backgrounds)
- **GitHub Pages & Actions** (Automated continuous integration and deployment)

---

## Branch Strategy

- `dev`: Development and testing.
- `main`: Production deployment.

---

## Development and Testing

### Prerequisites

- Node.js (v18.0.0 or later; tested on Node v20 LTS, v22 LTS, and v24)
- npm (v9.0.0 or later)

### Installation

Clone the repository and install dependencies cleanly:

```bash
git clone https://github.com/Plaminh/Pomodoro.git
cd Pomodoro
npm ci
```

### Run Tests and Typecheck

```bash
npm test
npx tsc --noEmit
```

- `npm test`: Runs all 120 automated unit and regression tests using Node's native test runner (`node:test`).
- `npx tsc --noEmit`: Validates strict type checking across all TypeScript source and test files.

---

## Production Build

```bash
npm run build
npm run preview
```

- `npm run build`: Compiles optimized, minified production assets into the `dist/` directory.
- `npm run preview`: Serves the production `dist/` bundle locally for verification under the `/Pomodoro/` base path.

---

## Deployment

GitHub Actions automatically deploys the `main` branch to GitHub Pages upon push or manual workflow dispatch.

Expected production URL: [https://plaminh.github.io/Pomodoro/](https://plaminh.github.io/Pomodoro/)

### Base Path Configuration

In `vite.config.ts`, the base path matches the repository name exactly:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "/Pomodoro/",
});
```

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)

The deployment workflow:
1. Checks out repository code (`actions/checkout@v4`).
2. Sets up Node.js 22 LTS with npm dependency caching (`actions/setup-node@v4`).
3. Installs clean dependencies (`npm ci`).
4. Executes automated tests (`npm test`).
5. Validates TypeScript types (`npx tsc --noEmit`).
6. Builds the production bundle (`npm run build`).
7. Configures GitHub Pages and uploads `dist/` as the artifact (`actions/upload-pages-artifact@v3`).
8. Deploys to GitHub Pages (`actions/deploy-pages@v4`).

---

## Browser Storage

All application state is stored locally within the browser:
- Active countdown timer state and completed Focus Hours are persisted in **LocalStorage**.
- Custom background image files are stored as Blobs in **IndexedDB**.

Data is stored strictly on the local device and does not automatically synchronize between devices or browsers.

---

## Backup Limitations

The JSON Backup & Restore feature allows users to export and import their focus progress.
- **Included**: Current phase (`focus` or `break`), remaining countdown milliseconds, completed Focus Hours, and paused/idle status.
- **Excluded**: Background images are excluded to keep backup files lightweight, portable, human-readable, and secure. Background images remain in local IndexedDB.
