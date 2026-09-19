import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("release readiness", () => {
  it("keeps package and plugin versions aligned", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve("package.json"), "utf-8"),
    ) as { version: string };
    const pluginJson = JSON.parse(
      await readFile(resolve(".claude-plugin/plugin.json"), "utf-8"),
    ) as { version: string };

    expect(packageJson.version).toBe(pluginJson.version);

    const cli = await readFile(resolve("src/cli.ts"), "utf-8");
    expect(cli).toContain(`.version("${packageJson.version}")`);
  });

  it("does not document an approval bypass", async () => {
    const files = await Promise.all(
      ["README.md", "skills/shark-sell/SKILL.md", "src/cli.ts"].map((path) =>
        readFile(resolve(path), "utf-8"),
      ),
    );

    expect(files.join("\n")).not.toContain("--auto-approve");
  });

  it("has CI gates for the production verification commands", async () => {
    const workflow = await readFile(resolve(".github/workflows/verify.yml"), "utf-8");

    for (const command of [
      "npm run format:check",
      "npm run lint",
      "npm run typecheck",
      "npm run build",
      "npm test",
      "npm run test:integration",
    ]) {
      expect(workflow).toContain(command);
    }
  });
});
