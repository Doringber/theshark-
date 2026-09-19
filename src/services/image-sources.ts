import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import {
  resolveMediaType,
  validateImagePath,
  type ProductImage,
} from "../domain/schemas.js";

/** Maximum image file size in bytes (20 MB) */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

export type ImageSourceResult =
  { ok: true; paths: string[] } | { ok: false; errors: string[] };

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function isImageFile(path: string): boolean {
  return IMAGE_EXTS.has(extname(path).toLowerCase()) && Boolean(resolveMediaType(path));
}

/**
 * Collect image paths from folders and files.
 * Folder contents are sorted by filename. Explicit file lists keep caller order.
 */
export function collectImageSources(sources: string[]): ImageSourceResult {
  const paths: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const raw of sources) {
    const abs = resolve(raw);
    if (!existsSync(abs)) {
      errors.push(`Image not found: "${raw}"`);
      continue;
    }
    const stats = statSync(abs);
    if (stats.isDirectory()) {
      const entries = readdirSync(abs)
        .filter((name) => isImageFile(name))
        .sort((a, b) => a.localeCompare(b));
      for (const name of entries) {
        const file = resolve(abs, name);
        if (seen.has(file)) continue;
        seen.add(file);
        paths.push(file);
      }
      continue;
    }
    if (!isImageFile(abs)) {
      errors.push(`Unsupported image format for "${raw}". Supported: JPEG, PNG, WebP`);
      continue;
    }
    if (seen.has(abs)) {
      errors.push(`Duplicate image: "${raw}"`);
      continue;
    }
    seen.add(abs);
    paths.push(abs);
  }

  if (errors.length > 0) return { ok: false, errors };
  if (paths.length === 0) return { ok: false, errors: ["No valid images provided"] };
  return { ok: true, paths };
}

/**
 * Validate and prepare product images from file paths.
 * Checks: existence, size, format, deduplication.
 */
export function validateImages(
  imagePaths: string[],
): { valid: true; images: ProductImage[] } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const images: ProductImage[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < imagePaths.length; i++) {
    const rawPath = imagePaths[i] ?? "";
    const absPath = resolve(rawPath);

    if (seen.has(absPath)) {
      errors.push(`Duplicate image: "${rawPath}"`);
      continue;
    }
    seen.add(absPath);

    if (!existsSync(absPath)) {
      errors.push(`Image not found: "${rawPath}"`);
      continue;
    }

    const stats = statSync(absPath);
    if (stats.size === 0) {
      errors.push(`Image is empty (0 bytes): "${rawPath}"`);
      continue;
    }
    if (stats.size > MAX_IMAGE_SIZE) {
      errors.push(
        `Image too large (${(stats.size / 1024 / 1024).toFixed(1)} MB, max 20 MB): "${rawPath}"`,
      );
      continue;
    }

    const pathResult = validateImagePath(absPath);
    if (!pathResult.valid) {
      errors.push(pathResult.reason);
      continue;
    }

    images.push({
      path: absPath,
      mediaType: pathResult.mediaType,
      order: i,
      uploadState: "approved_for_upload",
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  if (images.length === 0) {
    return { valid: false, errors: ["No valid images provided"] };
  }
  return { valid: true, images };
}
