import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./login-form";
import { useAuth } from "../lib/auth-context";
import { ApiRequestError } from "../lib/api-client";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("../lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows validation errors and never calls login() when submitted empty", async () => {
    const login = vi.fn();
    mockedUseAuth.mockReturnValue({ status: "unauthenticated", user: null, login, logout: vi.fn() });
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(await screen.findByText("Email wajib diisi")).toBeInTheDocument();
    expect(screen.getByText("Password wajib diisi")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const login = vi.fn();
    mockedUseAuth.mockReturnValue({ status: "unauthenticated", user: null, login, logout: vi.fn() });
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(await screen.findByText("Format email tidak valid")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("calls login() with valid credentials and navigates to /dashboard on success", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({ status: "unauthenticated", user: null, login, logout: vi.fn() });
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "user@example.test");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("user@example.test", "password123"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows the API's error message and does not navigate when login fails", async () => {
    const login = vi.fn().mockRejectedValue(new ApiRequestError(401, { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid email or password.", traceId: "t" }));
    mockedUseAuth.mockReturnValue({ status: "unauthenticated", user: null, login, logout: vi.fn() });
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "user@example.test");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
