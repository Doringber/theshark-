import { describe, it, expect } from "vitest";
import {
  validateImagePath,
  resolveMediaType,
  ProductImageSchema,
  validateUploadManifest,
  getUploadableImages,
  type ProductImage,
} from "../../src/domain/schemas.js";

describe("Image validation", () => {
  describe("validateImagePath", () => {
    it("accepts JPEG files (.jpg)", () => {
      const result = validateImagePath("photo.jpg");
      expect(result).toEqual({ valid: true, mediaType: "image/jpeg" });
    });

    it("accepts JPEG files (.jpeg)", () => {
      const result = validateImagePath("photo.jpeg");
      expect(result).toEqual({ valid: true, mediaType: "image/jpeg" });
    });

    it("accepts PNG files", () => {
      const result = validateImagePath("photo.png");
      expect(result).toEqual({ valid: true, mediaType: "image/png" });
    });

    it("accepts WebP files", () => {
      const result = validateImagePath("photo.webp");
      expect(result).toEqual({ valid: true, mediaType: "image/webp" });
    });

    it("is case-insensitive for extensions", () => {
      expect(validateImagePath("PHOTO.JPG")).toEqual({
        valid: true,
        mediaType: "image/jpeg",
      });
      expect(validateImagePath("photo.PNG")).toEqual({
        valid: true,
        mediaType: "image/png",
      });
    });

    it("rejects unsupported formats (GIF)", () => {
      const result = validateImagePath("photo.gif");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("Unsupported image format");
      }
    });

    it("rejects unsupported formats (BMP)", () => {
      const result = validateImagePath("photo.bmp");
      expect(result.valid).toBe(false);
    });

    it("rejects files without extension", () => {
      const result = validateImagePath("photo");
      expect(result.valid).toBe(false);
    });

    it("accepts full path with supported extension", () => {
      const result = validateImagePath("/Users/me/photos/chair-front.jpg");
      expect(result).toEqual({ valid: true, mediaType: "image/jpeg" });
    });
  });

  describe("resolveMediaType", () => {
    it("resolves .jpg to image/jpeg", () => {
      expect(resolveMediaType("file.jpg")).toBe("image/jpeg");
    });

    it("resolves .webp to image/webp", () => {
      expect(resolveMediaType("file.webp")).toBe("image/webp");
    });

    it("returns undefined for unsupported extension", () => {
      expect(resolveMediaType("file.tiff")).toBeUndefined();
    });
  });

  describe("ProductImageSchema", () => {
    const validImage: ProductImage = {
      path: "/photos/chair.jpg",
      mediaType: "image/jpeg",
      order: 0,
      uploadState: "approved_for_upload",
    };

    it("validates a correct product image", () => {
      expect(() => ProductImageSchema.parse(validImage)).not.toThrow();
    });

    it("rejects empty path", () => {
      expect(() => ProductImageSchema.parse({ ...validImage, path: "" })).toThrow();
    });

    it("rejects invalid media type", () => {
      expect(() =>
        ProductImageSchema.parse({ ...validImage, mediaType: "image/gif" }),
      ).toThrow();
    });

    it("rejects negative order", () => {
      expect(() => ProductImageSchema.parse({ ...validImage, order: -1 })).toThrow();
    });

    it("rejects invalid upload state", () => {
      expect(() =>
        ProductImageSchema.parse({ ...validImage, uploadState: "unknown" }),
      ).toThrow();
    });

    it("accepts all three upload states", () => {
      for (const state of [
        "approved_for_upload",
        "analysis_only",
        "replace_required",
      ] as const) {
        expect(() =>
          ProductImageSchema.parse({ ...validImage, uploadState: state }),
        ).not.toThrow();
      }
    });
  });

  describe("Image ordering", () => {
    it("preserves stable user-selected order via getUploadableImages", () => {
      const images: ProductImage[] = [
        {
          path: "c.jpg",
          mediaType: "image/jpeg",
          order: 2,
          uploadState: "approved_for_upload",
        },
        {
          path: "a.jpg",
          mediaType: "image/jpeg",
          order: 0,
          uploadState: "approved_for_upload",
        },
        {
          path: "b.jpg",
          mediaType: "image/jpeg",
          order: 1,
          uploadState: "approved_for_upload",
        },
      ];
      const sorted = getUploadableImages(images);
      expect(sorted.map((i) => i.path)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    });

    it("excludes non-approved images from upload set", () => {
      const images: ProductImage[] = [
        {
          path: "safe.jpg",
          mediaType: "image/jpeg",
          order: 0,
          uploadState: "approved_for_upload",
        },
        {
          path: "serial.jpg",
          mediaType: "image/jpeg",
          order: 1,
          uploadState: "analysis_only",
        },
        {
          path: "sensitive.jpg",
          mediaType: "image/jpeg",
          order: 2,
          uploadState: "replace_required",
        },
      ];
      const uploadable = getUploadableImages(images);
      expect(uploadable).toHaveLength(1);
      expect(uploadable[0]?.path).toBe("safe.jpg");
    });
  });

  describe("validateUploadManifest", () => {
    it("accepts a manifest with only approved images", () => {
      const images: ProductImage[] = [
        {
          path: "a.jpg",
          mediaType: "image/jpeg",
          order: 0,
          uploadState: "approved_for_upload",
        },
        {
          path: "b.png",
          mediaType: "image/png",
          order: 1,
          uploadState: "approved_for_upload",
        },
      ];
      expect(validateUploadManifest(images)).toEqual({ valid: true });
    });

    it("rejects a manifest containing an analysis_only image", () => {
      const images: ProductImage[] = [
        {
          path: "safe.jpg",
          mediaType: "image/jpeg",
          order: 0,
          uploadState: "approved_for_upload",
        },
        {
          path: "serial-number.jpg",
          mediaType: "image/jpeg",
          order: 1,
          uploadState: "analysis_only",
        },
      ];
      const result = validateUploadManifest(images);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("serial-number.jpg");
      }
    });

    it("rejects a manifest containing a replace_required image", () => {
      const images: ProductImage[] = [
        {
          path: "sensitive.jpg",
          mediaType: "image/jpeg",
          order: 0,
          uploadState: "replace_required",
        },
      ];
      const result = validateUploadManifest(images);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("sensitive.jpg");
      }
    });

    it("allows analysis_only images for local fact extraction (not upload)", () => {
      const analysisImage: ProductImage = {
        path: "system-info.jpg",
        mediaType: "image/jpeg",
        order: 1,
        uploadState: "analysis_only",
      };
      expect(ProductImageSchema.parse(analysisImage)).toBeDefined();
      const manifest = validateUploadManifest([analysisImage]);
      expect(manifest.valid).toBe(false);
    });
  });
});
