// Offline extraction from the saved synthetic evaluation, never an LLM call.
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
const input=process.argv[2];
if(!input)throw new Error("Provide the original 7dd993b evaluation JSON path.");
const raw=readFileSync(input);
const batch=JSON.parse(raw.toString("utf8"));
const revision="7dd993bab98b4604d0656269b55ab6cbeccc0b11";
if(batch.version!==revision || batch.kind!=="real-model-evaluation" || batch.results.length!==3)
  throw new Error("Unexpected evaluation; refusing to replace the pinned regression corpus.");
const output={
  kind:"archived-synthetic-reports",
  sourceRevision:revision,
  originalSha256:createHash("sha256").update(raw).digest("hex"),
  model:batch.model,
  case:batch.case,
  // Preserve complete reports exactly, including limitations appended after
  // auditing. Protocol success remains metadata, not a quality label.
  runs:batch.results.map((result:any)=>({
    run:result.run,originalProtocolPassed:result.protocolPassed,
    report:result.report,
  })),
};
writeFileSync("server/tests/fixtures/assistant-real-reports-7dd993b.json",JSON.stringify(output,null,2)+"\n");
console.log("Extracted three complete synthetic reports; no model or database access.");
