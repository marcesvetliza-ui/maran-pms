// Prepare review requests and expected labels ONLY. No provider client/calls.
import {mkdirSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {reviewCases} from "../server/tests/fixtures/assistant-review-cases";
import {CodeSource} from "../services/programming-assistant/source";
import {prepareAudit} from "../services/programming-assistant/semantic-audit";
import {invoiceConflictChecklist} from "../services/programming-assistant/invoice-conflict";

async function main(){
  const revision=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const output=[];
  for(const item of reviewCases){
    const source=new CodeSource(process.cwd(),revision);
    const prepared=await prepareAudit({...item.ticket,version:revision},item.report,source,invoiceConflictChecklist);
    output.push({id:item.id,expected:item.expected,report:item.report,request:prepared.request});
  }
  mkdirSync("generated-artifacts/assistant-review",{recursive:true});
  writeFileSync("generated-artifacts/assistant-review/offline-review-corpus.json",JSON.stringify({
    kind:"offline-review-corpus",revision,
    executed:false,providerCalls:0,
    note:"Expected labels are review targets, not measured model verdicts. Mock tests only prove payload/protocol. No paid evaluation was run.",
    cases:output,
  },null,2)+"\n");
  console.log(`Prepared ${output.length} review cases; 0 provider calls.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
