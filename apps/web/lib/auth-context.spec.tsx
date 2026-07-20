import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./auth-context";
import { authApi } from "./auth-api";

vi.mock("./auth-api", () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}));

const mockedAuthApi = vi.mocked(authApi);

function StatusProbe() {
  const { status, user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.name ?? "none"}</span>
      <button onClick={() => login("user@example.test", "password123")}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

const currentUser = {
  id: "user-1",
  name: "Reza",
  email: "user@example.test",
  status: "active",
  organization: { id: "org-1", name: "Org" },
  hospital: null,
  role: null,
  permissions: ["profitability.read"],
};

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in 'loading' status, then becomes 'authenticated' when GET /auth/me succeeds (silent re-auth on mount)", async () => {
    mockedAuthApi.me.mockResolvedValue(currentUser);

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId("status").textContent).toBe("loading");
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(screen.getByTestId("user").textContent).toBe("Reza");
  });

  it("becomes 'unauthenticated' when GET /auth/me fails (no valid refresh cookie)", async () => {
    mockedAuthApi.me.mockRejectedValue(new Error("401"));

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
  });

  it("login() calls authApi.login then authApi.me(), landing on 'authenticated' with the user populated", async () => {
    mockedAuthApi.me.mockResolvedValueOnce(currentUser).mockResolvedValueOnce(currentUser);
    mockedAuthApi.login.mockResolvedValue({ accessToken: "token-1", expiresIn: 900 });
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));

    await user.click(screen.getByText("login"));

    expect(mockedAuthApi.login).toHaveBeenCalledWith({ email: "user@example.test", password: "password123" });
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("Reza"));
  });

  it("logout() clears the user and sets status to 'unauthenticated'", async () => {
    mockedAuthApi.me.mockResolvedValue(currentUser);
    mockedAuthApi.logout.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));

    await user.click(screen.getByText("logout"));

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("useAuth() throws when used outside AuthProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<StatusProbe />)).toThrow("useAuth must be used within AuthProvider");
    consoleError.mockRestore();
  });
});
