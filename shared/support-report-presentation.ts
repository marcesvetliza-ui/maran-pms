/** Presentation only: preserve the original report for evidence and approval. */
export function supportReportText(value:string|undefined|null) {
  const text=(value||'').trim();
  if(/^(?::?null|undefined)$/i.test(text))return '';
  return text.replace(/^Correcci[oó]n:\s*/i,'');
}
