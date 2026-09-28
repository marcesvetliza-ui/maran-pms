import { afterEach, describe, expect, it } from "vitest";
import { generate as generateOtp } from "otplib";
import {
  encryptTotpSecret,
  decryptTotpSecret,
  createTotpEnrollment,
  verifyTotpToken,
  generateBackupCodes,
  consumeBackupCode,
} from "../totp";

const originalKey = process.env.TOTP_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.TOTP_ENCRYPTION_KEY;
  } else {
    process.env.TOTP_ENCRYPTION_KEY = originalKey;
  }
});

describe("cifrado del secreto TOTP", () => {
  it("cifra con AES-GCM y recupera el secreto sin dejarlo visible", () => {
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const secret = "JBSWY3DPEHPK3PXP";

    const encrypted = encryptTotpSecret(secret);

    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
  });

  it("rechaza una clave maestra ausente o demasiado corta", () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(() => encryptTotpSecret("secret")).toThrow(/obligatorio/i);

    process.env.TOTP_ENCRYPTION_KEY = "too-short";
    expect(() => encryptTotpSecret("secret")).toThrow(/32 caracteres/i);
  });

  it("falla si el ciphertext fue manipulado", () => {
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString("base64");
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP");
    const tampered = `${encrypted.slice(0, -2)}AA`;

    expect(() => decryptTotpSecret(tampered)).toThrow(/no se pudo descifrar/i);
  });
});

describe("enrolamiento y verificación TOTP", () => {
  it("genera un QR y un secreto que valida el código real generado con ese secreto", async () => {
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    const enrollment = await createTotpEnrollment("luciana.lisman");

    expect(enrollment.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(enrollment.secretEncrypted).not.toContain(enrollment.secret);

    const validToken = await generateOtp({ secret: enrollment.secret });
    expect(await verifyTotpToken(enrollment.secretEncrypted, validToken)).toBe(true);
  });

  it("rechaza un código incorrecto o mal formado", async () => {
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    const enrollment = await createTotpEnrollment("luciana.lisman");

    expect(await verifyTotpToken(enrollment.secretEncrypted, "000000")).toBe(false);
    expect(await verifyTotpToken(enrollment.secretEncrypted, "abcdef")).toBe(false);
    expect(await verifyTotpToken(enrollment.secretEncrypted, "12345")).toBe(false);
  });
});

describe("códigos de respaldo", () => {
  it("genera 10 códigos únicos con formato XXXX-XXXX y los hashea", async () => {
    const codes = await generateBackupCodes();

    expect(codes.plaintext).toHaveLength(10);
    expect(new Set(codes.plaintext).size).toBe(10);
    for (const code of codes.plaintext) {
      expect(code).toMatch(/^\d{4}-\d{4}$/);
    }
    const hashes: string[] = JSON.parse(codes.hashesJson);
    expect(hashes).toHaveLength(10);
    expect(hashes.every((h) => !codes.plaintext.includes(h))).toBe(true);
  });

  it("consume un código válido una sola vez y deja el resto intacto", async () => {
    const codes = await generateBackupCodes();
    const [firstCode] = codes.plaintext;

    const consumed = await consumeBackupCode(codes.hashesJson, firstCode);
    expect(consumed).not.toBeNull();

    const remainingHashes: string[] = JSON.parse(consumed!.remainingHashesJson);
    expect(remainingHashes).toHaveLength(9);

    // El mismo código ya no debe volver a matchear contra el JSON restante
    const secondAttempt = await consumeBackupCode(consumed!.remainingHashesJson, firstCode);
    expect(secondAttempt).toBeNull();
  });

  it("devuelve null para un código inexistente o un JSON vacío", async () => {
    const codes = await generateBackupCodes();
    expect(await consumeBackupCode(codes.hashesJson, "0000-0000")).toBeNull();
    expect(await consumeBackupCode(null, "0000-0000")).toBeNull();
    expect(await consumeBackupCode("not-json", "0000-0000")).toBeNull();
  });
});
