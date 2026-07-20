import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserMenu } from "./user-menu";
import { useAuth } from "../lib/auth-context";

vi.mock("../lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

const currentUser = {
  id: "user-1",
  name: "Reza",
  email: "reza@example.test",
  status: "active",
  organization: { id: "org-1", name: "Org" },
  hospital: null,
  role: null,
  permissions: [],
};

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the current user's name", () => {
    mockedUseAuth.mockReturnValue({ status: "authenticated", user: currentUser, login: vi.fn(), logout: vi.fn() });

    render(<UserMenu />);

    expect(screen.getByText("Reza")).toBeInTheDocument();
  });

  it("calls logout() when the logout button is clicked", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({ status: "authenticated", user: currentUser, login: vi.fn(), logout });
    const user = userEvent.setup();

    render(<UserMenu />);
    await user.click(screen.getByRole("button", { name: "Keluar" }));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
