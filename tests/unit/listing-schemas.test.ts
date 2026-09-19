import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import {
  ListingSchema,
  type ProductImage,
  type ProductFact,
} from "../../src/domain/schemas.js";

function makeValidImages(count: number = 1): ProductImage[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `/photos/item-${i}.jpg`,
    mediaType: "image/jpeg" as const,
    order: i,
    uploadState: "approved_for_upload" as const,
  }));
}

function makeValidListing(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: uuid(),
    title: "MacBook Air Retina 13″ 2018",
    description: "למכירה MacBook Air Retina בגודל 13 אינץ׳",
    price: 2500,
    currency: "NIS",
    condition: "good",
    location: "תל אביב",
    language: "he",
    images: makeValidImages(2),
    facts: [],
    ...overrides,
  };
}

describe("Listing schemas", () => {
  it("validates a complete listing", () => {
    const listing = makeValidListing();
    expect(() => ListingSchema.parse(listing)).not.toThrow();
  });

  it("requires a title", () => {
    expect(() => ListingSchema.parse(makeValidListing({ title: "" }))).toThrow();
  });

  it("requires a description", () => {
    expect(() => ListingSchema.parse(makeValidListing({ description: "" }))).toThrow();
  });

  it("requires a positive price", () => {
    expect(() => ListingSchema.parse(makeValidListing({ price: 0 }))).toThrow();
    expect(() => ListingSchema.parse(makeValidListing({ price: -100 }))).toThrow();
  });

  it("enforces NIS currency", () => {
    expect(() => ListingSchema.parse(makeValidListing({ currency: "USD" }))).toThrow();
  });

  it("requires condition from allowed values", () => {
    expect(() =>
      ListingSchema.parse(makeValidListing({ condition: "broken" })),
    ).toThrow();
  });

  it("accepts all valid conditions", () => {
    for (const cond of ["new", "like_new", "good", "fair", "poor"]) {
      expect(() =>
        ListingSchema.parse(makeValidListing({ condition: cond })),
      ).not.toThrow();
    }
  });

  it("requires a location", () => {
    expect(() => ListingSchema.parse(makeValidListing({ location: "" }))).toThrow();
  });

  it("requires at least one image", () => {
    expect(() => ListingSchema.parse(makeValidListing({ images: [] }))).toThrow();
  });

  it("requires at least one approved_for_upload image", () => {
    const images: ProductImage[] = [
      {
        path: "serial.jpg",
        mediaType: "image/jpeg",
        order: 0,
        uploadState: "analysis_only",
      },
    ];
    expect(() => ListingSchema.parse(makeValidListing({ images }))).toThrow();
  });

  it("defaults language to Hebrew", () => {
    const listing = makeValidListing();
    // Remove language to get default
    const { language: _lang, ...noLang } = listing as Record<string, unknown>;
    const parsed = ListingSchema.parse(noLang);
    expect(parsed.language).toBe("he");
  });

  it("tracks fact confidence levels", () => {
    const facts: ProductFact[] = [
      { field: "processor", value: "Intel i5", confidence: "observed" },
      { field: "memory", value: "8GB", confidence: "user_confirmed" },
      { field: "storage", value: "", confidence: "unknown" },
    ];
    const parsed = ListingSchema.parse(makeValidListing({ facts }));
    expect(parsed.facts).toHaveLength(3);
    expect(parsed.facts[0]?.confidence).toBe("observed");
    expect(parsed.facts[1]?.confidence).toBe("user_confirmed");
    expect(parsed.facts[2]?.confidence).toBe("unknown");
  });

  it("defaults facts to empty array", () => {
    const listing = makeValidListing();
    const { facts: _facts, ...noFacts } = listing as Record<string, unknown>;
    const parsed = ListingSchema.parse(noFacts);
    expect(parsed.facts).toEqual([]);
  });

  it("allows optional defects and pickup/delivery", () => {
    const parsed = ListingSchema.parse(
      makeValidListing({
        defects: "Small scratch on lid",
        pickupDelivery: "Pickup from Tel Aviv",
      }),
    );
    expect(parsed.defects).toBe("Small scratch on lid");
    expect(parsed.pickupDelivery).toBe("Pickup from Tel Aviv");
  });
});
