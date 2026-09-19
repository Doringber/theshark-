import { resolve } from "node:path";
import { confirm, input, select, checkbox } from "@inquirer/prompts";
import { RunStore } from "../services/run-store.js";
import { createHumanNotifier } from "../services/human-notify.js";
import {
  resumeSellFlow,
  type SellFlowOptions,
} from "../orchestration/sell-orchestrator.js";
import { wrapSession } from "../orchestration/browser-port.js";
import { BrowserSession } from "../browser/session.js";
import { FacebookMarketplaceAdapter } from "../platforms/facebook-marketplace.js";
import { WhatsAppWebAdapter } from "../platforms/whatsapp-web.js";
import { Yad2Adapter } from "../platforms/yad2.js";
import { resolveConfig } from "./config-io.js";

export interface ResumeOptions {
  runId: string;
  publish?: boolean;
  noDryRun?: boolean;
  draftOnly?: boolean;
  cdpUrl?: string;
}

export async function runResume(options: ResumeOptions): Promise<void> {
  const store = new RunStore(resolve(".shark/runs"));
  const run = await store.getRun(options.runId);
  if (!run) throw new Error(`Run "${options.runId}" not found`);
  if (!run.listing) throw new Error(`Run "${options.runId}" has no saved listing`);

  const config = await resolveConfig();
  const session = new BrowserSession({
    profilePath: resolve(
      config.browserProfilePath.replace("~", process.env["HOME"] ?? "~"),
    ),
    headed: true,
    cdpUrl: options.cdpUrl ?? "",
  });

  const flowOptions: SellFlowOptions = {
    images: run.listing.imagePaths,
    publish: options.publish ?? false,
    noDryRun: options.noDryRun,
    draftOnly: options.draftOnly,
    title: run.listing.title,
    price: run.listing.price,
    description: run.listing.description,
    condition: run.listing.condition as SellFlowOptions["condition"],
    location: run.listing.location,
    category: run.listing.category,
    groups: run.listing.groups,
    platforms: run.platforms as SellFlowOptions["platforms"],
    yad2Type: run.listing.yad2Type,
    yad2Brand: run.listing.yad2Brand,
    waTo: run.listing.waTo,
    defects: run.listing.defects,
    pickupDelivery: run.listing.pickupDelivery,
  };

  try {
    await resumeSellFlow(options.runId, flowOptions, {
      store,
      config,
      session: wrapSession(session),
      adapters: {
        facebook: new FacebookMarketplaceAdapter(),
        whatsapp: new WhatsAppWebAdapter(),
        yad2: new Yad2Adapter(),
      },
      notify: createHumanNotifier(),
      prompts: {
        confirm: (message, defaultValue) => confirm({ message, default: defaultValue }),
        input: (message) => input({ message }),
        select: (message, choices) => select({ message, choices }),
        checkbox: (message, choices) => checkbox({ message, choices }),
      },
    });
  } finally {
    if (session.isAttached()) await session.detach();
    else await session.close().catch(() => {});
  }
}
