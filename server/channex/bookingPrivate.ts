import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const secret = process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error("CHANNEX_PRIVATE_ARCHIVE_KEY_UNAVAILABLE");
  return createHash("sha256").update("maran:channex-booking-private:v1\0").update(secret).digest();
}
function aad(connectionId: string, revisionId: string) {
  return Buffer.from(JSON.stringify([connectionId, revisionId]));
}
/** Only operational notes are archived here. Never archive raw_message,
 * guarantees or card fields. Notes resembling payment-card data are omitted. */
export function archiveBookingNotes(raw: any, connectionId: string, revisionId: string): string | null {
  const notes = raw?.attributes?.notes;
  if (typeof notes !== "string" || !notes || ["***", "[redacted]"].includes(notes)) return null;
  if (Buffer.byteLength(notes) > 65536) throw new Error("CHANNEX_PRIVATE_NOTES_TOO_LARGE");
  const safeNotes = /(?:\d[ -]?){12,19}|\b(?:cvv|cvc|pan|card|tarjeta|credit.?card)\b/i.test(notes)
    ? "[payment-related note omitted]" : notes;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(connectionId, revisionId));
  const body = Buffer.concat([cipher.update(JSON.stringify({ notes: safeNotes }), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}
/** Internal access only; do not expose ciphertext/decrypted notes in status APIs. */
export function readBookingNotes(envelope: string, connectionId: string, revisionId: string): { notes: string } {
  try {
    const [version, iv, tag, body, ...extra] = envelope.split(".");
    if (version !== "v1" || !iv || !tag || !body || extra.length) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAAD(aad(connectionId, revisionId));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8"));
  } catch { throw new Error("CHANNEX_PRIVATE_ARCHIVE_UNREADABLE"); }
}
