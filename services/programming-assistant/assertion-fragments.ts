import type {SupportDiagnosis} from '../../shared/programming-support';
import type {CodeSource} from './source';

/** Exact, bounded source excerpts. Never execute or classify tests from names. */
export async function attachAssertionFragments(report:SupportDiagnosis,source:CodeSource) {
 let remaining=10000;
 for(const ref of report.evidence) {
  delete ref.assertionFragments;
  if(remaining<500 || !source.validates(ref) || !/(?:\/tests\/|\.test\.)/.test(ref.path) || /programming-(assistant|diagnosis|support)/.test(ref.path))continue;
  const read=await source.read(ref.path,ref.start,Math.min(ref.end,ref.start+159));
  const lines=read.content.split('\n');
  const fragments:NonNullable<SupportDiagnosis['evidence'][number]['assertionFragments']>=[];
  for(let index=0;index<lines.length && fragments.length<3;index++) {
   const text=lines[index].replace(/^\d+: /,'').trim();
   if(text.startsWith('//') || !/\b(?:expect(?:\.soft)?|assert(?:\.\w+)?)\s*\(/.test(text))continue;
   const start=index;const selected:string[]=[];let length=0,matcher=/\bassert(?:\.\w+)?\s*\(/.test(text),terminated=false;
   for(;index<Math.min(lines.length,start+14);index++) {
    const line=lines[index];
    if(length+line.length+1>Math.min(2500,remaining))break;
    if(index>start && /\b(?:expect(?:\.soft)?|assert(?:\.\w+)?)\s*\(/.test(line))break;
    selected.push(line);length+=line.length+1;
    matcher ||= /\.(?:to[A-Z]\w*)\s*\(/.test(line);
    if(matcher && /\)\s*;?\s*(?:\/\/.*)?$/.test(line)){terminated=true;index++;break;}
   }
   index=Math.max(start,index-1);
   if(!matcher || !selected.length)continue;
   const last=selected.at(-1)!;
   const from=Number(selected[0].match(/^(\d+):/)![1]);
   const end=Number(last.match(/^(\d+):/)![1]);
   fragments.push({start:from,end,code:selected.join('\n'),partial:!terminated});
   remaining-=length;
  }
  if(fragments.length)ref.assertionFragments=fragments;
 }
 return report;
}
