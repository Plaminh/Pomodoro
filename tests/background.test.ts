/**
 * tests/background.test.ts
 *
 * Comprehensive unit and integration tests for Phase 5:
 * Custom Background Image Upload, Display, and IndexedDB Persistence.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DB_NAME,
  STORE_NAME,
  BACKGROUND_KEY,
  MAX_IMAGE_SIZE_BYTES,
  validateImageFile,
  saveBackground,
  loadBackground,
  deleteBackground,
  BackgroundManager,
} from "../src/services/background.ts";
import { PomodoroController } from "../src/core/pomodoro.ts";

/**
 * Lightweight in-memory IndexedDB Mock for Node.js test environment.
 */
class MockRequest<T = any> {
  result: T = null as any;
  error: DOMException | Error | null = null;
  onsuccess: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
}

class MockOpenDBRequest extends MockRequest<any> {
  onupgradeneeded: ((ev: any) => void) | null = null;
}

class MockTransaction {
  db: MockDatabase;
  store: MockStore;
  oncomplete: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onabort: ((ev: any) => void) | null = null;
  error: DOMException | Error | null = null;

  constructor(db: MockDatabase, store: MockStore) {
    this.db = db;
    this.store = store;
  }

  objectStore(_name: string): MockStore {
    return this.store;
  }
}

class MockStore {
  data: Map<any, any>;
  getTx: () => MockTransaction | null;
  shouldFail: (op: string) => boolean;
  getDelayMs: (op: string, key?: any, val?: any) => number;

  constructor(
    data: Map<any, any>,
    getTx: () => MockTransaction | null,
    shouldFail: (op: string) => boolean,
    getDelayMs: (op: string, key?: any, val?: any) => number
  ) {
    this.data = data;
    this.getTx = getTx;
    this.shouldFail = shouldFail;
    this.getDelayMs = getDelayMs;
  }

  put(value: any, key: any): MockRequest<any> {
    const req = new MockRequest<any>();
    const tx = this.getTx();
    const delay = this.getDelayMs("put", key, value);

    const execute = () => {
      if (this.shouldFail("put")) {
        const err = new Error("Mock IndexedDB put failure");
        req.error = err;
        if (req.onerror) req.onerror({ target: req });
        if (tx && tx.onerror) tx.onerror({ target: tx });
      } else {
        this.data.set(key, value);
        req.result = key;
        if (req.onsuccess) req.onsuccess({ target: req });
        if (tx && tx.oncomplete) tx.oncomplete({ target: tx });
      }
    };

    if (delay > 0) {
      setTimeout(execute, delay);
    } else {
      queueMicrotask(execute);
    }

    return req as any;
  }

  get(key: any): MockRequest<any> {
    const req = new MockRequest<any>();
    const tx = this.getTx();
    const delay = this.getDelayMs("get", key);

    const execute = () => {
      if (this.shouldFail("get")) {
        const err = new Error("Mock IndexedDB get failure");
        req.error = err;
        if (req.onerror) req.onerror({ target: req });
        if (tx && tx.onerror) tx.onerror({ target: tx });
      } else {
        req.result = this.data.get(key) ?? null;
        if (req.onsuccess) req.onsuccess({ target: req });
        if (tx && tx.oncomplete) tx.oncomplete({ target: tx });
      }
    };

    if (delay > 0) {
      setTimeout(execute, delay);
    } else {
      queueMicrotask(execute);
    }

    return req as any;
  }

  delete(key: any): MockRequest<any> {
    const req = new MockRequest<any>();
    const tx = this.getTx();
    const delay = this.getDelayMs("delete", key);

    const execute = () => {
      if (this.shouldFail("delete")) {
        const err = new Error("Mock IndexedDB delete failure");
        req.error = err;
        if (req.onerror) req.onerror({ target: req });
        if (tx && tx.onerror) tx.onerror({ target: tx });
      } else {
        this.data.delete(key);
        req.result = undefined;
        if (req.onsuccess) req.onsuccess({ target: req });
        if (tx && tx.oncomplete) tx.oncomplete({ target: tx });
      }
    };

    if (delay > 0) {
      setTimeout(execute, delay);
    } else {
      queueMicrotask(execute);
    }

    return req as any;
  }
}

