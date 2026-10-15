const WSFE = "http://ar.gov.afip.dif.FEV1/";
/** Faithful FECompConsultar structure. Standard schema has no Resultado. */
export function consultationFixture(fields: Record<string, string> = {}, omit: string[] = [], prefix = "") {
  const values = {
    Concepto: "2", DocTipo: "96", DocNro: "30111222", CbteDesde: "1", CbteHasta: "1",
    CbteFch: "20260801", ImpTotal: "100.00", MonId: "PES", MonCotiz: "1",
    CodAutorizacion: "12345678901234", EmisionTipo: "CAE", FchVto: "20260831",
    PtoVta: "99", CbteTipo: "6", ...fields,
  };
  const tag = (name: string) => prefix ? `${prefix}:${name}` : name;
  const result = Object.entries(values).filter(([key]) => !omit.includes(key))
    .map(([key, value]) => `<${tag(key)}>${value}</${tag(key)}>`).join("");
  return consultationEnvelope(`<${tag("ResultGet")}>${result}</${tag("ResultGet")}>`, prefix);
}
export function consultationEnvelope(content: string, prefix = "") {
  const tag = (name: string) => prefix ? `${prefix}:${name}` : name;
  const ns = prefix ? `xmlns:${prefix}="${WSFE}"` : `xmlns="${WSFE}"`;
  return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
    `<${tag("FECompConsultarResponse")} ${ns}><${tag("FECompConsultarResult")}>${content}</${tag("FECompConsultarResult")}>` +
    `</${tag("FECompConsultarResponse")}></soap:Body></soap:Envelope>`;
}

export function authorizationFixture(pv:number, numero:number, prefix="", expiry="20261025") {
  const tag=(name:string)=>prefix?`${prefix}:${name}`:name;
  const element=(name:string,value:string|number)=>`<${tag(name)}>${value}</${tag(name)}>`;
  const ns=prefix?`xmlns:${prefix}="${WSFE}"`:`xmlns="${WSFE}"`;
  return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>`+
    `<${tag("FECAESolicitarResponse")} ${ns}><${tag("FECAESolicitarResult")}>`+
    element("FeCabResp",element("Resultado","A")+element("PtoVta",pv)+element("CbteTipo",6))+
    element("FeDetResp",element("FECAEDetResponse",element("Resultado","A")+element("CbteDesde",numero)+
      element("CbteHasta",numero)+element("CAE","12345678901234")+element("CAEFchVto",expiry)))+
    `</${tag("FECAESolicitarResult")}></${tag("FECAESolicitarResponse")}></soap:Body></soap:Envelope>`;
}
