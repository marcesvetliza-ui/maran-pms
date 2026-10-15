type SpaRecipient = {
  id?: string;
  firstName?: string;
  lastName?: string | null;
  razonSocial?: string | null;
  name?: string;
  nombreFantasia?: string | null;
  cuilCuit?: string | null;
  documentNumber?: string | null;
  vatCondition?: string | null;
  condicionIva?: string | null;
  domicilio?: string | null;
  direccion?: string | null;
};

/** Select one recipient first: never combine a company's fiscal data with its guest's. */
export function buildSpaInvoiceRecipient(company: SpaRecipient | null | undefined, client: SpaRecipient | null | undefined, fallbackName: string) {
  const recipient = company || client;
  const type = company ? 'company' as const : 'guest' as const;
  return {
    initialValues: {
      razonSocial: recipient?.razonSocial || recipient?.nombreFantasia || recipient?.name ||
        (recipient ? `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() : '') || fallbackName,
      cuit: recipient?.cuilCuit || undefined,
      dni: company ? undefined : client?.documentNumber || undefined,
      condicionIva: (company ? company.condicionIva : client?.vatCondition) || '',
      domicilio: recipient?.domicilio || recipient?.direccion || undefined,
    },
    billingEntityType: company ? 'company' as const : undefined,
    billingEntityId: company?.id,
    recipientProfile: recipient?.id ? { type, id: recipient.id, firstName: recipient.firstName, lastName: recipient.lastName || undefined } : undefined,
  };
}
