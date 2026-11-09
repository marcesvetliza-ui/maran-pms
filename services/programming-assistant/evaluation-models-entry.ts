import { main, safeFailure } from './evaluation-models';
main().catch((error:unknown) => {
  // Provider errors may include request details. Keep secrets out of Railway logs.
  console.error(JSON.stringify({error:safeFailure(error),inferenceEnabled:false}));
  process.exitCode=1;
});