class MockDatabase {
  name: string;
  data: Map<any, any>;
  stores: Set<string>;
  closed = false;
  currentTx: MockTransaction | null = null;
  shouldFail: (op: string) => boolean;
  getDelayMs: (op: string, key?: any, val?: any) => number;

  objectStoreNames: { contains: (s: string) => boolean };

  constructor(
    name: string,
    data: Map<any, any>,
    stores: Set<string>,
    shouldFail: (op: string) => boolean,
    getDelayMs: (op: string, key?: any, val?: any) => number
  ) {
    this.name = name;
    this.data = data;
    this.stores = stores;
    this.shouldFail = shouldFail;
    this.getDelayMs = getDelayMs;
    this.objectStoreNames = {
      contains: (s: string) => this.stores.has(s),
    };
  }

  createObjectStore(name: string): MockStore {
    this.stores.add(name);
    return new MockStore(this.data, () => this.currentTx, this.shouldFail, this.getDelayMs);
  }

  transaction(_storeNames: any, _mode: any): MockTransaction {
    const store = new MockStore(this.data, () => this.currentTx, this.shouldFail, this.getDelayMs);
    const tx = new MockTransaction(this, store);
    this.currentTx = tx;
    return tx;
  }

  close(): void {
    this.closed = true;
  }
}

class MockIDBFactory {
  data: Map<any, any> = new Map();
  stores: Set<string> = new Set();
  failures: Set<string> = new Set();
  delays: Map<string, number | ((op: string, key?: any, val?: any) => number)> = new Map();

  setFailure(op: "open" | "put" | "get" | "delete", fail: boolean): void {
    if (fail) this.failures.add(op);
    else this.failures.delete(op);
  }

  setDelay(
    op: "open" | "put" | "get" | "delete",
    delay: number | ((op: string, key?: any, val?: any) => number)
  ): void {
    this.delays.set(op, delay);
  }

  open(name: string, _version?: number): MockOpenDBRequest {
    const req = new MockOpenDBRequest();

    queueMicrotask(() => {
      if (this.failures.has("open")) {
        req.error = new Error("Mock IndexedDB open failure");
        if (req.onerror) req.onerror({ target: req });
        return;
      }

      const isFirstOpen = this.stores.size === 0;
      const db = new MockDatabase(
        name,
        this.data,
        this.stores,
        (op) => this.failures.has(op),
        (op, key, val) => {
          const d = this.delays.get(op);
          if (typeof d === "function") return d(op, key, val);
          return d ?? 0;
        }
      );
      req.result = db;

      if (isFirstOpen && req.onupgradeneeded) {
        req.onupgradeneeded({ target: req });
      }

      if (req.onsuccess) {
        req.onsuccess({ target: req });
      }
    });

    return req as any;
  }
}

function createMockElement(): HTMLElement {
  return {
    style: {
      backgroundImage: "",
    },
  } as unknown as HTMLElement;
}

// ============================================================================
// Phase 5 Test Suite (Cases 1 - 15)
// ============================================================================

test("Case 1: Save a background Blob into IndexedDB", async () => {
  const factory = new MockIDBFactory();
  const testBlob = new Blob(["sample-image-data"], { type: "image/png" });

  await assert.doesNotReject(async () => {
    await saveBackground(testBlob, factory as unknown as IDBFactory);
  });

  assert.equal(factory.data.has(BACKGROUND_KEY), true);
  const stored = factory.data.get(BACKGROUND_KEY);
  assert.equal(stored.size, testBlob.size);
  assert.equal(stored.type, "image/png");
});

test("Case 2: Load a previously saved Blob from IndexedDB", async () => {
  const factory = new MockIDBFactory();
  const testBlob = new Blob(["hello-world-image"], { type: "image/jpeg" });

  await saveBackground(testBlob, factory as unknown as IDBFactory);
  const loadedBlob = await loadBackground(factory as unknown as IDBFactory);

  assert.ok(loadedBlob instanceof Blob);
  assert.equal(loadedBlob.size, testBlob.size);
  assert.equal(loadedBlob.type, "image/jpeg");
});

