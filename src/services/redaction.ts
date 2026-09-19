/**
 * Redaction patterns for sensitive data.
 * Used to sanitize logs, snapshots, and run records.
 */

interface RedactionRule {
  pattern: RegExp;
  replacement: string;
}

const REDACTION_RULES: RedactionRule[] = [
  // Authorization headers (Bearer, Basic)
  {
    pattern: /\b(Authorization:\s*(?:Bearer|Basic)\s+)\S+/gi,
    replacement: "$1[REDACTED_TOKEN]",
  },
  // Standalone Bearer/Token values
  {
    pattern: /\b((?:Token|Bearer)\s*[:=]?\s*(?:Bearer\s+)?)\b([A-Za-z0-9_.-]{6,})\b/gi,
    replacement: "$1[REDACTED_TOKEN]",
  },
  // X-API-Key headers
  {
    pattern: /\b(X-API-Key:\s*)\S+/gi,
    replacement: "$1[REDACTED_API_KEY]",
  },
  // API keys (sk-*, key-*, etc.)
  {
    pattern: /\b((?:OPENAI_API_KEY|API_KEY|SECRET_KEY|api[_-]?key)\s*[=:]\s*)\S+/gi,
    replacement: "$1[REDACTED_KEY]",
  },
  // Cookie values
  {
    pattern: /\b((?:Set-Cookie|Cookie):\s*(?:\w+=))[^;\n]+/gi,
    replacement: "$1[REDACTED_COOKIE]",
  },
  // Password values (handles password: "value", password="value", password='value')
  {
    pattern: /\b(password\s*[:=]\s*["']?)[^\s"';,}]+/gi,
    replacement: "$1[REDACTED_PASSWORD]",
  },
  // localStorage/sessionStorage values
  {
    pattern:
      /\b((?:localStorage|sessionStorage)\.setItem\(\s*"[^"]*"\s*,\s*")[^"]+(")/gi,
    replacement: "$1[REDACTED_STORAGE]$2",
  },
  // Serial numbers (tagged: "Serial:", "S/N:", etc.)
  {
    pattern: /\b((?:Serial(?:\s+(?:number|no|#))?|S\/N)\s*[:=]\s*)\S+/gi,
    replacement: "$1[REDACTED_SERIAL]",
  },
  // IMEI (15-digit number preceded by "IMEI")
  {
    pattern: /\b(IMEI\s*[:=]?\s*)\d{15}\b/gi,
    replacement: "$1[REDACTED_IMEI]",
  },
  // Israeli phone numbers (05X-XXXXXXX or 05XXXXXXXX)
  {
    pattern: /\b0[5][0-9][-.]?\d{3}[-.]?\d{4}\b/g,
    replacement: "[REDACTED_PHONE]",
  },
  // Israeli ID (9 consecutive digits, word-bounded, preceded by "ID")
  {
    pattern: /\b(ID\s*[:=]\s*)\d{9}\b/gi,
    replacement: "$1[REDACTED_ID]",
  },
  // Email addresses
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[REDACTED_EMAIL]",
  },
  // Chat message content (tagged: "Chat message:")
  {
    pattern: /\b(Chat message:\s*).+/gi,
    replacement: "$1[REDACTED_CHAT]",
  },
];

/**
 * Redact sensitive data from a string.
 * Applies all redaction rules sequentially.
 */
export function redact(input: string): string {
  if (!input) return input;
  let result = input;
  for (const rule of REDACTION_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

/**
 * Redact sensitive parts of a URL (query params, hash fragments).
 * Preserves the base path for debugging.
 */
export function redactUrl(input: string): string {
  try {
    const url = new URL(input);
    // Remove query parameters
    if (url.search) {
      url.search = "";
    }
    // Remove hash fragments (may contain tokens)
    if (url.hash) {
      url.hash = "";
    }
    // Return clean URL without trailing ? or #
    return url.toString().replace(/[?#]$/, "");
  } catch {
    return "[REDACTED_MALFORMED_URL]";
  }
}
