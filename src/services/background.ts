/**
 * src/services/background.ts
 *
 * IndexedDB Background Service.
 *
 * Architectural Responsibilities:
 * - Initialize and open the IndexedDB instance for background image storage.
 * - Store user-uploaded background images as Blobs (PNG, JPG, WebP).
 * - Load stored Blob and create an object URL for fullscreen display.
 * - Manage URL object revocation to prevent memory leaks.
 * - Replace existing background image records cleanly.
 * - Zero external libraries; uses native browser IndexedDB API.
 *
 * Note: Database initialization and file upload handling will be implemented in the Background feature phase.
 */

export const BACKGROUND_DB_CONFIG = {
  DB_NAME: "pomodoro_lite_db",
  DB_VERSION: 1,
  STORE_NAME: "background_store",
  IMAGE_KEY: "user_background_image",
} as const;

export interface IBackgroundService {
  init(): Promise<void>;
  saveBackground(file: Blob): Promise<void>;
  loadBackground(): Promise<Blob | null>;
  clearBackground(): Promise<void>;
}
