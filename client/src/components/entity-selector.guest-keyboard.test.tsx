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