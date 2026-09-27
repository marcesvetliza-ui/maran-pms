import dns from "dns";
import net from "net";
import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/**
 * nodemailer (desde la v8) resuelve tanto la dirección IPv4 como la IPv6 del
 * host SMTP y elige una AL AZAR entre las dos — la opción "family" que antes
 * se usaba acá para forzar IPv4 ya no se reenvía a la conexión real (queda
 * ignorada). En un entorno sin salida IPv6, eso hace que el envío falle con
 * ENETUNREACH aproximadamente la mitad de las veces, al azar.
 *
 * Acá resolvemos nosotros mismos una dirección IPv4 y nos conectamos
 * directo a esa IP, indicando el hostname original vía "servername" para
 * que el SNI y la validación del certificado TLS sigan funcionando bien.
 */
export async function createIpv4SmtpTransport(
  options: SMTPTransport.Options,
): Promise<Transporter> {
  const host = options.host;

  if (!host || net.isIP(host)) {
    // Ya es una IP literal, o no hay host que resolver: nada que forzar.
    return nodemailer.createTransport(options);
  }

  try {
    const addresses = await dns.promises.resolve4(host);
    if (addresses.length > 0) {
      const resolvedOptions: SMTPTransport.Options & { servername: string } = {
        ...options,
        host: addresses[0],
        servername: host,
      };
      return nodemailer.createTransport(resolvedOptions);
    }
  } catch {
    // Sin registro A (poco común para un servidor SMTP real) — seguimos
    // con el hostname original en vez de romper el envío.
  }

  return nodemailer.createTransport(options);
}
