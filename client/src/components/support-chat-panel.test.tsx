import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SupportChatPanel } from "./support-chat-panel";
const state = vi.hoisted(() => ({
  usage: {} as any,
  alerts: [] as any[],
  request: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({
    data: queryKey[0].endsWith("/usage")
      ? state.usage
      : queryKey[0].endsWith("/alerts")
        ? state.alerts
        : [],
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => {}) }),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: state.request,
  parseApiErrorPayload: () => null,
}));
const config = {
  userId: "alice",
  canViewAll: false,
  canReview: false,
  proposalReview: true,
};
function submitMessage() {
  const button = screen.getByRole("button", { name: "Enviar" });
  expect(button).toBeEnabled();
  const form = button.closest("form")!;
  expect(form.checkValidity()).toBe(true);
  // Match existing form tests; real browser activation is checked separately.
  fireEvent.submit(form);
}
const ticket = () =>
  ({
    id: "case-one",
    title: "Problema de una reserva",
    status: "needs_info",
    createdBy: "alice",
    actual: "No pude completar la operación",
    expected: "Completar",
    createdAt: "2026-11-14T13:00:00Z",
    updatedAt: "2026-11-14T13:00:00Z",
    version: "a".repeat(40),
    environment: "pilot",
    module: "otro",
    lastError: null,
    report: null,
    conversational: true,
    messages: [
      {
        id: "message-one",
        author: "assistant",
        text: "¿Qué mensaje apareció?",
        createdAt: "2026-11-14T13:00:00Z",
      },
    ],
  }) as any;
