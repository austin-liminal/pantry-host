/**
 * Photo helpers for the web demo.
 * Handles storing photos in OPFS — from file uploads, pasted images,
 * and external URLs (fetched and stored locally when CORS allows).
 */

import { opfsStorage } from '@/lib/storage-opfs';

/**
 * Store a Blob (from file input or clipboard) in OPFS.
 * Returns the opfs:// path and a blob URL for preview.
 */
export async function storePhotoBlob(blob: Blob, ext?: string): Promise<{ path: string; previewUrl: string }> {
  const extension = ext || guessExtension(blob.type);
  const uuid = crypto.randomUUID();
  const filename = `${uuid}.${extension}`;
  await opfsStorage.putFile(filename, blob);
  return { path: `opfs://${filename}`, previewUrl: URL.createObjectURL(blob) };
}

/**
 * Attempt to fetch an external image URL and store it in OPFS.
 * Returns the opfs:// path if successful, or the original URL if CORS blocks it.
 */
export async function fetchAndStorePhoto(url: string): Promise<{ path: string; previewUrl: string }> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Not an image');
    const ext = guessExtension(blob.type);
    return storePhotoBlob(blob, ext);
  } catch {
    // CORS blocked or fetch failed — keep external URL
    return { path: url, previewUrl: url };
  }
}

function guessExtension(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'jpg';
}