test("Case 3: Replace an existing background with a new image", async () => {
  const factory = new MockIDBFactory();
  const blobA = new Blob(["image-alpha"], { type: "image/png" });
  const blobB = new Blob(["image-beta-longer-content"], { type: "image/webp" });

  await saveBackground(blobA, factory as unknown as IDBFactory);
  let current = await loadBackground(factory as unknown as IDBFactory);
  assert.equal(current?.size, blobA.size);
  assert.equal(current?.type, "image/png");

  // Replace with Blob B
  await saveBackground(blobB, factory as unknown as IDBFactory);
  current = await loadBackground(factory as unknown as IDBFactory);
  assert.equal(current?.size, blobB.size);
  assert.equal(current?.type, "image/webp");
});

test("Case 4: Delete the saved background from IndexedDB", async () => {
  const factory = new MockIDBFactory();
  const testBlob = new Blob(["delete-me"], { type: "image/jpeg" });

  await saveBackground(testBlob, factory as unknown as IDBFactory);
  assert.equal(factory.data.has(BACKGROUND_KEY), true);

  await deleteBackground(factory as unknown as IDBFactory);
  assert.equal(factory.data.has(BACKGROUND_KEY), false);

  const loaded = await loadBackground(factory as unknown as IDBFactory);
  assert.equal(loaded, null);
});

test("Case 5: Load when no background exists returns null", async () => {
  const factory = new MockIDBFactory();
  const result = await loadBackground(factory as unknown as IDBFactory);
  assert.equal(result, null);
});

test("Case 6: Reject unsupported file types", () => {
  const gif = new Blob(["gif-data"], { type: "image/gif" });
  const text = new Blob(["plain-text"], { type: "text/plain" });
  const pdf = new Blob(["pdf-data"], { type: "application/pdf" });
  const emptyType = new Blob(["unknown-data"], { type: "" });

  const r1 = validateImageFile(gif);
  assert.equal(r1.valid, false);
  assert.match(r1.error ?? "", /Unsupported file format/i);

  const r2 = validateImageFile(text);
  assert.equal(r2.valid, false);
  assert.match(r2.error ?? "", /Unsupported file format/i);

  const r3 = validateImageFile(pdf);
  assert.equal(r3.valid, false);

  const r4 = validateImageFile(emptyType);
  assert.equal(r4.valid, false);
});

test("Case 7: Reject empty files (size === 0)", () => {
  const emptyJpeg = new Blob([], { type: "image/jpeg" });
  const emptyPng = new Blob([], { type: "image/png" });

  const r1 = validateImageFile(emptyJpeg);
  assert.equal(r1.valid, false);
  assert.match(r1.error ?? "", /empty/i);

  const r2 = validateImageFile(emptyPng);
  assert.equal(r2.valid, false);
  assert.match(r2.error ?? "", /empty/i);
});

test("Case 8: Reject files larger than 10 MB", () => {
  const oversizedBlob = {
    size: MAX_IMAGE_SIZE_BYTES + 1,
    type: "image/jpeg",
  } as Blob;

  const result = validateImageFile(oversizedBlob);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /exceeds maximum allowed size of 10 MB/i);

  const exactMaxBlob = {
    size: MAX_IMAGE_SIZE_BYTES,
    type: "image/jpeg",
  } as Blob;
  assert.equal(validateImageFile(exactMaxBlob).valid, true);
});

test("Case 9: Accept valid JPEG files", () => {
  const jpegBlob = new Blob(["jpeg-data"], { type: "image/jpeg" });
  const res = validateImageFile(jpegBlob);
  assert.equal(res.valid, true);
  assert.equal(res.error, undefined);
});

test("Case 10: Accept valid PNG files", () => {
  const pngBlob = new Blob(["png-data"], { type: "image/png" });
  const res = validateImageFile(pngBlob);
  assert.equal(res.valid, true);
  assert.equal(res.error, undefined);
});

test("Case 11: Accept valid WebP files", () => {
  const webpBlob = new Blob(["webp-data"], { type: "image/webp" });
  const res = validateImageFile(webpBlob);
  assert.equal(res.valid, true);
  assert.equal(res.error, undefined);
});

