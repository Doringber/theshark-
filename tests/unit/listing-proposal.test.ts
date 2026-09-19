import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { collectImageSources } from "../../src/services/image-sources.js";
import {
  missingHighValueQuestions,
  proposeListing,
} from "../../src/services/listing-proposal.js";
import type { SharkConfig } from "../../src/domain/config.js";

const PHOTO_DIR = resolve(__dirname, "../fixtures/images");
const PHOTO_1 = resolve(PHOTO_DIR, "test-photo-1.jpg");
const PHOTO_2 = resolve(PHOTO_DIR, "test-photo-2.jpg");

const config = {
  language: "he",
  dryRun: true,
  currency: "NIS",
  browserProfilePath: "~/.shark/chrome",
  seller: { city: "תל אביב יפו" },
  platforms: {
    facebook: { enabled: true, url: "https://www.facebook.com" },
    whatsapp: { enabled: true, url: "https://web.whatsapp.com" },
    yad2: { enabled: true, url: "https://www.yad2.co.il" },
  },
} as SharkConfig;

describe("image sources", () => {
  it("expands a folder while preserving filename order", () => {
    const result = collectImageSources([PHOTO_DIR]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paths[0]).toBe(PHOTO_1);
      expect(result.paths[1]).toBe(PHOTO_2);
    }
  });

  it("preserves explicit --image order", () => {
    const result = collectImageSources([PHOTO_2, PHOTO_1]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paths).toEqual([PHOTO_2, PHOTO_1]);
    }
  });
});

describe("listing proposal", () => {
  it("never invents a title, price, or condition", () => {
    const proposal = proposeListing({
      images: [
        {
          path: PHOTO_1,
          mediaType: "image/jpeg",
          order: 0,
          uploadState: "approved_for_upload",
        },
      ],
      config,
      provided: {},
    });
    expect(proposal.title).toBeUndefined();
    expect(proposal.price).toBeUndefined();
    expect(proposal.condition).toBeUndefined();
    expect(proposal.description).toBeUndefined();
    expect(proposal.invented).toEqual([]);
  });

  it("asks only for missing high-value facts", () => {
    const questions = missingHighValueQuestions({
      title: "מקבוק",
      price: 300,
      description: "עובד",
      condition: "good",
      location: "תל אביב",
      defects: "שריטה קלה",
      pickupDelivery: "איסוף עצמי",
    });
    expect(questions).toEqual([]);
  });

  it("uses the configured city so location is not asked again", () => {
    const questions = missingHighValueQuestions(
      { title: "מקבוק", price: 300, description: "עובד", condition: "good" },
      config,
    );
    expect(questions).not.toContain("location");
    expect(questions).toContain("defects");
    expect(questions).toContain("pickupDelivery");
  });
});
