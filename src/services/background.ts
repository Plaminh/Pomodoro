/**
 * src/services/background.ts
 *
 * IndexedDB Background Service and BackgroundManager for Pomodoro Lite.
 *
 * Responsibilities:
 * - Validate user-uploaded image files (formats: JPEG, PNG, WebP; size <= 10 MB; non-empty).
 * - Persist and manage a single custom background image in IndexedDB as a Blob.
 * - Manage URL.createObjectURL and URL.revokeObjectURL lifecycle to prevent memory leaks.
 * - Restore saved background asynchronously at application startup without blocking timer engine.
 * - Protect against asynchronous race conditions / stale completions using operation tokens.
 * - Provide graceful fallback to default CSS background if IndexedDB fails or is unavailable.
 * - Keep background management independent of Pomodoro state and timer logic.
 */

export const DB_NAME = "pomodoro-lite";
export const DB_VERSION = 1;
export const STORE_NAME = "backgrounds";
export const BACKGROUND_KEY = "current";

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export interface IBackgroundService {
  saveBackground(blob: Blob): Promise<void>;
  loadBackground(): Promise<Blob | null>;
  deleteBackground(): Promise<void>;
}

/**
 * Backward compatibility alias for database configuration.
 */
export const BACKGROUND_DB_CONFIG = {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  IMAGE_KEY: BACKGROUND_KEY,
} as const;

/**
 * Validates an image file or blob against MIME type, emptiness, and size restrictions.
 */
export function validateImageFile(file: Blob | File): ImageValidationResult {
  if (!file || typeof file.size !== "number" || typeof file.type !== "string") {
    return { valid: false, error: "Invalid file object provided." };
  }

  const normalizedType = file.type.toLowerCase().split(";")[0].trim();
  if (!SUPPORTED_MIME_TYPES.includes(normalizedType as SupportedMimeType)) {
    return {
      valid: false,
      error: "Unsupported file format. Please upload a JPEG, PNG, or WebP image.",
    };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Image file is empty." };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image file exceeds maximum allowed size of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB.`,
    };
  }

  return { valid: true };
}

/**
 * Resolves the active IDBFactory instance from injected parameter, window, or global environment.
 */
function resolveIDBFactory(customFactory?: IDBFactory | null): IDBFactory | null {
  if (customFactory !== undefined) {
    return customFactory;
  }
  if (typeof window !== "undefined" && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof indexedDB !== "undefined") {
    return indexedDB;
  }
  return null;
}

/**
 * Opens a connection to the Pomodoro Lite IndexedDB database.
 */
export function openDatabase(factory?: IDBFactory | null): Promise<IDBDatabase> {
  const idb = resolveIDBFactory(factory);
  if (!idb) {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = idb.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });
}

/**
 * Saves a background Blob into IndexedDB, overwriting any previously stored background.
 */