test("Case 12: Handle IndexedDB failures gracefully", async () => {
  // A. Null/unavailable factory
  const loadedWhenNull = await loadBackground(null);
  assert.equal(loadedWhenNull, null);

  const mockTarget = createMockElement();
  const nullManager = new BackgroundManager({
    idbFactory: null,
    targetElement: mockTarget,
  });
  const restoredNull = await nullManager.restore();
  assert.equal(restoredNull, false);
  assert.equal(mockTarget.style.backgroundImage, "");

  // B. Database open error
  const failingOpenFactory = new MockIDBFactory();
  failingOpenFactory.setFailure("open", true);

  const loadedWhenOpenFails = await loadBackground(failingOpenFactory as unknown as IDBFactory);
  assert.equal(loadedWhenOpenFails, null);

  const failManager = new BackgroundManager({
    idbFactory: failingOpenFactory as unknown as IDBFactory,
    targetElement: mockTarget,
  });
  const restoredFail = await failManager.restore();
  assert.equal(restoredFail, false);

  // C. Save failure leaves current background unchanged
  const failingPutFactory = new MockIDBFactory();
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  let urlCounter = 0;

  const mockCreate = (blob: Blob) => {
    const url = `blob:mock/${++urlCounter}`;
    createdUrls.push(url);
    return url;
  };
  const mockRevoke = (url: string) => {
    revokedUrls.push(url);
  };

  const manager = new BackgroundManager({
    idbFactory: failingPutFactory as unknown as IDBFactory,
    targetElement: mockTarget,
    createObjectURL: mockCreate,
    revokeObjectURL: mockRevoke,
  });

  // First save succeeds
  const initialBlob = new Blob(["initial-bg"], { type: "image/png" });
  await manager.changeBackground(initialBlob);
  const activeUrl = manager.getCurrentObjectUrl();
  assert.equal(activeUrl, "blob:mock/1");
  assert.equal(mockTarget.style.backgroundImage, 'url("blob:mock/1")');

  // Now configure put to fail
  failingPutFactory.setFailure("put", true);
  const failingBlob = new Blob(["new-bg-fails"], { type: "image/jpeg" });

  await assert.rejects(async () => {
    await manager.changeBackground(failingBlob);
  });

  // Active URL and DOM must remain unchanged, old URL must NOT be revoked, new URL not leaked
  assert.equal(manager.getCurrentObjectUrl(), activeUrl);
  assert.equal(mockTarget.style.backgroundImage, 'url("blob:mock/1")');
  assert.equal(revokedUrls.length, 0);
  assert.equal(createdUrls.length, 1);
});

test("Case 13: Background operations do not modify Pomodoro state", async () => {
  const factory = new MockIDBFactory();
  const mockTarget = createMockElement();
  const manager = new BackgroundManager({
    idbFactory: factory as unknown as IDBFactory,
    targetElement: mockTarget,
  });

  const controller = new PomodoroController();
  controller.start();
  controller.pause();

  const stateBefore = { ...controller.getState() };

  // Perform background operations
  const testBlob = new Blob(["test-image"], { type: "image/png" });
  await manager.changeBackground(testBlob);
  await manager.restore();
  await manager.removeBackground();

  const stateAfter = controller.getState();

  assert.equal(stateAfter.phase, stateBefore.phase);
  assert.equal(stateAfter.status, stateBefore.status);
  assert.equal(stateAfter.remainingMs, stateBefore.remainingMs);
  assert.equal(stateAfter.completedSessions, stateBefore.completedSessions);
  assert.equal(stateAfter.endTime, stateBefore.endTime);

  controller.dispose();
  manager.dispose();
});

test("Case 14: Replacing and removing backgrounds does not leak object URLs", async () => {
  const factory = new MockIDBFactory();
  const mockTarget = createMockElement();
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  let urlCounter = 0;

  const mockCreate = (_b: Blob) => {
    const url = `blob:mock/${++urlCounter}`;
    createdUrls.push(url);
    return url;
  };
  const mockRevoke = (url: string) => {
    revokedUrls.push(url);
  };

  const manager = new BackgroundManager({
    idbFactory: factory as unknown as IDBFactory,
    targetElement: mockTarget,
    createObjectURL: mockCreate,
    revokeObjectURL: mockRevoke,
  });

  // Step 1: Set initial background
  const blob1 = new Blob(["image-1"], { type: "image/png" });
  await manager.changeBackground(blob1);
  assert.equal(manager.getCurrentObjectUrl(), "blob:mock/1");
  assert.deepEqual(createdUrls, ["blob:mock/1"]);
  assert.deepEqual(revokedUrls, []);

  // Step 2: Replace with second background -> previous URL must be revoked
  const blob2 = new Blob(["image-2"], { type: "image/jpeg" });
  await manager.changeBackground(blob2);
  assert.equal(manager.getCurrentObjectUrl(), "blob:mock/2");
  assert.deepEqual(createdUrls, ["blob:mock/1", "blob:mock/2"]);
  assert.deepEqual(revokedUrls, ["blob:mock/1"]);

  // Step 3: Remove background -> current URL must be revoked and current URL cleared
  await manager.removeBackground();
  assert.equal(manager.getCurrentObjectUrl(), null);
  assert.equal(mockTarget.style.backgroundImage, "");
  assert.deepEqual(revokedUrls, ["blob:mock/1", "blob:mock/2"]);

  // Step 4: Removing again when none exists is harmless
  await manager.removeBackground();
  assert.deepEqual(revokedUrls, ["blob:mock/1", "blob:mock/2"]);

  manager.dispose();
});

