import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const execFileAsync = promisify(execFile);

export interface WSendOptions {
  /** Local (05x...) or international digits */
  to: string;
  text?: string;
  /** Optional image path to attach */
  image?: string;
  /** Seconds to wait for WhatsApp Web to load the chat */
  waitSeconds?: number;
}

/**
 * Normalize an Israeli phone number to international digits (no +).
 * "0507328808" -> "972507328808". Non-Israeli input passes through digit-only.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

/** Build the in-app deep link that opens a chat inside logged-in WhatsApp Web. */
export function buildSendUrl(to: string, text?: string): string {
  const base = `https://web.whatsapp.com/send?phone=${normalizePhone(to)}`;
  return text ? `${base}&text=${encodeURIComponent(text)}` : base;
}

/** AppleScript that puts a JPEG/PNG file on the macOS clipboard as a picture. */
export function clipboardScript(imagePath: string): { script: string } | { error: string } {
  const lower = imagePath.toLowerCase();
  const kind = lower.endsWith(".png") ? "PNG picture" : lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "JPEG picture" : null;
  if (!kind) return { error: `Unsupported image type (need .jpg/.png): "${imagePath}"` };
  if (!existsSync(imagePath)) return { error: `Image not found: "${imagePath}"` };
  return {
    script: `set the clipboard to (read (POSIX file "${imagePath}") as ${kind})`,
  };
}

async function osa(script: string): Promise<void> {
  await execFileAsync("osascript", ["-e", script]);
}

/**
 * Send a WhatsApp message through the user's ALREADY-OPEN Chrome
 * (which holds the logged-in WhatsApp Web session). No Shark browser,
 * no QR scan: opens the in-app chat link, pastes an optional image,
 * and presses Enter.
 *
 * This drives the user's own window, so delivery cannot be verified
 * programmatically — the result is always unknown_submission_state.
 */
export async function runWSend(options: WSendOptions): Promise<{ status: "unknown_submission_state"; message: string }> {
  const { to, text, image, waitSeconds = 12 } = options;
  if (!text && !image) throw new Error("Provide --text and/or --image");

  // 1. Open the chat inside the user's Chrome (default browser).
  const url = buildSendUrl(to, text);
  await execFileAsync("open", [url]);

  // 2. Wait for WhatsApp Web to load the chat, then focus Chrome.
  await new Promise((r) => setTimeout(r, waitSeconds * 1000));
  await osa('tell application "Google Chrome" to activate');
  await new Promise((r) => setTimeout(r, 1000));

  // 3. Optional image: clipboard paste into the message box.
  if (image) {
    const clip = clipboardScript(image);
    if ("error" in clip) throw new Error(clip.error);
    await osa(clip.script);
    await osa('tell application "System Events" to keystroke "v" using command down');
    await new Promise((r) => setTimeout(r, 4000));
  }

  // 4. Send.
  await osa('tell application "System Events" to keystroke return');

  return {
    status: "unknown_submission_state",
    message:
      "Message handed to your Chrome — confirm delivery on the phone (Shark cannot read your window)",
  };
}
