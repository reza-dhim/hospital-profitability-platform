/** docs/05_AUTHENTICATION.md §1: access token 15 min, refresh token 7 days. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_COOKIE_NAME = "refresh_token";
export const REFRESH_TOKEN_COOKIE_PATH = "/api/v1/auth";
