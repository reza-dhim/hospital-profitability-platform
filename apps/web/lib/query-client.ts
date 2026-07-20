import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "./api-client";

/**
 * Single QueryClient instance for the app. Doesn't retry on 401/403/404 —
 * those are never transient (an unauthenticated/forbidden/missing-resource
 * response won't succeed on retry), so retrying just delays the error state
 * every page must show (AGENTS.md).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) return false;
          return failureCount < 2;
        },
        staleTime: 30_000,
      },
    },
  });
}
