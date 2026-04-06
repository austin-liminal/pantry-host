/**
 * OPFS (Origin Private File System) storage adapter.
 *
 * Implements the FileStorageAdapter interface from @pantry-host/shared
 * using the browser's OPFS API for persistent file storage.
 */

import type { FileStorageAdapter } from '@pantry-host/shared/adapters/file-storage';

const ROOT_DIR = 'pantryhost';
const IMAGES_DIR = 'images';

async function getImagesDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const appDir = await root.getDirectoryHandle(ROOT_DIR, { create: true });
  return appDir.getDirectoryHandle(IMAGES_DIR, { create: true });
}

const objectURLs = new Map<string, string>();

export const opfsStorage: FileStorageAdapter = {
  async getFile(path: string): Promise<Blob> {
    const dir = await getImagesDir();
    const fileHandle = await dir.getFileHandle(path);
    return fileHandle.getFile();
  },

  async putFile(path: string, file: Blob): Promise<void> {
    const dir = await getImagesDir();
    const fileHandle = await dir.getFileHandle(path, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();

    // Revoke old object URL if it exists
    const old = objectURLs.get(path);
    if (old) URL.revokeObjectURL(old);
    objectURLs.delete(path);
  },

  async deleteFile(path: string): Promise<void> {
    const dir = await getImagesDir();
    await dir.removeEntry(path);

    const old = objectURLs.get(path);
    if (old) URL.revokeObjectURL(old);
    objectURLs.delete(path);
  },

  getURL(path: string): string {
    // If we already have an object URL, return it
    const existing = objectURLs.get(path);
    if (existing) return existing;

    // Return a placeholder — the actual URL must be created async
    // Components should use getFileURL() instead for async access
    return '';
  },
};

/** Async version that creates a real object URL */
export async function getFileURL(path: string): Promise<string> {
  const existing = objectURLs.get(path);
  if (existing) return existing;

  const file = await opfsStorage.getFile(path);
  const url = URL.createObjectURL(file);
  objectURLs.set(path, url);
  return url;
}

// ── Data storage (JSON files in app root, not images subdir) ─────────────────

async function getAppDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ROOT_DIR, { create: true });
}

/** Store a JSON-serializable value in OPFS app directory */
export async function putData(filename: string, data: unknown): Promise<void> {
  const dir = await getAppDir();
  const handle = await dir.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data));
  await writable.close();
}

/** Retrieve a JSON value from OPFS app directory, or null if not found */
export async function getData<T>(filename: string): Promise<T | null> {
  try {
    const dir = await getAppDir();
    const handle = await dir.getFileHandle(filename);
    const file = await handle.getFile();
    const text = await file.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** List all files in OPFS images directory */
export async function listFiles(): Promise<string[]> {
  const dir = await getImagesDir();
  const files: string[] = [];
  for await (const [name, handle] of (dir as any).entries()) {
    if (handle.kind === 'file') files.push(name);
  }
  return files;
}
