/** Isolated runner. A plan never creates an SDK client or generates a response. */
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chatEvaluationPlan, runChatSmokeEvaluation } from "./chat-evaluation";
import { chatProvider } from "./metered-responses";

// Keep isolation even if this bundle is invoked directly instead of the dispatcher.
if (process.env.APP_ENV !== "pilot" || process.env.SUPPORT_EVALUATION_ISOLATED_JOB !== "true")
  throw Object.assign(Error("Isolated pilot job required"), { evaluationCode: "pilot_job_required" });
if (["DATABASE_URL", "ASSISTANT_DATABASE_URL", "SUPPORT_SHARED_SECRET", "RAILWAY_MARAN_PROJECT_TOKEN"].some(key => !!process.env[key]))
  throw Object.assign(Error("Operational credentials present"), { evaluationCode: "operational_credentials_present" });

const plan = chatEvaluationPlan(process.env);
if (process.env.SUPPORT_EVALUATION_ACTION === "chat-plan") {
  console.log(JSON.stringify(plan));
} else {
  if (!plan.configurationReady || !plan.revisionCheck.runningRevision || plan.approvedUsd === null)
    throw Object.assign(Error("Chat evaluation configuration missing"), { evaluationCode: "evaluation_configuration_missing" });
  const result = await runChatSmokeEvaluation({ revision: plan.revisionCheck.runningRevision,
    model: plan.requestedModel!, approvedUsd: plan.approvedUsd }, chatProvider(process.env.OPENAI_API_KEY!));
  const artifact = path.join(tmpdir(), `chat-evaluation-${Date.now()}.json`);
  await writeFile(artifact, JSON.stringify({ ...result, rubric: plan.rubric }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ artifact, ...result }));
  if (result.stopped || !result.routingChecksPassed) process.exitCode = 1;
}
