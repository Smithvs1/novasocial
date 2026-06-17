import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Download a URL to a Buffer, with HTTP status validation.
 * Replaces 4+ identical fetch->arrayBuffer->Buffer patterns.
 */
export async function downloadToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Download a URL directly to a file path.
 */
export async function downloadToFile(url, filePath) {
  const buf = await downloadToBuffer(url);
  writeFileSync(filePath, buf);
  return buf;
}

/**
 * Safely remove temp files -- ignores errors for already-deleted files.
 * Replaces 6+ duplicated try/unlinkSync/catch blocks.
 */
export function cleanupFiles(...paths) {
  for (const p of paths) {
    try { unlinkSync(p); } catch { /* already gone */ }
  }
}

/**
 * Create a temp directory with a given prefix and return a helper
 * that resolves file names within it.
 */
export function createTempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, resolve: (name) => join(dir, name) };
}
