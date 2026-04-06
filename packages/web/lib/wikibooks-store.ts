/**
 * Wikibooks Cookbook OPFS storage — download once, browse offline forever.
 */

import { putData, getData } from './storage-opfs';
import { fetchWikibooksDataset, type WikibooksEntry } from '@pantry-host/shared/wikibooks';

const DATA_FILE = 'wikibooks-cookbook.json';
const META_FILE = 'wikibooks-meta.json';

interface WikibooksMeta {
  downloaded: boolean;
  timestamp: number;
  count: number;
}

/** Check if the dataset has been downloaded */
export async function isWikibooksDownloaded(): Promise<boolean> {
  const meta = await getData<WikibooksMeta>(META_FILE);
  return meta?.downloaded === true;
}

/** Load the dataset from OPFS (returns null if not downloaded) */
export async function loadWikibooksData(): Promise<WikibooksEntry[] | null> {
  return getData<WikibooksEntry[]>(DATA_FILE);
}

/**
 * Download the full dataset from Hugging Face, normalize, and store in OPFS.
 * Calls onProgress(done, total) after each batch.
 */
export async function downloadWikibooksDataset(
  onProgress?: (done: number, total: number) => void,
): Promise<WikibooksEntry[]> {
  const entries = await fetchWikibooksDataset(onProgress);

  // Store dataset + metadata
  await putData(DATA_FILE, entries);
  await putData(META_FILE, {
    downloaded: true,
    timestamp: Date.now(),
    count: entries.length,
  } satisfies WikibooksMeta);

  return entries;
}
