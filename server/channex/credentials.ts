import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12;
const MIN_SECRET_CHARACTERS = 32;

function encryptionKey(): Buffer {
  const secret = process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "CHANNEX_CREDENTIALS_ENCRYPTION_KEY es obligatorio para guardar o usar credenciales de Channex",
    );
  }

  if (secret.length < MIN_SECRET_CHARACTERS) {
    throw new Error(
      `CHANNEX_CREDENTIALS_ENCRYPTION_KEY debe tener al menos ${MIN_SECRET_CHARACTERS} caracteres aleatorios`,
    );
  }

  // La derivación hace que el formato externo del secreto (base64, hex u otro
  // alfabeto seguro) no afecte el tamaño exacto requerido por AES-256.
  return createHash("sha256")
    .update("maran:channex-credentials:v1\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

/**
 * Envelope versionado: v1.<iv>.<authTag>.<ciphertext>, todo en base64.
 * La clave maestra vive únicamente en Replit Secrets.
 */
export function encryptChannexApiKey(apiKey: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptChannexApiKey(envelope: string): string {
  const [version, ivEncoded, authTagEncoded, ciphertextEncoded, ...extra] = envelope.split(".");
  if (
    version !== ENVELOPE_VERSION ||
    !ivEncoded ||
    !authTagEncoded ||
    !ciphertextEncoded ||
    extra.length > 0
  ) {
    throw new Error("La credencial cifrada de Channex tiene un formato inválido");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(ivEncoded, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTagEncoded, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "No se pudo descifrar la credencial de Channex; verificá la clave maestra configurada",
    );
  }
}