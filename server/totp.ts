import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { generateSecret, generateURI, verify as verifyTotp } from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = "v1";
const IV_BYTES = 12;
const MIN_SECRET_CHARACTERS = 32;
const ISSUER = "Maran Suites & Towers";
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_SALT_ROUNDS = 10;

function encryptionKey(): Buffer {
  const secret = process.env.TOTP_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "TOTP_ENCRYPTION_KEY es obligatorio para configurar la verificación en dos pasos",
    );
  }
  if (secret.length < MIN_SECRET_CHARACTERS) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY debe tener al menos ${MIN_SECRET_CHARACTERS} caracteres aleatorios`,
    );
  }
  return createHash("sha256")
    .update("maran:totp-secret:v1\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

/** Envelope versionado: v1.<iv>.<authTag>.<ciphertext>, todo en base64. */
export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptTotpSecret(envelope: string): string {
  const [version, ivEncoded, authTagEncoded, ciphertextEncoded, ...extra] = envelope.split(".");
  if (
    version !== ENVELOPE_VERSION ||
    !ivEncoded ||
    !authTagEncoded ||
    !ciphertextEncoded ||
    extra.length > 0
  ) {
    throw new Error("El secreto TOTP guardado tiene un formato inválido");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivEncoded, "base64"));
    decipher.setAuthTag(Buffer.from(authTagEncoded, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("No se pudo descifrar el secreto TOTP; verificá la clave maestra configurada");
  }
}

export interface TotpEnrollment {
  secret: string;
  secretEncrypted: string;
  qrCodeDataUrl: string;
}

export async function createTotpEnrollment(username: string): Promise<TotpEnrollment> {
  const secret = generateSecret();
  const uri = generateURI({ issuer: ISSUER, label: username, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(uri, { margin: 1, errorCorrectionLevel: "M" });
  return { secret, secretEncrypted: encryptTotpSecret(secret), qrCodeDataUrl };
}

export async function verifyTotpToken(secretEncrypted: string, token: string): Promise<boolean> {
  const secret = decryptTotpSecret(secretEncrypted);
  const cleanToken = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanToken)) return false;
  const result = await verifyTotp({ secret, token: cleanToken, epochTolerance: 30 });
  return result.valid;
}

export interface BackupCodes {
  /** Códigos en texto plano, para mostrar una única vez al usuario. */
  plaintext: string[];
  /** JSON de hashes bcrypt, para guardar en system_users.totp_backup_codes. */
  hashesJson: string;
}

export async function generateBackupCodes(): Promise<BackupCodes> {
  const plaintext: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = randomInt(0, 100_000_000).toString().padStart(8, "0");
    plaintext.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  const hashes = await Promise.all(plaintext.map((code) => bcrypt.hash(code, BACKUP_CODE_SALT_ROUNDS)));
  return { plaintext, hashesJson: JSON.stringify(hashes) };
}

/**
 * Verifica un código de respaldo y, si es válido, devuelve el JSON restante
 * (código consumido, de un solo uso) para persistir. `null` si no matchea.
 */
export async function consumeBackupCode(
  hashesJson: string | null,
  code: string,
): Promise<{ remainingHashesJson: string } | null> {
  if (!hashesJson) return null;
  let hashes: string[];
  try {
    hashes = JSON.parse(hashesJson);
  } catch {
    return null;
  }
  const cleanCode = code.trim();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(cleanCode, hashes[i])) {
      const remaining = [...hashes.slice(0, i), ...hashes.slice(i + 1)];
      return { remainingHashesJson: JSON.stringify(remaining) };
    }
  }
  return null;
}
