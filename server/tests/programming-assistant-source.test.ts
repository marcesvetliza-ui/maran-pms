import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { CodeSource } from "../../services/programming-assistant/source";
import { diagnose } from "../../services/programming-assistant/diagnose";
import type { SupportTicket } from "../../shared/programming-support";

let directory: string;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  directory = await mkdtemp(path.join(tmpdir(), "assistant-source-"));
  await mkdir(path.join(directory, "server"));
  return new CodeSource(directory, "a".repeat(40));
}
describe("read-only code investigator", () => {
  it("excludes secret files, traversals and symlinks", async () => {
    const source = await fixture();
    await writeFile(
      path.join(directory, "server", "normal.ts"),
      "export const ok=true;",
    );
    await writeFile(path.join(directory, "server", "secrets.ts"), "private");
    await symlink(
      path.join(directory, "server", "normal.ts"),
      path.join(directory, "server", "link.ts"),
    );
    expect(await source.files()).toEqual(["server/normal.ts"]);
    await expect(source.read("../normal.ts")).rejects.toThrow();
    await expect(source.read("server/link.ts")).rejects.toThrow();
  });
  it("only validates evidence actually returned, and preserves line numbers after redaction", async () => {
    const source = await fixture();
    await writeFile(
      path.join(directory, "server", "normal.ts"),
      "-----BEGIN PRIVATE KEY-----\nprivate-value\n-----END PRIVATE KEY-----\nexport const ok=true;\n" +
        "x".repeat(17000) +
        "\nnotReturned",
    );
    const result = await source.read("server/normal.ts", 1, 6);
    expect(result.content).not.toContain("private-value");
    expect(result.content).toContain("4: export const ok=true;");
    expect(
      source.validates({ path: "server/normal.ts", start: 6, end: 6 }),
    ).toBe(false);
  });
  it("requests strict output and accepts a diagnosis based on read lines", async () => {
    const source = await fixture();
    await writeFile(
      path.join(directory, "server", "normal.ts"),
      "export const cost=10;",
    );
    const ticket = { version: source.version } as SupportTicket;
    let round = 0;
    const client = {
      chat: {
        completions: {
          create: async (request: any) => {
            expect(request.response_format.type).toBe("json_schema");
            expect(request.response_format.json_schema.strict).toBe(true);
            expect(
              request.response_format.json_schema.schema.required,
            ).toContain("dataRepair");
            if (round++ === 0)
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "read1",
                          type: "function",
                          function: {
                            name: "read_code",
                            arguments: JSON.stringify({
                              path: "server/normal.ts",
                              start: 1,
                              end: 1,
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            return {
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({
                      summary: "Costo conservado",
                      certainty: "sustentado_en_codigo",
                      cause: "Costo fijo",
                      proposal: "Revisar el flujo",
                      proposedTests: ["Comprobar una compra"],
                      questions: [],
                      dataRepair: "",
                      limitations: [],
                      evidence: [
                        {
                          path: "server/normal.ts",
                          start: 1,
                          end: 1,
                          explanation: "Valor leído",
                        },
                      ],
                    }),
                  },
                },
              ],
            };
          },
        },
      },
    };
    const result = await diagnose(
      ticket,
      source,
      { apiKey: "not-used", model: "mock" },
      client as any,
    );
    expect(result.report.certainty).toBe("sustentado_en_codigo");
    expect(result.calls).toBe(1);
    expect(result.report.limitations.join(" ")).toContain(
      "no se ejecutaron pruebas",
    );
  });
  it("repairs an invalid citation within the same investigation without trusting unread lines", async () => {
    const source = await fixture();
    await writeFile(
      path.join(directory, "server", "normal.ts"),
      "const cost=10;",
    );
    await source.read("server/normal.ts", 1, 1);
    let attempts = 0;
    const client = {
      chat: {
        completions: {
          create: async (request: any) => {
            const correcting = attempts++ > 0;
            if (correcting) {
              const feedback = JSON.parse(request.messages.at(-1).content);
              expect(feedback.allowedReadRanges).toEqual([
                { path: "server/normal.ts", ranges: [[1, 1]] },
              ]);
              expect(feedback.invalidEvidence[0].end).toBe(2);
            }
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: JSON.stringify({
                      summary: "Resumen",
                      certainty: "sustentado_en_codigo",
                      cause: "Causa",
                      proposal: "Propuesta",
                      proposedTests: [],
                      questions: [],
                      dataRepair: "",
                      limitations: [],
                      evidence: [
                        {
                          path: "server/normal.ts",
                          start: 1,
                          end: correcting ? 1 : 2,
                          explanation: "Costo",
                        },
                      ],
                    }),
                  },
                },
              ],
            };
          },
        },
      },
    };
    const result = await diagnose(
      { version: source.version } as SupportTicket,
      source,
      { apiKey: "not-used", model: "mock" },
      client as any,
    );
    expect(attempts).toBe(2);
    expect(result.report.evidence[0].end).toBe(1);
  });
  it("rejects a diagnosis citing unread source", async () => {
    const source = await fixture();
    await writeFile(path.join(directory, "server", "normal.ts"), "one");
    const ticket = { version: source.version } as SupportTicket;
    const report = {
      summary: "Resumen",
      certainty: "sustentado_en_codigo",
      cause: "Causa",
      proposal: "Propuesta",
      proposedTests: [],
      questions: [],
      dataRepair: "",
      limitations: [],
      evidence: [
        {
          path: "server/normal.ts",
          start: 1,
          end: 1,
          explanation: "Inventada",
        },
      ],
    };
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: JSON.stringify(report) } }],
          }),
        },
      },
    };
    await expect(
      diagnose(
        ticket,
        source,
        { apiKey: "not-used", model: "mock" },
        client as any,
      ),
    ).rejects.toThrow(/no fueron consultadas/);
    await expect(
      diagnose(
        { ...ticket, version: "b".repeat(40) },
        source,
        { apiKey: "not-used", model: "mock" },
        client as any,
      ),
    ).rejects.toThrow(/no coinciden/);
  });
});
