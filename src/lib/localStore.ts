/**
 * localStore — IndexedDB-based persistence for analysis data.
 *
 * Designed as a fallback when the Supabase save fails. Data is stored
 * locally in the browser and survives page refreshes and browser restarts.
 * Users can also export/import analyses as JSON files.
 *
 * Storage limits: IndexedDB is typically generous (hundreds of MB to GB),
 * so large codebases are fine.
 */

const DB_NAME = "codemap-local";
const DB_VERSION = 1;
const STORE_NAME = "analyses";

/* ── Internal helpers ───────────────────────────────────────────────── */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("created_at", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("Failed to open IndexedDB"));
  });
}

export interface LocalAnalysis {
  id: string;
  project: unknown;
  explanations: Array<[string, unknown]>;
  failedIds: string[];
  name: string;
  sourceType: string;
  sourceUrl: string | null;
  createdAt: string;
  fileCount: number;
  functionCount: number;
}

/* ── Public API ─────────────────────────────────────────────────────── */

/** Save an analysis to IndexedDB. Overwrites if `id` already exists. */
export async function saveToLocalStore(data: LocalAnalysis): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("Failed to save to IndexedDB"));
  });
}

/** Load a single analysis by its local ID. */
export async function loadFromLocalStore(
  id: string,
): Promise<LocalAnalysis | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve((req.result as LocalAnalysis) ?? null);
    req.onerror = () => reject(new Error("Failed to read from IndexedDB"));
  });
}

/** List all locally stored analyses, newest first. */
export async function listLocalAnalyses(): Promise<LocalAnalysis[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("created_at");
    const req = index.openCursor(null, "prev");
    const results: LocalAnalysis[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        results.push(cursor.value as LocalAnalysis);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(new Error("Failed to list IndexedDB"));
  });
}

/** Delete a local analysis by ID. */
export async function deleteFromLocalStore(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("Failed to delete from IndexedDB"));
  });
}

/** Export an analysis as a downloadable JSON file. */
export function downloadAsJson(data: LocalAnalysis): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.name.replace(/[^a-zA-Z0-9-_ ]/g, "_")}.codemap.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import an analysis from a JSON file (via file input). */
export function importFromJsonFile(
  file: File,
): Promise<LocalAnalysis> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as LocalAnalysis;
        if (!data.id || !data.project) {
          reject(new Error("Invalid analysis file"));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error("Could not parse file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}