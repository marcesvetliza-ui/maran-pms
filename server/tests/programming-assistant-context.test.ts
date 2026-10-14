import { it, expect } from "vitest";
import { compactContext, investigationCase, reserveClosure } from "../../services/programming-assistant/context";
import type { SupportTicket } from "../../shared/programming-support";

it("keeps follow-up requirements without resending the previous diagnosis or lifecycle fields", () => {
  const result = investigationCase({ title: "Cambio", actual: "Superposición", expected: "Rechazar", messages: [{ text: "Revisar el diálogo y el error 409" }], report: { summary: "old" }, lastError: "old failure", createdBy: "operator" } as SupportTicket);
  expect(result.messages?.[0].text).toContain("409");
  expect(result).not.toHaveProperty("report");
  expect(result).not.toHaveProperty("lastError");
  expect(result).not.toHaveProperty("createdBy");
});

it("retains the first full reading, range metadata and tool protocol while replacing identical code", () => {
  const content = "function checkAvailability() { return false; }\n".repeat(100);
  const messages = compactContext([
    { role: "user", content: JSON.stringify({ reading: { path: "server/routes.ts", start: 1, end: 100, content } }) },
    { role: "assistant", content: null, tool_calls: [{ id: "read-1", type: "function", function: { name: "read_code", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "read-1", content: JSON.stringify({ path: "server/routes.ts", start: 1, end: 100, content }) },
  ]);
  expect(JSON.parse(messages[0].content as string).reading.content).toBe(content);
  expect(messages[2]).toHaveProperty("tool_call_id", "read-1");
  const repeated = JSON.parse(messages[2].content as string);
  expect(repeated).toMatchObject({ path: "server/routes.ts", start: 1, end: 100 });
  expect(repeated.content).toContain("messages[0].reading.content");
  expect(messages[2].content!.length).toBeLessThan(content.length / 5);
});

it("reserves closure before five large requests can consume 102731 tokens", () => {
  expect(reserveClosure(41092, 40000, 19500)).toBe(false);
  expect(reserveClosure(61638, 55000, 20000)).toBe(true);
  // Close after three research rounds: two 20400-token responses fit below 100k.
  expect(61638 + 2 * 18400).toBeLessThan(100000);
});
