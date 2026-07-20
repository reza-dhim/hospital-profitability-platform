import type { components } from "@hpp/contracts";
import { apiRequest } from "./api-client";

export type LoginRequest = components["schemas"]["LoginDto"];
export type AuthTokens = components["schemas"]["AuthTokensDto"];
export type CurrentUser = components["schemas"]["CurrentUserDto"];

/** docs/05_AUTHENTICATION.md §2. Refresh token itself never appears here — only the httpOnly cookie the browser sets. */
export const authApi = {
  login: (credentials: LoginRequest) => apiRequest<AuthTokens>("/auth/login", { method: "POST", body: credentials }),
  logout: () => apiRequest<void>("/auth/logout", { method: "POST" }),
  me: () => apiRequest<CurrentUser>("/auth/me"),
};
