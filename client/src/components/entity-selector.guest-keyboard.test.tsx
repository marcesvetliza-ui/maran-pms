import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuestSelector } from "./entity-selector";

const guest = {
  id: "guest-enter-test",
  firstName: "Marcelo",
  lastName: "Svetliza",
  documentType: "dni",
  documentNumber: "25452566",
  tipoPersona: "fisica",
};

function renderSelector(onSelect: (value: any) => void, onSubmit: () => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <form onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}>
        <GuestSelector
          onSelect={onSelect}
          onCreateNew={vi.fn()}
        />
      </form>
    </QueryClientProvider>,
  );
}

describe("GuestSelector keyboard selection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([guest])));
  });

  it("selects the first visible guest with Enter without submitting the reservation form", async () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderSelector(onSelect, onSubmit);

    const input = screen.getByTestId("input-search-guest");
    await user.type(input, "Marce");
    await screen.findByTestId("guest-result-guest-enter-test");
    await user.type(input, "{Enter}");

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "guest-enter-test" }),
    ));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
it("does not offer deactivated cached search results, including through Enter", async () => {
  const active = { ...guest, active: true };
  const inactive = { ...guest, id: "inactive-match", firstName: "Marcelo Inactivo", active: false };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([inactive, active])));
  const onSelect = vi.fn(), onSubmit = vi.fn();
  const user = userEvent.setup();
  renderSelector(onSelect, onSubmit);
  const input = screen.getByTestId("input-search-guest");
  await user.type(input, "Marce");
  await screen.findByTestId(`guest-result-${active.id}`);
  expect(screen.queryByTestId(`guest-result-${inactive.id}`)).not.toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(active);
  expect(onSubmit).not.toHaveBeenCalled();
});

it("keeps an inactive guest visible when already linked to an existing operation", () => {
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><GuestSelector selectedGuest={{ ...guest, active: false } as any} onSelect={vi.fn()} onCreateNew={vi.fn()} /></QueryClientProvider>);
  expect(screen.getByText("Svetliza Marcelo")).toBeInTheDocument();
  expect(screen.queryByTestId("input-search-guest")).not.toBeInTheDocument();
});
