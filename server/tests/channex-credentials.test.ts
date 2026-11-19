import { afterEach, describe, expect, it } from "vitest";
import { decryptChannexApiKey, encryptChannexApiKey } from "../channex/credentials";

const originalEncryptionKey = process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY;

afterEach(() => {
  if (originalEncryptionKey === undefined) {
    delete process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY;
  } else {
    process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY = originalEncryptionKey;
  }
});

describe("credenciales cifradas de Channex", () => {
  it("cifra con AES-GCM y recupera la API key sin dejarla visible", () => {
    process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const plaintext = "demo-secret-api-key";

    const encrypted = encryptChannexApiKey(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(decryptChannexApiKey(encrypted)).toBe(plaintext);
  });

  it("rechaza una clave maestra ausente o inválida", () => {
    delete process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptChannexApiKey("secret")).toThrow(/obligatorio/i);

    process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY = "too-short";
    expect(() => encryptChannexApiKey("secret")).toThrow(/32 caracteres/i);
  });

  it("falla si el ciphertext fue manipulado", () => {
    process.env.CHANNEX_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
    const encrypted = encryptChannexApiKey("secret");
    const parts = encrypted.split(".");
    const ciphertext = Buffer.from(parts[3], "base64");
    // Replacing a random suffix with "AA" can leave it unchanged. Flip a
    // decoded bit so this assertion always tests a real ciphertext alteration.
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString("base64");
    const tampered = parts.join(".");
    expect(tampered).not.toBe(encrypted);

    expect(() => decryptChannexApiKey(tampered)).toThrow(/no se pudo descifrar/i);
  });
});