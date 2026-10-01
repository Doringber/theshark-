/** @typedef {"facebook" | "whatsapp" | "yad2"} PlatformName */

export const PLATFORMS = {
  facebook: {
    label: "Facebook",
    homeUrl: "https://www.facebook.com",
    listingUrl: "https://www.facebook.com/marketplace/create/item",
  },
  whatsapp: {
    label: "WhatsApp Web",
    homeUrl: "https://web.whatsapp.com",
    listingUrl: "https://web.whatsapp.com",
  },
  yad2: {
    label: "Yad2",
    homeUrl: "https://www.yad2.co.il",
    listingUrl: "https://www.yad2.co.il/publish-ad-products/create",
  },
};

/** @param {string} raw */
export function parsePlatform(raw) {
  const name = raw?.trim().toLowerCase();
  if (!name || !(name in PLATFORMS)) {
    throw new Error(
      `Unknown platform "${raw}". Use one of: ${Object.keys(PLATFORMS).join(", ")}`,
    );
  }
  return /** @type {PlatformName} */ (name);
}
