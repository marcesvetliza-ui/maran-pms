import { main, evaluationFailureDetails } from './evaluation-models';
main().catch((error:unknown) => {
  // Provider errors may include request details. Keep secrets out of Railway logs.
  console.error(JSON.stringify(evaluationFailureDetails(error,process.env)));
  process.exitCode=1;
});
