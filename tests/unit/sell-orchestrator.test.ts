import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { validateImages } from "../../src/commands/sell.js";

const FIXTURES = resolve(__dirname, "../fixtures/images");
const PHOTO_1 = resolve(FIXTURES, "test-photo-1.jpg");
const PHOTO_2 = resolve(FIXTURES, "test-photo-2.jpg");

describe("sell orchestrator — image validation", () => {
  it("accepts valid JPEG images that exist", () => {
    const result = validateImages([PHOTO_1]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.images).toHaveLength(1);
      expect(result.images[0]?.mediaType).toBe("image/jpeg");
      expect(result.images[0]?.uploadState).toBe("approved_for_upload");
    }
  });

  it("accepts multiple images in order", () => {
    const result = validateImages([PHOTO_1, PHOTO_2]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.images).toHaveLength(2);
      expect(result.images[0]?.order).toBe(0);
      expect(result.images[1]?.order).toBe(1);
    }
  });

  it("rejects non-existent images", () => {
    const result = validateImages(["/tmp/this-does-not-exist-abc.jpg"]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("not found");
    }
  });

  it("rejects unsupported formats", () => {
    const result = validateImages([resolve(FIXTURES, "test-photo-1.bmp")]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toBeDefined();
    }
  });

  it("rejects duplicate images", () => {
    const result = validateImages([PHOTO_1, PHOTO_1]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("Duplicate");
    }
  });

  it("rejects empty input", () => {
    const result = validateImages([]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toContain("No valid images");
    }
  });

  it("sets all images to approved_for_upload by default", () => {
    const result = validateImages([PHOTO_1, PHOTO_2]);
    expect(result.valid).toBe(true);
    if (result.valid) {
      for (const img of result.images) {
        expect(img.uploadState).toBe("approved_for_upload");
      }
    }
  });
});
