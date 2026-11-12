/** Presentation only: this agreement never determines who may collect or invoice. */
export function groupCommercialAgreement(config: string | null | undefined): string {
  switch (config || 'accommodation') {
    case 'accommodation': return 'El organizador paga alojamiento; cada huésped paga sus consumos.';
    case 'all': return 'El organizador paga alojamiento y consumos.';
    case 'none': return 'Cada huésped paga su alojamiento y sus consumos.';
    default: return 'Acuerdo pendiente de confirmar con el organizador.';
  }
}
