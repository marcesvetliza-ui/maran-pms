export const birthdayMonths = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
export type BirthdayTemplate = {
  subject: string;
  body: string;
  benefit: string;
  terms: string;
  signature: string;
};
export const defaultBirthdayTemplate: BirthdayTemplate = {
  subject: "¡Feliz mes de cumpleaños, {nombre}!",
  body: "Hola, {nombre}.\n\nEn Maran queremos acompañarte en el mes de tu cumpleaños.\n\n{beneficio}\n{condiciones}\n\nEscribinos y te contamos cómo aprovecharlo.\n\n{firma}\n\nSi preferís no recibir promociones, respondé a este correo para avisarnos.",
  benefit: "",
  terms: "",
  signature: "Equipo de Maran Suites & Towers",
};
const variables = ["nombre", "apellido", "beneficio", "condiciones", "firma"];
export function unknownBirthdayVariables(template: BirthdayTemplate) {
  return [
    ...new Set(
      [
        ...template.subject.matchAll(/\{([^{}]+)\}/g),
        ...template.body.matchAll(/\{([^{}]+)\}/g),
      ]
        .map((match) => match[1])
        .filter((key) => !variables.includes(key)),
    ),
  ];
}
export function renderBirthdayMessage(
  template: BirthdayTemplate,
  guest: { firstName: string; lastName: string },
) {
  const values: Record<string, string> = {
    nombre: guest.firstName,
    apellido: guest.lastName,
    beneficio: template.benefit,
    condiciones: template.terms,
    firma: template.signature,
  };
  const render = (text: string) =>
    text.replace(/\{([^{}]+)\}/g, (_, key) => values[key] ?? `{${key}}`).trim();
  return {
    subject: render(template.subject).replace(/[\r\n]+/g, " "),
    body: render(template.body),
  };
}
export function birthdayEmail(value: string | null | undefined): string | null {
  const email = (value || "").trim().toLowerCase();
  return email.length <= 254 &&
    !/[(),;:"\\]/.test(email) &&
    /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email)
    ? email
    : null;
}
export function birthdayWhatsappNumber(value: string): string | null {
  const digits = value
    .trim()
    .replace(/^00/, "")
    .replace(/[\s()+.-]/g, "");
  return /^[1-9]\d{10,14}$/.test(digits) ? digits : null;
}
export type BirthdayContact = {
  id: string;
  guestId: string;
  year: number;
  month: number;
  channel: "email" | "whatsapp";
  recipient: string;
  status: string;
  actorName: string;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  subject: string;
  body: string;
  attempts: number;
};
export type BirthdayGuest = {
  id: string;
  firstName: string;
  lastName: string;
  birthday: string;
  phone: string | null;
  email: string | null;
  validEmail: string | null;
  excluded: boolean;
  exclusionReason: string;
  exclusionInherited?: boolean;
  contacts: BirthdayContact[];
  emailAvailable: boolean;
};
export type BirthdayList = {
  year: number;
  month: number;
  guests: BirthdayGuest[];
  emailReady: { ok: boolean; reason?: string };
};
export type BirthdayPreview = {
  id: string;
  year: number;
  month: number;
  messages: {
    guestId: string;
    name: string;
    recipient: string;
    birthday: string;
    subject: string;
    body: string;
  }[];
  skipped: { guestId: string; name: string; reason: string }[];
};
