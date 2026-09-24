import { describe, expect, it } from "vitest";
import { assertFlagsCompleteForNonInteractive } from "../../src/commands/sell.js";

describe("assertFlagsCompleteForNonInteractive", () => {
  const full = {
    images: ["a.jpg"],
    publish: false,
    title: "מקבוק",
    price: 300,
    condition: "good" as const,
    location: "תל אביב",
    description: "עובד",
    platforms: ["yad2" as const],
  };

  it("accepts a complete flag set", () => {
    expect(() => assertFlagsCompleteForNonInteractive(full)).not.toThrow();
  });

  it.each([["title"], ["price"], ["condition"], ["location"], ["platforms"]])(
    "rejects when %s is missing and names it — never guesses a fact",
    (field) => {
      const opts = { ...full, [field]: undefined };
      expect(() => assertFlagsCompleteForNonInteractive(opts)).toThrow(
        new RegExp(field),
      );
    },
  );
});
