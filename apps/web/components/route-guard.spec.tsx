import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RouteGuard } from "./route-guard";
import { useAuth } from "../lib/auth-context";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("../lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

describe("RouteGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton while status is 'loading', without redirecting", () => {
    mockedUseAuth.mockReturnValue({ status: "loading", user: null, login: vi.fn(), logout: vi.fn() });

    render(
      <RouteGuard>
        <div>Protected content</div>
      </RouteGuard>
    );

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /login and shows the loading state when status is 'unauthenticated'", async () => {
    mockedUseAuth.mockReturnValue({ status: "unauthenticated", user: null, login: vi.fn(), logout: vi.fn() });

    render(
      <RouteGuard>
        <div>Protected content</div>
      </RouteGuard>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders children when status is 'authenticated'", () => {
    mockedUseAuth.mockReturnValue({
      status: "authenticated",
      user: { id: "u1", name: "Reza", email: "r@example.test", status: "active", organization: { id: "o1", name: "Org" }, hospital: null, role: null, permissions: [] },
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <RouteGuard>
        <div>Protected content</div>
      </RouteGuard>
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
