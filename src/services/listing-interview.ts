import type { PlatformName, SharkConfig } from "../domain/config.js";
import type { ListingFacts } from "./listing-proposal.js";

export interface PlatformDiffInput {
  title: string;
  category?: string;
  waTo?: string[];
  yad2Type?: string;
  yad2Brand?: string;
}

/**
 * Meaningful per-platform differences from the approved master listing.
 * The same title, price, photos, and description are reused everywhere.
 */
export function describePlatformDifferences(
  listing: PlatformDiffInput,
  platforms: PlatformName[],
): string[] {
  const lines: string[] = [];
  if (platforms.includes("facebook")) {
    const category = listing.category ? `; category ${listing.category}` : "";
    lines.push(`Facebook  Marketplace listing${category}`);
  }
  if (platforms.includes("whatsapp")) {
    const chats = listing.waTo?.length
      ? listing.waTo.join(", ")
      : "no chat selected yet";
    lines.push(`WhatsApp  Hebrew caption to ${chats}`);
  }
  if (platforms.includes("yad2")) {
    const type = listing.yad2Type ?? listing.category ?? "type not set";
    const brand = listing.yad2Brand ? `; brand ${listing.yad2Brand}` : "";
    lines.push(`Yad2      Hebrew form; type ${type}${brand}`);
  }
  return lines;
}

export function factsFromFlags(flags: ListingFacts, config: SharkConfig): ListingFacts {
  return {
    title: flags.title,
    hebrewTitle: flags.hebrewTitle ?? flags.title,
    description: flags.description,
    category: flags.category,
    condition: flags.condition,
    price: flags.price,
    location: flags.location ?? config.seller.city,
    defects: flags.defects,
    pickupDelivery: flags.pickupDelivery ?? config.pickupPreference,
  };
}
