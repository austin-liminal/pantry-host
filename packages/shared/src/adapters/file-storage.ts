/**
 * Storage adapter interface for file operations (images, uploads).
 * Implemented by LocalFSAdapter (packages/app) and OPFSAdapter (packages/web).
 */
export interface FileStorageAdapter {
  getFile(path: string): Promise<Blob>;
  putFile(path: string, file: Blob): Promise<void>;
  deleteFile(path: string): Promise<void>;
  getURL(path: string): string;
}
