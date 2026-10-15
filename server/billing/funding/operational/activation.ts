import type { Express } from "express";

/** An absent/false flag must not import DB, credentials or financial bindings. */
export async function mountSpaFundingFromEnvironment(app: Express, env: NodeJS.ProcessEnv = process.env) {
  if (env.SPA_FUNDING_HOMOLOGATION_ENABLED !== "true") return null;
  const { mountConfiguredOperationalSpaFunding } = await import("./mount");
  return mountConfiguredOperationalSpaFunding(app, true, true);
}
