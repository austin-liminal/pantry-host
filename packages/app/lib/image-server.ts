/**
 * Server-only image processing with sharp.
 * NOT safe for browser bundling — uses Node built-ins (path, fs) and native modules (sharp).
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

/** Widths to generate for responsive images. Heights are 16:9. */
const VARIANT_WIDTHS = [400, 800, 1200] as const;

/** Compute 16:9 height for a given width. */
function heightFor(width: number): number {
  return Math.round((width * 9) / 16);
}

/**
 * Process an uploaded image into responsive variants.
 *
 * For each target width, generates:
 *   - WebP (quality 80)
 *   - JPEG (quality 80)
 *   - Grayscale JPEG (quality 80) for @media (monochrome) / e-ink displays
 *
 * All variants are cropped to 16:9 aspect ratio (center crop).
 * GIF files are skipped to preserve animation.
 *
 * @param inputPath - Absolute path to the original uploaded file
 * @param uploadsDir - Absolute path to the uploads directory
 * @param uuid - The UUID used for the original filename (without extension)
 */
/**
 * Copy the 400px JPEG variant to a friendly {slug}.jpg filename.
 * Used by ICS calendar exports so iOS Calendar shows a readable name.
 * Retries up to 5 times (1s apart) in case processing is still running.
 */
export async function copyFriendlyPhoto(
  photoUrl: string,
  slug: string,
  uploadsDir: string,
): Promise<void> {
  if (!photoUrl.startsWith('/uploads/') || !slug) return;
  const uuid = photoUrl.replace('/uploads/', '').replace(/\.[^.]+$/, '');
  const src = path.join(uploadsDir, `${uuid}-400.jpg`);
  const dest = path.join(uploadsDir, `${slug}.jpg`);

  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export async function processUploadedImage(
  inputPath: string,
  uploadsDir: string,
  uuid: string,
): Promise<void> {
  const ext = path.extname(inputPath).toLowerCase();

  // Skip GIFs — preserve animation
  if (ext === '.gif') return;

  const metadata = await sharp(inputPath).metadata();
  const originalWidth = metadata.width ?? 0;

  for (const width of VARIANT_WIDTHS) {
    // Allow mild upscaling (up to 2x) for smaller originals
    if (originalWidth * 2 < width) continue;

    const height = heightFor(width);
    const resized = sharp(inputPath).resize(width, height, {
      fit: 'cover',
      position: 'centre',
    });

    await Promise.all([
      // WebP
      resized.clone().webp({ quality: 80 }).toFile(
        path.join(uploadsDir, `${uuid}-${width}.webp`),
      ),
      // JPEG
      resized.clone().jpeg({ quality: 80 }).toFile(
        path.join(uploadsDir, `${uuid}-${width}.jpg`),
      ),
      // Grayscale JPEG for monochrome/e-ink displays
      resized.clone().grayscale().jpeg({ quality: 80 }).toFile(
        path.join(uploadsDir, `${uuid}-${width}-gray.jpg`),
      ),
    ]);
  }
}
