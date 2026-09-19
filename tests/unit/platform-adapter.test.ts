import { describe, it, expect } from "vitest";
import {
  type PlatformAdapter,
  BasePlatformAdapter,
  type PlatformAdapterName,
} from "../../src/platforms/platform-adapter.js";
import { createApproval, validateApproval } from "../../src/services/approvals.js";

class StubAdapter extends BasePlatformAdapter {
  readonly name: PlatformAdapterName = "facebook";
}

describe("PlatformAdapter contract (unit)", () => {
  it("defines the required interface methods", () => {
    const adapter: PlatformAdapter = new StubAdapter();
    expect(typeof adapter.verifyLogin).toBe("function");
    expect(typeof adapter.prepareDraft).toBe("function");
    expect(typeof adapter.preview).toBe("function");
    expect(typeof adapter.submit).toBe("function");
  });

  it("base adapter returns needs_mapping for all methods", async () => {
    const adapter = new StubAdapter();
    const page = null as never; // No real page needed for base stubs

    const login = await adapter.verifyLogin(page);
    expect(login).toBe("unknown");

    const draft = await adapter.prepareDraft(page, null as never);
    expect(draft.needsMapping).toBe(true);

    const preview = await adapter.preview(page);
    expect(preview.platform).toBe("facebook");

    const submit = await adapter.submit(page, null as never);
    expect(submit.status).toBe("needs_mapping");
  });

  it("submit must reject without a valid fresh approval", () => {
    const params = {
      runId: "run-001",
      listingId: "listing-abc",
      platform: "facebook" as const,
      destination: "marketplace",
    };

    // No approval → validation fails
    const result = validateApproval(null as never, params);
    expect(result.valid).toBe(false);

    // Valid approval for different platform → validation fails
    const whatsappApproval = createApproval({
      ...params,
      platform: "whatsapp",
    });
    const wrongPlatform = validateApproval(whatsappApproval, params);
    expect(wrongPlatform.valid).toBe(false);

    // Valid approval for correct params → passes
    const correctApproval = createApproval(params);
    const correct = validateApproval(correctApproval, params);
    expect(correct.valid).toBe(true);
  });

  it("needs_mapping is returned when a required element is not located", async () => {
    const adapter = new StubAdapter();
    const draft = await adapter.prepareDraft(null as never, null as never);
    expect(draft.success).toBe(false);
    expect(draft.needsMapping).toBe(true);
    expect(draft.error).toContain("needs_mapping");
  });
});
