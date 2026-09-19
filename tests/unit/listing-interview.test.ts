import { describe, it, expect } from "vitest";
import { describePlatformDifferences } from "../../src/services/listing-interview.js";
import { factsFromFlags } from "../../src/services/listing-interview.js";
import { missingHighValueQuestions } from "../../src/services/listing-proposal.js";
import { getDefaultConfig } from "../../src/domain/config.js";

describe("listing interview helpers", () => {
  it("shows only platform-specific differences", () => {
    const lines = describePlatformDifferences(
      {
        title: "MacBook Air",
        category: "Electronics",
        waTo: ["מכירות יד שניה"],
        yad2Type: "מחשב נייד",
        yad2Brand: "Apple",
      },
      ["facebook", "whatsapp", "yad2"],
    );
    expect(lines).toEqual([
      "Facebook  Marketplace listing; category Electronics",
      "WhatsApp  Hebrew caption to מכירות יד שניה",
      "Yad2      Hebrew form; type מחשב נייד; brand Apple",
    ]);
  });

  it("fills city and pickup from config so those questions are skipped", () => {
    const config = {
      ...getDefaultConfig(),
      pickupPreference: "איסוף עצמי",
      seller: { city: "תל אביב" },
    };
    const facts = factsFromFlags(
      {
        title: "MacBook Air",
        price: 300,
        description: "עובד מצוין",
        condition: "good",
        defects: "אין",
      },
      config,
    );
    expect(missingHighValueQuestions(facts, config)).toEqual([]);
  });
});
