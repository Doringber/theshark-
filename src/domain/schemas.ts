import { z } from "zod";

/**
 * Image upload state — controls whether an image can be sent to platform adapters.
 * - approved_for_upload: safe to pass to any platform adapter
 * - analysis_only: used locally for AI fact extraction but never uploaded
 * - replace_required: contains sensitive data; must be replaced or excluded before upload
 */
export const ImageUploadState = z.enum([
  "approved_for_upload",
  "analysis_only",
  "replace_required",
]);
export type ImageUploadState = z.infer<typeof ImageUploadState>;

/** Supported image MIME types */
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/** File extension to MIME type mapping */
const EXTENSION_TO_MIME: Record<string, SupportedImageType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Resolve MIME type from file extension.
 * Returns undefined for unsupported extensions.
 */
export function resolveMediaType(filePath: string): SupportedImageType | undefined {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext) return undefined;
  return EXTENSION_TO_MIME[ext];
}

/** A single product image with ordering and upload state */
export const ProductImageSchema = z.object({
  /** Local file path */
  path: z.string().min(1, "Image path must not be empty"),
  /** Resolved MIME type */
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  /** User-selected display order (0-based) */
  order: z.number().int().min(0),
  /** Upload eligibility state */
  uploadState: ImageUploadState,
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

/** Fact confidence level for AI-extracted observations */
export const FactConfidence = z.enum(["observed", "user_confirmed", "unknown"]);
export type FactConfidence = z.infer<typeof FactConfidence>;

/** A single fact about the product, with its confidence level */
export const ProductFactSchema = z.object({
  field: z.string().min(1),
  value: z.string(),
  confidence: FactConfidence,
});
export type ProductFact = z.infer<typeof ProductFactSchema>;

/** Condition of the item */
export const ItemCondition = z.enum(["new", "like_new", "good", "fair", "poor"]);
export type ItemCondition = z.infer<typeof ItemCondition>;

/** The master listing that the user builds and approves */
export const ListingSchema = z
  .object({
    /** Auto-generated unique listing ID */
    id: z.string().uuid(),
    /** Product title — may be AI-proposed but must be user-confirmed */
    title: z.string().min(1, "Title is required"),
    /** Product description */
    description: z.string().min(1, "Description is required"),
    /** Price in NIS — always user-confirmed */
    price: z.number().positive("Price must be a positive number"),
    /** Currency code */
    currency: z.literal("NIS"),
    /** Item condition — user-confirmed */
    condition: ItemCondition,
    /** City or area — user-confirmed */
    location: z.string().min(1, "Location is required"),
    /** Marketplace category (e.g. "Furniture") — user-confirmed */
    category: z.string().optional(),
    /** Known defects or missing parts */
    defects: z.string().optional(),
    /** Pickup/delivery details */
    pickupDelivery: z.string().optional(),
    /** Content language */
    language: z.enum(["he", "en", "both"]).default("he"),
    /** Ordered product images */
    images: z.array(ProductImageSchema).min(1, "At least one image is required"),
    /** AI-observed and user-confirmed facts */
    facts: z.array(ProductFactSchema).default([]),
  })
  .refine(
    (listing) =>
      listing.images.some((img) => img.uploadState === "approved_for_upload"),
    {
      message: "At least one image must be approved for upload",
      path: ["images"],
    },
  );
export type Listing = z.infer<typeof ListingSchema>;

/** The approved listing ready for platform adapters */
export const ApprovedListingSchema = ListingSchema.refine(
  (listing) => {
    const uploadable = listing.images.filter(
      (img) => img.uploadState === "approved_for_upload",
    );
    return uploadable.length >= 1;
  },
  {
    message: "Approved listing must have at least one uploadable image",
    path: ["images"],
  },
);
export type ApprovedListing = z.infer<typeof ApprovedListingSchema>;

/**
 * Validate that an upload manifest contains only approved images.
 * Returns an error if any non-approved image is present.
 */
export function validateUploadManifest(
  images: ProductImage[],
): { valid: true } | { valid: false; reason: string } {
  const disallowed = images.filter((img) => img.uploadState !== "approved_for_upload");
  if (disallowed.length > 0) {
    const paths = disallowed.map((img) => img.path).join(", ");
    return {
      valid: false,
      reason: `Upload manifest contains non-approved images: ${paths}`,
    };
  }
  return { valid: true };
}

/**
 * Extract only the approved-for-upload images in their correct order.
 */
export function getUploadableImages(images: ProductImage[]): ProductImage[] {
  return images
    .filter((img) => img.uploadState === "approved_for_upload")
    .sort((a, b) => a.order - b.order);
}

/**
 * Validate image file paths: check extension is supported.
 * Does NOT check file existence (that's done at runtime with fs).
 */
export function validateImagePath(
  filePath: string,
): { valid: true; mediaType: SupportedImageType } | { valid: false; reason: string } {
  const mediaType = resolveMediaType(filePath);
  if (!mediaType) {
    return {
      valid: false,
      reason: `Unsupported image format for "${filePath}". Supported: JPEG, PNG, WebP`,
    };
  }
  return { valid: true, mediaType };
}
