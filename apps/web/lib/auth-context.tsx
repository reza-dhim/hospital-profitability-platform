"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { configureApiClient } from "./api-client";
import { authApi, type CurrentUser } from "./auth-api";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * docs/05_AUTHENTICATION.md §1: the access token lives only in memory here
 * (a ref, not state — it changes on every silent refresh and doesn't need
 * to trigger a re-render itself). On mount, `GET /auth/me` is called with
 * no token; the api-client's own 401→refresh→retry logic (sub-task 1)
 * transparently exchanges the httpOnly refresh cookie for a fresh access
 * token and retries — this is the "silent re-auth on page load" flow, not a
 * separate bootstrap call.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const accessTokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);

  const handleUnauthenticated = useCallback(() => {
    accessTokenRef.current = null;
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      setAccessToken: (token) => {
        accessTokenRef.current = token;
      },
      onUnauthenticated: handleUnauthenticated,
    });

    let cancelled = false;
    (async () => {
      try {
        const me = await authApi.me();
        if (!cancelled) {
          setUser(me);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handleUnauthenticated]);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login({ email, password });
    accessTokenRef.current = tokens.accessToken;
    const me = await authApi.me();
    setUser(me);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    accessTokenRef.current = null;
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return <AuthContext.Provider value={{ status, user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
