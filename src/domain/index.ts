export {
  ImageUploadState,
  SUPPORTED_IMAGE_TYPES,
  ProductImageSchema,
  ProductFactSchema,
  FactConfidence,
  ItemCondition,
  ListingSchema,
  ApprovedListingSchema,
  validateUploadManifest,
  getUploadableImages,
  validateImagePath,
  resolveMediaType,
} from "./schemas.js";

export type {
  SupportedImageType,
  ProductImage,
  ProductFact,
  Listing,
  ApprovedListing,
} from "./schemas.js";

export {
  PlatformName,
  ALLOWED_HOSTS,
  SharkConfigSchema,
  validatePlatformUrl,
  validateHostForPlatform,
  getDefaultConfig,
  loadConfig,
} from "./config.js";

export type { SharkConfig } from "./config.js";
