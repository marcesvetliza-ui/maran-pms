import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrintShippingLabelButton } from "./print-shipping-label-button";

const shipping = { fullName: 'María <script>alert(1)</script> López', address: 'Av. San Martín 123, piso 2', postalCode: '00550', city: 'Mendoza', province: 'Mendoza', country: 'Argentina', paymentStatus: 'no_pagado' as const };
afterEach(() => vi.restoreAllMocks());
describe('Etiqueta de envío', () => {
  it('imprime los datos actuales como texto, conserva el CP y excluye información interna', async () => {
    const doc = document.implementation.createHTMLDocument();
    const print = vi.fn(); const focus = vi.fn();
    const popup = { document: doc, print, focus, closed: false, opener: window, setTimeout: (action: () => void) => { action(); return 1; } };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    render(<PrintShippingLabelButton shipping={shipping} />);
    await userEvent.click(screen.getByRole('button', {name: 'Imprimir etiqueta'}));
    expect(doc.body.textContent).toContain(shipping.fullName);
    for (const value of [shipping.address, shipping.postalCode, shipping.city, shipping.province, shipping.country]) expect(doc.body.textContent).toContain(value);
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.body.textContent).not.toContain('no_pagado');
    expect(popup.opener).toBeNull();
    expect(print).toHaveBeenCalledOnce();
    expect(shipping.postalCode).toBe('00550');
  });
  it('impide imprimir destinos incompletos', () => {
    const open = vi.spyOn(window, 'open');
    render(<PrintShippingLabelButton shipping={{...shipping, address:'   '}} />);
    expect(screen.getByRole('button', {name:'Imprimir etiqueta'})).toBeDisabled();
    expect(screen.getByText('Completá los datos del destino para imprimir.')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
});
