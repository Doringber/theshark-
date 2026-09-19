import type { ProductImage } from "../domain/schemas.js";
import type { SharkConfig } from "../domain/config.js";

export type HighValueField =
  | "title"
  | "price"
  | "description"
  | "condition"
  | "location"
  | "defects"
  | "pickupDelivery";

export interface ListingFacts {
  title?: string;
  hebrewTitle?: string;
  description?: string;
  category?: string;
  condition?: "new" | "like_new" | "good" | "fair" | "poor";
  price?: number;
  location?: string;
  defects?: string;
  pickupDelivery?: string;
}

export interface ListingProposal extends ListingFacts {
  /** Fields Shark invented — must stay empty. */
  invented: string[];
  missing: HighValueField[];
}

export interface ProposeListingInput {
  images: ProductImage[];
  config: SharkConfig;
  provided: ListingFacts;
}

/**
 * Propose a listing from user-provided facts only.
 * Never invents product name, price, condition, or defects from images.
 */
export function proposeListing(input: ProposeListingInput): ListingProposal {
  const { provided, config } = input;
  const location = provided.location ?? config.seller.city;
  const pickupDelivery = provided.pickupDelivery ?? config.pickupPreference;
  const facts: ListingFacts = {
    title: provided.title,
    hebrewTitle: provided.hebrewTitle ?? provided.title,
    description: provided.description,
    category: provided.category,
    condition: provided.condition,
    price: provided.price,
    location,
    defects: provided.defects,
    pickupDelivery,
  };
  return {
    ...facts,
    invented: [],
    missing: missingHighValueQuestions(facts, config),
  };
}

export function missingHighValueQuestions(
  facts: ListingFacts,
  config?: SharkConfig,
): HighValueField[] {
  const location = facts.location ?? config?.seller.city;
  const pickup = facts.pickupDelivery ?? config?.pickupPreference;
  const missing: HighValueField[] = [];
  if (!facts.title?.trim()) missing.push("title");
  if (facts.price === undefined) missing.push("price");
  if (!facts.description?.trim()) missing.push("description");
  if (!facts.condition) missing.push("condition");
  if (!location?.trim()) missing.push("location");
  if (!facts.defects?.trim()) missing.push("defects");
  if (!pickup?.trim()) missing.push("pickupDelivery");
  return missing;
}