test("Case 15: Stale asynchronous restore cannot override a newer user-selected background", async () => {
  const factory = new MockIDBFactory();
  const mockTarget = createMockElement();
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  let urlCounter = 0;

  const mockCreate = (_b: Blob) => {
    const url = `blob:mock/${++urlCounter}`;
    createdUrls.push(url);
    return url;
  };
  const mockRevoke = (url: string) => {
    revokedUrls.push(url);
  };

  // Seed the store with an old background
  const oldBlob = new Blob(["old-saved-background"], { type: "image/png" });
  factory.data.set(BACKGROUND_KEY, oldBlob);
  factory.stores.add(STORE_NAME);

  // Set loadBackground to delay by 60ms
  factory.setDelay("get", 60);

  const manager = new BackgroundManager({
    idbFactory: factory as unknown as IDBFactory,
    targetElement: mockTarget,
    createObjectURL: mockCreate,
    revokeObjectURL: mockRevoke,
  });

  // 1. Trigger asynchronous restore (simulating application startup)
  const restorePromise = manager.restore();

  // 2. User immediately selects and uploads a new background before restore completes
  const newerBlob = new Blob(["user-new-choice"], { type: "image/webp" });
  await manager.changeBackground(newerBlob);

  assert.equal(manager.getCurrentObjectUrl(), "blob:mock/1");
  assert.equal(mockTarget.style.backgroundImage, 'url("blob:mock/1")');

  // 3. Await the delayed restore completion
  const restoreResult = await restorePromise;

  // Stale restore must return false and NOT override the newer background
  assert.equal(restoreResult, false);
  assert.equal(manager.getCurrentObjectUrl(), "blob:mock/1");
  assert.equal(mockTarget.style.backgroundImage, 'url("blob:mock/1")');
  // Only 1 URL was created (for newerBlob); the old blob never created an object URL
  assert.deepEqual(createdUrls, ["blob:mock/1"]);
  assert.deepEqual(revokedUrls, []);

  manager.dispose();
});

// ============================================================================
// Phase 5 Finalization Regression Tests
// ============================================================================

test("Regression 16: Upload A followed rapidly by Upload B persists and displays B", async () => {
  const factory = new MockIDBFactory();
  const mockTarget = createMockElement();
  const blobA = new Blob(["image-a-content"], { type: "image/png" });
  const blobB = new Blob(["image-b-content-different"], { type: "image/webp" });

  // Simulate out-of-order latency: blobA takes 50ms, blobB takes 5ms
  factory.setDelay("put", (_op, _key, val) => {
    if (val === blobA) return 50;
    return 5;
  });

  const manager = new BackgroundManager({
    idbFactory: factory as unknown as IDBFactory,
    targetElement: mockTarget,
  });

  // Dispatch both rapidly without awaiting the first
  const p1 = manager.changeBackground(blobA);
  const p2 = manager.changeBackground(blobB);
  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(res1.valid, true);
  assert.equal(res2.valid, true);

  // IndexedDB must persist blobB
  const persisted = factory.data.get(BACKGROUND_KEY);
  assert.equal(persisted, blobB);

  // DOM must display blobB
  const currentUrl = manager.getCurrentObjectUrl();
  assert.ok(currentUrl);
  assert.equal(mockTarget.style.backgroundImage, `url("${currentUrl}")`);

  manager.dispose();
});

