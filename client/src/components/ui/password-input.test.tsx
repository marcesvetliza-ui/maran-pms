import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("arranca oculto y el botón de ojo alterna a texto plano y de vuelta", async () => {
    const user = userEvent.setup();
    render(<PasswordInput placeholder="Contraseña" data-testid="input-pw" />);

    const input = screen.getByTestId("input-pw") as HTMLInputElement;
    expect(input.type).toBe("password");

    const toggle = screen.getByTestId("button-toggle-password-visibility");
    await user.click(toggle);
    expect(input.type).toBe("text");

    await user.click(toggle);
    expect(input.type).toBe("password");
  });

  it("dejar escribir texto y lo mantiene al alternar visibilidad", async () => {
    const user = userEvent.setup();
    render(<PasswordInput data-testid="input-pw" />);

    const input = screen.getByTestId("input-pw") as HTMLInputElement;
    await user.type(input, "miClave123");
    expect(input.value).toBe("miClave123");

    await user.click(screen.getByTestId("button-toggle-password-visibility"));
    expect(input.value).toBe("miClave123");
  });
});
