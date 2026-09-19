import { describe, it, expect } from "vitest";
import { createHumanNotifier } from "../../src/services/human-notify.js";

describe("human captcha notification", () => {
  it("emits a bell, a CLI status, and a desktop notification once", async () => {
    const writes: string[] = [];
    const spawned: Array<{ command: string; args: string[] }> = [];
    const notify = createHumanNotifier({
      write: (text) => {
        writes.push(text);
      },
      spawn: (command, args) => {
        spawned.push({ command, args });
      },
    });

    await notify.notifyCaptcha({ runId: "run-99", platform: "yad2" });
    await notify.notifyCaptcha({ runId: "run-99", platform: "yad2" });

    expect(writes.some((w) => w.includes("\u0007"))).toBe(true);
    expect(
      writes.some((w) =>
        w.includes(
          "Yad2 needs human verification. Complete the CAPTCHA in the Shark Chrome window. Shark will continue automatically afterward.",
        ),
      ),
    ).toBe(true);
    expect(writes.some((w) => w.includes("run-99"))).toBe(true);
    expect(writes.filter((w) => w.includes("needs human verification")).length).toBe(1);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.command).toBe("osascript");
  });
});
