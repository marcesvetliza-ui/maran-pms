import {SaxesParser} from 'saxes';
const SOAP='http://schemas.xmlsoap.org/soap/envelope/';

/** Extract only the SOAP Fault reason, never the envelope/header or a request.
 * Parsing errors, DTDs and unrelated fault tags remain an unknown response. */
export function wsfeFaultReason(xml:string):string|undefined {
  if(xml.length>1_000_000)return undefined;
  const stack:Array<{local:string;uri:string}>=[];const reasons:string[]=[];let current:string|undefined;
  try{
    const parser=new SaxesParser({xmlns:true});
    parser.on('doctype',()=>{throw new Error('DTD not allowed');});
    parser.on('opentag',tag=>{
      stack.push({local:tag.local,uri:tag.uri});
      if(stack.length===4&&stack[0].local==='Envelope'&&stack[0].uri===SOAP&&stack[1].local==='Body'&&stack[1].uri===SOAP&&stack[2].local==='Fault'&&stack[2].uri===SOAP&&tag.local==='faultstring'&&(tag.uri===''||tag.uri===SOAP))current='';
    });
    const append=(text:string)=>{if(current!==undefined&&stack.length===4)current+=text;};
    parser.on('text',append);parser.on('cdata',append);
    parser.on('closetag',()=>{if(stack.length===4&&current!==undefined){reasons.push(current.trim());current=undefined;}stack.pop();});
    parser.write(xml).close();
    return reasons.length===1&&reasons[0]?reasons[0]:undefined;
  }catch{return undefined;}
}
export function wsfeTransportError(status:number,reason:string|undefined,requestBody:string):Error {
  let detail=reason||'ARCA devolvió una respuesta sin detalle SOAP verificable. No se pudo confirmar la autorización.';
  // A provider fault can echo request values. Remove credential values before
  // exposing any reason to the UI or persisting a reconciliation error.
  for(const match of requestBody.matchAll(/<(?:[\w]+:)?(?:Token|Sign)>([^<]+)<\/(?:[\w]+:)?(?:Token|Sign)>/g))detail=detail.replaceAll(match[1],'[dato reservado]');
  detail=detail.replace(/\s+/g,' ').trim().slice(0,800);
  return Object.assign(new Error(`WSFEV1 HTTP ${status}: ${detail}`),{code:'WSFE_RESPONSE_UNVERIFIED'});
}
