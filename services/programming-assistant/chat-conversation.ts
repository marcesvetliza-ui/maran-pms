import { z } from "zod";
import type { SupportTicket } from "../../shared/programming-support";
import type { ResponsesClient } from "./responses-transport";
import { supportChatRules } from "./chat-rules";
import { investigationCase } from "./context";

const outputSchema = {
  type: "object" as const,
  properties: {
    action: { type: "string", enum: ["reply", "investigate"] },
    reply: { type: "string" },
    observations: { type: "string" },
  },
  required: ["action", "reply", "observations"],
  additionalProperties: false,
};
const output = z
  .object({
    action: z.enum(["reply", "investigate"]),
    reply: z.string().min(1).max(4000),
    observations: z.string().max(3000),
  })
  .strict();

export async function converse(
  ticket: SupportTicket,
  images: string[],
  client: ResponsesClient,
  model: string,
) {
  const context = investigationCase(ticket);
  const prompt = JSON.stringify({
    case: { ...context, messages: context.messages?.slice(-40) },
    previousReport: ticket.report
      ? {
          summary: ticket.report.summary,
          cause: ticket.report.cause,
          proposal: ticket.report.proposal,
          limitations: ticket.report.limitations,
        }
      : null,
    contextLimit:
      "Se conservan las últimas 40 intervenciones. Los informes anteriores no son evidencia nueva.",
  });
  if (prompt.length > 95000)
    throw Error(
      "La conversación requiere una nueva consulta con el problema actual.",
    );
  const response = await client.responses.create(
    {
      model,
      store: false,
      stream: false,
      tools: [],
      tool_choice: "none",
      max_output_tokens: 2000,
      reasoning: { effort: "medium" },
      instructions: supportChatRules,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...images.map((image_url) => ({
              type: "input_image" as const,
              image_url,
              detail: "auto" as const,
            })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "support_conversation",
          strict: true,
          schema: outputSchema,
        },
      },
    },
    { signal: AbortSignal.timeout(90000) },
  );
  if (
    response.status !== "completed" ||
    response.output.some((v) => !["message", "reasoning"].includes(v.type))
  )
    throw Error("No se pudo completar la respuesta.");
  return output.parse(JSON.parse(response.output_text));
}
