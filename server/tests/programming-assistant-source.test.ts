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