test("Regression 17: Upload A followed by Remove leaves no persisted background", async () => {
  const factory = new MockIDBFactory();
  const mockTarget = createMockElement();
  const blobA = new Blob(["image-a-content"], { type: "image/png" });

  // Simulate latency: put takes 50ms, delete takes 5ms
  factory.setDelay("put", 50);
  factory.setDelay("delete", 5);

  const manager = new BackgroundManager({
    idbFactory: factory as unknown as IDBFactory,
    targetElement: mockTarget,
  });

  // Dispatch upload A then remove rapidly
  const p1 = manager.changeBackground(blobA);
  const p2 = manager.removeBackground();
  await Promise.all([p1, p2]);

  // IndexedDB must have no background
  assert.equal(factory.data.has(BACKGROUND_KEY), false);

  // DOM must display default background (empty string)
  assert.equal(manager.getCurrentObjectUrl(), null);
  assert.equal(mockTarget.style.backgroundImage, "");

  manager.dispose();
});

test("Regression 18: Remove followed by Upload B persists and displays B", async () => {
  const factory = new MockIDBFactory();
  const mockTarget = createMockElement();
  const initialBlob = new Blob(["initial-image"], { type: "image/png" });
  const blobB = new Blob(["image-b-content"], { type: "image/jpeg" });

  const manager = new BackgroundManager({
    idbFactory: factory as unknown as IDBFactory,
    targetElement: mockTarget,
  });
  await manager.changeBackground(initialBlob);

  // Simulate latency: delete takes 50ms, put takes 5ms
  factory.setDelay("delete", 50);
  factory.setDelay("put", 5);

  // Dispatch remove then upload B rapidly
  const p1 = manager.removeBackground();
  const p2 = manager.changeBackground(blobB);
  await Promise.all([p1, p2]);

  // IndexedDB must persist blobB
  const persisted = factory.data.get(BACKGROUND_KEY);
  assert.equal(persisted, blobB);

  // DOM must display blobB
  const currentUrl = manager.getCurrentObjectUrl();
  assert.ok(currentUrl);
  assert.equal(mockTarget.style.backgroundImage, `url("${currentUrl}")`);

  manager.dispose();
});

test("Regression 19: Failed deletion preserves the existing displayed background", async () => {
  const factory = new MockIDBFactory();
  const mockTarget = createMockElement();
  const initialBlob = new Blob(["initial-image"], { type: "image/png" });

  const manager = new BackgroundManager({
    idbFactory: factory as unknown as IDBFactory,
    targetElement: mockTarget,
  });
  await manager.changeBackground(initialBlob);

  const originalBgStyle = mockTarget.style.backgroundImage;
  assert.ok(originalBgStyle.startsWith('url("blob:'));

  // Configure deletion failure
  factory.setFailure("delete", true);

  // removeBackground must reject
  await assert.rejects(async () => {
    await manager.removeBackground();
  }, /Mock IndexedDB delete failure/);

  // Displayed background must be preserved
  assert.equal(mockTarget.style.backgroundImage, originalBgStyle);
  assert.equal(factory.data.get(BACKGROUND_KEY), initialBlob);

  manager.dispose();
});

test("Regression 20: Failed deletion does not revoke the active Object URL", async () => {
  const factory = new MockIDBFactory();
  const mockTarget = createMockElement();
  const initialBlob = new Blob(["initial-image"], { type: "image/png" });
  const revokedUrls: string[] = [];

  const manager = new BackgroundManager({
    idbFactory: factory as unknown as IDBFactory,
    targetElement: mockTarget,
    revokeObjectURL: (url) => {
      revokedUrls.push(url);
    },
  });
  await manager.changeBackground(initialBlob);

  const activeUrl = manager.getCurrentObjectUrl();
  assert.ok(activeUrl);

  // Configure deletion failure
  factory.setFailure("delete", true);

  await assert.rejects(async () => {
    await manager.removeBackground();
  }, /Mock IndexedDB delete failure/);

  // Active URL must remain intact and not revoked
  assert.equal(manager.getCurrentObjectUrl(), activeUrl);
  assert.equal(revokedUrls.includes(activeUrl), false);
  assert.equal(revokedUrls.length, 0);

  manager.dispose();
});
