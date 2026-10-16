import type OpenAI from "openai";
import type { SupportTicket } from "../../shared/programming-support";

// A previous diagnosis is an output, not new evidence. Keep the user's inputs.
export function investigationCase(ticket: SupportTicket) {
  const { title, module, actual, expected, steps, reference, page, version, messages } = ticket;
  return { title, module, actual, expected, steps, reference, page, version, messages };
}

export function compactContext(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) {
  const seen = new Map<string, string>();
  const readLines = new Map<string,string>();
  function visit(value: unknown, location: string): unknown {
    if (typeof value === "string" && value.length > 300) {
      const prior = seen.get(value);
      if (prior) return `[Contenido idéntico ya incluido en ${prior}; usar esa lectura.]`;
      seen.set(value, location);
    }
    if (Array.isArray(value)) return value.map((item, index) => visit(item, `${location}[${index}]`));
    if (value && typeof value === "object") {
      const reading=value as Record<string,unknown>;
      let content=reading.content;
      // Tool reads have numbered lines. Reuse overlapping ranges from the same
      // file without dropping any unique code or changing citation metadata.
      if (typeof reading.path==='string' && typeof content==='string' && Number.isInteger(reading.start) && Number.isInteger(reading.end)) {
        let repeated=false;
        content=content.split('\n').flatMap(line=>{
          if(!/^\d+: /.test(line))return [line];
          const key=reading.path+'\0'+line;
          const prior=readLines.get(key);
          if(prior){if(repeated)return [];repeated=true;return [`[Líneas idénticas ya leídas en ${prior}; usar esa lectura.]`];}
          repeated=false;readLines.set(key,location+'.content');return [line];
        }).join('\n');
      }
      return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(key==='content'?content:item,`${location}.${key}`)]));
    }
    return value;
  }
  return messages.map((message, index) => {
    if (typeof message.content !== "string" || !["tool", "user"].includes(message.role)) return message;
    try { return { ...message, content: JSON.stringify(visit(JSON.parse(message.content), `messages[${index}]`)) }; }
    catch { return message; }
  });
}

export function reserveClosure(tokens: number, contextCharacters: number, measuredPromptTokens: number) {
  // Two responses remain necessary: a draft and its mandatory coverage review.
  // Allow space for tools/schema and the draft added to that second request.
  const prompt = Math.max(Math.ceil(contextCharacters / 3) + 4000, measuredPromptTokens);
  return tokens + 2 * (prompt + 4200) + 4200 >= 100000;
}
