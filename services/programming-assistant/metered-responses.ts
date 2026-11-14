import OpenAI from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  Response,
} from "openai/resources/responses/responses";
import type { InputTokenCountParams } from "openai/resources/responses/input-tokens";
import { ChatStore, chatPrices, SupportPaused } from "./chat-store";

export type MeteredProvider = {
  responses: {
    inputTokens: {
      count(
        body: InputTokenCountParams,
        options: { signal: AbortSignal },
      ): PromiseLike<{ input_tokens: number }>;
    };
    create(
      body: ResponseCreateParamsNonStreaming,
      options: { signal: AbortSignal; headers?: Record<string, string> },
    ): PromiseLike<Response>;
  };
};
/** Every generation, including reviewer/correction sessions, passes this gate. */
export function meteredResponses(
  store: ChatStore,
  provider: MeteredProvider,
  caseId: string,
  owner: string,
  model: string,
) {
  if (model !== chatPrices.model)
    throw new SupportPaused(
      "configuration",
      "El modelo del chat no tiene una tarifa verificada configurada.",
    );
  return {
    responses: {
      async create(
        body: ResponseCreateParamsNonStreaming,
        options: { signal: AbortSignal },
      ) {
        if (
          body.model !== model ||
          body.store !== false ||
          body.stream !== false ||
          body.tools?.length ||
          body.tool_choice !== "none" ||
          body.conversation ||
          body.previous_response_id
        )
          throw new SupportPaused(
            "configuration",
            "Configuración de inferencia no permitida.",
          );
        // This endpoint performs token counting, not a model generation. If unavailable,
        // fail closed rather than estimate an unbounded image or hidden context.
        const count = await provider.responses.inputTokens.count(
          {
            model,
            input: body.input,
            instructions: body.instructions,
            text: body.text,
            reasoning: body.reasoning,
            tools: [],
            tool_choice: "none",
            truncation: "disabled",
          },
          options,
        );
        if (options.signal.aborted)
          throw new SupportPaused(
            "timeout",
            "Se agotó el tiempo de espera antes de generar la respuesta.",
          );
        const reservation = await store.reserve(
          caseId,
          owner,
          count.input_tokens,
          body.max_output_tokens || 0,
        );
        try {
          const response = await provider.responses.create(
            { ...body, truncation: "disabled" },
            { ...options, headers: { "X-Client-Request-Id": reservation } },
          );
          const u = response.usage;
          if (
            !u ||
            !(
              response.model === model || response.model.startsWith(model + "-")
            ) ||
            !response.id
          )
            throw Error("Consumo sin verificar");
          await store.settle(
            reservation,
            u.input_tokens,
            u.output_tokens,
            u.input_tokens_details.cached_tokens,
            response.id,
          );
          return response;
        } catch (error) {
          await store.uncertain(reservation);
          throw error;
        }
      },
    },
  };
}
export function chatProvider(apiKey: string) {
  return new OpenAI({ apiKey, maxRetries: 0, timeout: 60000 });
}
