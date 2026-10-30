export function lastAuthorizedFixture(number: number, pointOfSale: number, documentType: number) {
  return `<soap:Envelope><soap:Body><FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>${pointOfSale}</PtoVta><CbteTipo>${documentType}</CbteTipo><CbteNro>${number}</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></soap:Body></soap:Envelope>`;
}
export function lastAuthorizedForRequest(number:number, init?:RequestInit) {
  const body=String(init?.body);
  const pv=body.match(/<ar:PtoVta>(\d+)<\/ar:PtoVta>/)?.[1];
  const type=body.match(/<ar:CbteTipo>(\d+)<\/ar:CbteTipo>/)?.[1];
  if (!pv || !type) throw new Error("Expected a last-authorized SOAP request");
  return lastAuthorizedFixture(number,Number(pv),Number(type));
}
