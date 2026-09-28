/**
 * requireRole (server/auth.ts) responde 403 con { message: "..." }, no con
 * { error: "..." } como el resto de las rutas — parseApiError solo sabía
 * leer .error, así que un 403 (ej. al editar un plan tarifario sin permiso)
 * le mostraba al usuario el JSON crudo en vez del texto legible.
 */
import { describe, expect, it } from "vitest";
import { parseApiError } from "./queryClient";

describe("parseApiError", () => {
  it("extrae .error cuando el body lo trae", () => {
    const err = new Error('500: {"error":"Error updating rate plan: invalid input syntax"}');
    expect(parseApiError(err)).toBe("Error updating rate plan: invalid input syntax");
  });

  it("extrae .message cuando el body no trae .error (ej. requireRole)", () => {
    const err = new Error('403: {"message":"No autorizado para esta acción"}');
    expect(parseApiError(err)).toBe("No autorizado para esta acción");
  });

  it("cuando el body no es JSON, devuelve el texto crudo sin el código de estado", () => {
    const err = new Error("500: Internal Server Error (texto plano, no JSON)");
    expect(parseApiError(err)).toBe("Internal Server Error (texto plano, no JSON)");
  });

  it("sin mensaje en el error, devuelve un texto genérico", () => {
    expect(parseApiError({})).toBe("Error inesperado");
  });
});
