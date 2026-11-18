/** Only display the API's public error message, never a raw proxy page or stack. */
export function assignmentErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const match = error.message.match(/^\d+:\s*(\{[\s\S]*\})$/);
  if (!match) return fallback;
  try {
    const payload = JSON.parse(match[1]);
    return typeof payload.error === 'string' && payload.error.trim() ? payload.error : fallback;
  } catch { return fallback; }
}
