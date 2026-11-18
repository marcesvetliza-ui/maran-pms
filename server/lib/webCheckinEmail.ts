const PLACEHOLDER = "{link_webcheckin}";

/** Preserve saved templates; append the invitation when no position was specified. */
export function withWebCheckinInvitation(template: string, link: string, completed = false): string {
  if (!link) {
    const notice = completed ? "El pre check-in ya fue completado." : "Para coordinar tu ingreso, contactá a recepción.";
    if (template.includes(PLACEHOLDER)) return template.replaceAll(PLACEHOLDER, notice);
    return completed ? `${template.trimEnd()}\n\n${notice}` : template;
  }
  if (template.includes(PLACEHOLDER)) return template;
  return `${template.trimEnd()}\n\nAgilizá tu llegada: completá el pre check-in online antes de venir.\n${PLACEHOLDER}\nEste formulario adelanta tus datos; el ingreso a la habitación se realiza en recepción.`;
}