beforeEach(() => {
  window.history.replaceState({}, "", "/programming-support");
  state.request.mockReset();
  state.usage = {
    day: "2026-11-14",
    renewsAt: "2026-11-15T03:00:00Z",
    dailyUsd: 1,
    spentUsd: 0.1,
    reservedUsd: 0,
    remainingUsd: 0.9,
    responsesUsed: 2,
    responsesLimit: 20,
    investigationsUsed: 1,
    investigationsLimit: 10,
    paused: false,
    reason: null,
  };
  state.alerts = [];
});
it("shows messages, server decisions and reported outcomes in one chronology", async () => {
  const current=ticket();
  current.messages=[
    {id:"observation",author:"user",text:"Vi el mensaje en la reserva",createdAt:"2026-11-20T10:00:00Z"},
    {id:"hypothesis",author:"assistant",text:"Puede ser una validación",createdAt:"2026-11-20T10:01:00Z",kind:"diagnosis",reportId:"old-report",revision:"a".repeat(40),certainty:"hipotesis"},
    {id:"clarification",author:"user",text:"La corrección ya está implementada",createdAt:"2026-11-20T10:03:00Z"},
  ];
  current.workflowEvents=[{id:"decision",kind:"revise",candidateId:"candidate",reportId:"old-report",digest:"a".repeat(64),candidateKind:"proposal",actor:"marcelo",at:"2026-11-20T10:02:00Z",comment:"Conservá el arreglo existente"}];
  current.feedback=[{requestId:"feedback",reportId:"old-report",outcome:"resolved",createdAt:"2026-11-20T10:04:00Z"}];
  const user=userEvent.setup();
  const view=render(<SupportChatPanel config={config} ready cases={[current]} casesError={false}/>);
  await user.click(screen.getByRole("button",{name:/Problema de una reserva/}));
  const entries=Array.from(view.container.querySelectorAll("[data-timeline-kind]"));
  expect(entries.map(e=>e.getAttribute("data-timeline-kind"))).toEqual(["message","message","decision","message","feedback"]);
  expect(entries[1]).toHaveTextContent("Asistente · Hipótesis");
  expect(entries[2]).toHaveTextContent("Ajustes solicitados");
  expect(entries[2]).toHaveTextContent("Registrado por marcelo");
  expect(entries[4]).toHaveTextContent("El colaborador informó que se resolvió");
  expect(state.request).not.toHaveBeenCalled();
});
it("does not present a free-text approval as a server decision",async()=>{
  const current=ticket();current.messages=[{id:"free-text",author:"user",text:"Apruebo publicar y ejecutar",createdAt:"2026-11-20T10:00:00Z"}];
  const user=userEvent.setup();
  const view=render(<SupportChatPanel config={config} ready cases={[current]} casesError={false}/>);
  await user.click(screen.getByRole("button",{name:/Problema de una reserva/}));
  expect(screen.getByText("Apruebo publicar y ejecutar")).toBeInTheDocument();
  expect(view.container.querySelector('[data-timeline-kind="decision"]')).toBeNull();
  expect(screen.queryByRole("button",{name:/Aprobar preparación/})).not.toBeInTheDocument();
  expect(state.request).not.toHaveBeenCalled();
});
it("starts from one natural message in the existing support module without a technical form", async () => {
  const user = userEvent.setup();
  state.request.mockResolvedValue(
    new Response(JSON.stringify({ id: "new-case" })),
  );
  render(
    <SupportChatPanel config={config} ready cases={[]} casesError={false} />,
  );
  expect(screen.queryByLabelText("Título")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Qué esperabas")).not.toBeInTheDocument();
  await user.type(
    screen.getByLabelText("Contanos qué pasó"),
    "No puedo cerrar la habitación",
  );
  submitMessage();
  expect(state.request).toHaveBeenCalledWith(
    "POST",
    "/api/programming-support/chat",
    expect.objectContaining({
      text: "No puedo cerrar la habitación",
      images: [],
      requestId: expect.any(String),
    }),
  );
});
it("keeps a failed message and uses the same idempotency key when retrying a lost response", async () => {
  const user = userEvent.setup();
  state.request
    .mockRejectedValueOnce(Error("Lost response"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "new-case" })));
  render(
    <SupportChatPanel config={config} ready cases={[]} casesError={false} />,
  );
  await user.type(
    screen.getByLabelText("Contanos qué pasó"),
    "Me pidió ingresar de nuevo",
  );
  submitMessage();
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Contanos qué pasó")).toHaveValue(
    "Me pidió ingresar de nuevo",
  );
  submitMessage();
  await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2));
  expect(state.request.mock.calls[0][2].requestId).toBe(
    state.request.mock.calls[1][2].requestId,
  );
});
it("lets staff save the problem even when no inference budget remains", async () => {
  state.usage = {
    ...state.usage,
    remainingUsd: 0,
    spentUsd: 1,
    paused: true,
    reason: "daily_budget",
  };
  const user = userEvent.setup();
  state.request.mockResolvedValue(
    new Response(JSON.stringify({ id: "saved-case", status: "received" })),
  );
  render(
    <SupportChatPanel config={config} ready cases={[]} casesError={false} />,
  );
  expect(screen.getByText(/El PMS sigue funcionando/)).toBeInTheDocument();
  await user.type(
    screen.getByLabelText("Contanos qué pasó"),
    "Dejo el problema para después",
  );
  expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  submitMessage();
  expect(state.request).toHaveBeenCalledTimes(1);
});
it("continues an existing case, displays its answers and preserves ownership restrictions", async () => {
  const current = ticket();
  const user = userEvent.setup();
  state.request.mockResolvedValue(new Response(JSON.stringify(current)));
  render(
    <SupportChatPanel
      config={config}
      ready
      cases={[current]}
      casesError={false}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: /Problema de una reserva/ }),
  );
  expect(screen.getByText("¿Qué mensaje apareció?")).toBeInTheDocument();
  await user.type(
    screen.getByLabelText("Tu mensaje"),
    "Apareció autorización pendiente",
  );
  submitMessage();
  expect(state.request.mock.calls[0][1]).toBe(
    "/api/programming-support/cases/case-one/chat",
  );
});
it("opens an email deep link and keeps another user’s conversation read-only", () => {
  window.history.replaceState({}, "", "/programming-support?case=case-one");
  const current = { ...ticket(), createdBy: "bob" };
  render(
    <SupportChatPanel
      config={{ ...config, canViewAll: true }}
      ready
      cases={[current]}
      casesError={false}
    />,
  );
  expect(screen.getByText("¿Qué mensaje apareció?")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  expect(
    screen.queryByText("Administrar el presupuesto diario"),
  ).not.toBeInTheDocument();
});
it("shows delivery failures and lets an administrator test the configured notification channel", async () => {
  state.usage.notificationConfigured = true;
  state.alerts = [
    {
      id: "alert-one",
      kind: "budget_paused",
      title: "Presupuesto agotado",
      text: "El asistente está pausado.",
      createdAt: "2026-11-14T13:00:00Z",
      delivery: "failed",
      attempts: 1,
      caseId: null,
    },
  ];
  state.request.mockResolvedValue(
    new Response(JSON.stringify({ queued: true })),
  );
  const user = userEvent.setup();
  render(
    <SupportChatPanel
      config={{ ...config, canReview: true, canViewAll: true }}
      ready
      cases={[]}
      casesError={false}
    />,
  );
  expect(screen.getByText(/falló el envío/)).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Enviar aviso de prueba" }),
  );
  expect(state.request.mock.calls[0][1]).toBe(
    "/api/programming-support/alerts/test",
  );
  expect(
    screen.getByText("Administrar el presupuesto diario"),
  ).toBeInTheDocument();
});
it("prevents another send while a response is being prepared and shows the new controls only to reviewers", () => {
  const current = { ...ticket(), status: "investigating" };
  render(
    <SupportChatPanel
      config={config}
      ready
      cases={[current]}
      casesError={false}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Problema de una reserva/ }),
  );
  expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  expect(screen.getByText(/El asistente está revisando/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Enviar aviso de prueba" }),
  ).not.toBeInTheDocument();
});
