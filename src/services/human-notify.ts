export interface CaptchaNotice {
  runId: string;
  platform: string;
}

export interface HumanNotifyDeps {
  write?: (text: string) => void;
  spawn?: (command: string, args: string[]) => void;
}

export interface HumanNotifier {
  notifyCaptcha: (notice: CaptchaNotice) => Promise<void>;
}

const PLATFORM_LABEL: Record<string, string> = {
  yad2: "Yad2",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
};

export function captchaInstruction(platform: string): string {
  const label = PLATFORM_LABEL[platform] ?? platform;
  return `${label} needs human verification. Complete the CAPTCHA in the Shark Chrome window. Shark will continue automatically afterward.`;
}

export function createHumanNotifier(deps: HumanNotifyDeps = {}): HumanNotifier {
  const write =
    deps.write ??
    ((text: string): void => {
      process.stdout.write(text);
    });
  const spawn =
    deps.spawn ??
    ((command: string, args: string[]): void => {
      void import("node:child_process").then(({ spawn: realSpawn }) => {
        realSpawn(command, args, { stdio: "ignore" }).unref();
      });
    });

  const seen = new Set<string>();

  return {
    async notifyCaptcha(notice: CaptchaNotice): Promise<void> {
      const key = `${notice.runId}:${notice.platform}`;
      if (seen.has(key)) return;
      seen.add(key);

      const label = PLATFORM_LABEL[notice.platform] ?? notice.platform;
      const instruction = captchaInstruction(notice.platform);
      write("\u0007");
      write(`\n⚠️  ${instruction}\n    Run: ${notice.runId}  Platform: ${label}\n`);
      spawn("osascript", [
        "-e",
        `display notification "${instruction.replace(/"/g, '\\"')}" with title "Shark" subtitle "${label} · ${notice.runId}"`,
      ]);
    },
  };
}