export async function saveBackground(blob: Blob, factory?: IDBFactory | null): Promise<void> {
  const db = await openDatabase(factory);

  return new Promise<void>((resolve, reject) => {
    let completed = false;
    const finalize = (err?: Error) => {
      if (!completed) {
        completed = true;
        try {
          db.close();
        } catch {
          // Ignore close error
        }
        if (err) reject(err);
        else resolve();
      }
    };

    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(blob, BACKGROUND_KEY);

      let reqError: DOMException | Error | null = null;
      req.onerror = () => {
        reqError = req.error;
      };

      tx.oncomplete = () => {
        finalize();
      };

      tx.onerror = () => {
        finalize(reqError || tx.error || new Error("Failed to save background to IndexedDB"));
      };

      tx.onabort = () => {
        finalize(reqError || tx.error || new Error("IndexedDB transaction aborted"));
      };
    } catch (err) {
      finalize(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Loads the active background Blob from IndexedDB, or null if none is saved.
 * Returns null gracefully if IndexedDB is unavailable or errors out during retrieval.
 */
export async function loadBackground(factory?: IDBFactory | null): Promise<Blob | null> {
  let db: IDBDatabase;
  try {
    db = await openDatabase(factory);
  } catch (err) {
    console.warn("[Background] IndexedDB unavailable or failed to open on load:", err);
    return null;
  }

  return new Promise<Blob | null>((resolve) => {
    let completed = false;
    const finalize = (result: Blob | null) => {
      if (!completed) {
        completed = true;
        try {
          db.close();
        } catch {
          // Ignore close error
        }
        resolve(result);
      }
    };

    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(BACKGROUND_KEY);

      req.onsuccess = () => {
        const result = req.result;
        if (result instanceof Blob) {
          finalize(result);
        } else {
          finalize(null);
        }
      };

      req.onerror = () => {
        console.warn("[Background] Failed to load background from IndexedDB:", req.error);
        finalize(null);
      };

      tx.onerror = () => {
        console.warn("[Background] Transaction error while loading background:", tx.error);
        finalize(null);
      };

      tx.onabort = () => {
        console.warn("[Background] Transaction aborted while loading background:", tx.error);
        finalize(null);
      };
    } catch (err) {
      console.warn("[Background] Unexpected error in loadBackground:", err);
      finalize(null);
    }
  });
}

/**
 * Deletes the background image record from IndexedDB.
 */
export async function deleteBackground(factory?: IDBFactory | null): Promise<void> {
  const db = await openDatabase(factory);

  return new Promise<void>((resolve, reject) => {
    let completed = false;
    const finalize = (err?: Error) => {
      if (!completed) {
        completed = true;
        try {
          db.close();
        } catch {
          // Ignore close error
        }
        if (err) reject(err);
        else resolve();
      }
    };

    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(BACKGROUND_KEY);

      let reqError: DOMException | Error | null = null;
      req.onerror = () => {
        reqError = req.error;
      };

      tx.oncomplete = () => {
        finalize();
      };

      tx.onerror = () => {
        finalize(reqError || tx.error || new Error("Failed to delete background from IndexedDB"));
      };

      tx.onabort = () => {
        finalize(reqError || tx.error || new Error("IndexedDB transaction aborted"));
      };
    } catch (err) {
      finalize(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Backward compatibility alias for deleteBackground.
 */
export const clearBackground = deleteBackground;

export interface BackgroundManagerOptions {
  idbFactory?: IDBFactory | null;
  targetElement?: HTMLElement | null;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

/**
 * Coordinates background upload, IndexedDB persistence, DOM rendering, and Object URL lifecycle.
 */
export class BackgroundManager {
  private currentObjectUrl: string | null = null;
  private activeOperationId = 0;
  private mutationChain: Promise<void> = Promise.resolve();
  private readonly options: {
    idbFactory?: IDBFactory | null;
    targetElement?: HTMLElement | null;
    createObjectURL: (blob: Blob) => string;
    revokeObjectURL: (url: string) => void;
  };

  constructor(options?: BackgroundManagerOptions) {
    this.options = {
      idbFactory: options?.idbFactory,
      targetElement: options?.targetElement,
      createObjectURL:
        options?.createObjectURL ??
        ((blob: Blob) => {
          if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
            return URL.createObjectURL(blob);
          }
          return "";
        }),
      revokeObjectURL:
        options?.revokeObjectURL ??
        ((url: string) => {
          if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(url);
          }
        }),
    };
  }

  /**
   * Returns the currently active Object URL, or null if using default background.
   */
  getCurrentObjectUrl(): string | null {
    return this.currentObjectUrl;
  }

  /**
   * Applies or clears background-image CSS style on the target element.
   */
  private applyUrl(url: string | null): void {
    const el =
      this.options.targetElement !== undefined
        ? this.options.targetElement
        : typeof document !== "undefined"
        ? document.body
        : null;

    if (el) {
      if (url) {
        el.style.backgroundImage = `url("${url}")`;
      } else {
        el.style.backgroundImage = "";
      }
    }
  }

  /**
   * Asynchronously loads and applies the persisted background image from IndexedDB.
   * Returns true if a background was restored, false otherwise.
   */
  async restore(): Promise<boolean> {
    const opId = ++this.activeOperationId;

    try {
      const blob = await loadBackground(this.options.idbFactory);

      // Guard against stale async completion if user changed or removed background during restore
      if (opId !== this.activeOperationId) {
        return false;
      }

      if (blob) {
        const newUrl = this.options.createObjectURL(blob);
        this.applyUrl(newUrl);
        if (this.currentObjectUrl) {
          this.options.revokeObjectURL(this.currentObjectUrl);
        }
        this.currentObjectUrl = newUrl;
        return true;
      }

      return false;
    } catch (err) {
      if (opId !== this.activeOperationId) return false;
      console.warn("[Background] Failed to restore background image:", err);
      return false;
    }
  }

  /**
   * Serializes background mutations (save and delete) so that concurrent operations
   * write to IndexedDB in user-initiated order and do not complete out of order.
   */
  private runSerializedMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const task = this.mutationChain.catch(() => {}).then(mutation);
    this.mutationChain = task.then(
      () => {},
      () => {}
    );
    return task;
  }

  /**
   * Validates, persists, and displays a new background image.
   * If validation fails, returns the validation error without modifying persistence or display.
   * If persistence fails, throws the error without modifying display or revoking current URL.
   * Serializes IndexedDB mutations so rapid consecutive uploads write in order.
   */
  async changeBackground(file: Blob | File): Promise<ImageValidationResult> {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      return validation;
    }

    const opId = ++this.activeOperationId;

    return this.runSerializedMutation(async () => {
      // Persist to IndexedDB
      try {
        await saveBackground(file, this.options.idbFactory);
      } catch (err) {
        console.error("[Background] Failed to persist background image:", err);
        throw err;
      }

      // Check if superseded by another concurrent action while saving
      if (opId !== this.activeOperationId) {
        return { valid: true };
      }

      const newUrl = this.options.createObjectURL(file);
      this.applyUrl(newUrl);

      if (this.currentObjectUrl) {
        this.options.revokeObjectURL(this.currentObjectUrl);
      }
      this.currentObjectUrl = newUrl;

      return { valid: true };
    });
  }

  /**
   * Removes custom background from IndexedDB and DOM, and releases any active Object URL.
   * If IndexedDB deletion fails, preserves existing displayed background, preserves Object URL,
   * and reports failure by throwing the error.
   * Serializes IndexedDB mutations so rapid consecutive actions execute in order.
   */
  async removeBackground(): Promise<void> {
    const opId = ++this.activeOperationId;

    return this.runSerializedMutation(async () => {
      try {
        await deleteBackground(this.options.idbFactory);
      } catch (err) {
        console.error("[Background] Failed to delete background from IndexedDB:", err);
        throw err;
      }

      // Check if superseded by another concurrent action while deleting
      if (opId !== this.activeOperationId) {
        return;
      }

      this.applyUrl(null);

      if (this.currentObjectUrl) {
        this.options.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = null;
      }
    });
  }

  /**
   * Disposes the manager by revoking active Object URL and clearing memory references.
   */
  dispose(): void {
    if (this.currentObjectUrl) {
      this.options.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }
}
