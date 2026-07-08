import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";

/**
 * Global exception filter producing the standard error envelope from
 * docs/17_ERROR_HANDLING.md §1. Every 4xx/5xx response goes through this —
 * no controller formats its own error body. Stack traces / internal details
 * never serialize to the client, in any environment (§1).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = (request.headers["x-trace-id"] as string | undefined) ?? randomUUID();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code =
      (exception instanceof HttpException ? extractCustomCode(exception) : undefined) ??
      (exception instanceof HttpException ? codeForStatus(status) : "INTERNAL");
    const message =
      exception instanceof HttpException
        ? extractMessage(exception)
        : "An unexpected error occurred.";

    if (status >= 500) {
      this.logger.error(`[${traceId}] ${message}`, exception instanceof Error ? exception.stack : undefined);
    }

    response.status(status).json({
      error: { code, message, traceId },
    });
  }
}

/**
 * Lets a thrown exception carry a specific code (e.g. `new UnauthorizedException({ code: "AUTH_INVALID_CREDENTIALS", message: "..." })`)
 * instead of the generic per-status default — used where a bare HTTP status
 * would be ambiguous (docs/17_ERROR_HANDLING.md §1's `code` is meant to be
 * "namespaced by concern", not just a restatement of the status).
 */
function extractCustomCode(exception: HttpException): string | undefined {
  const body = exception.getResponse();
  if (typeof body === "object" && body !== null && "code" in body) {
    return String((body as { code: unknown }).code);
  }
  return undefined;
}

function extractMessage(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === "string") return body;
  if (typeof body === "object" && body !== null && "message" in body) {
    const msg = (body as { message: unknown }).message;
    return Array.isArray(msg) ? msg.join(", ") : String(msg);
  }
  return exception.message;
}

function codeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "VALIDATION_FAILED";
    case HttpStatus.UNAUTHORIZED:
      return "AUTH_REQUIRED";
    case HttpStatus.FORBIDDEN:
      return "PERMISSION_DENIED";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return "BUSINESS_RULE_VIOLATION";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "RATE_LIMITED";
    case HttpStatus.SERVICE_UNAVAILABLE:
      return "SERVICE_UNAVAILABLE";
    case HttpStatus.NOT_IMPLEMENTED:
      return "NOT_IMPLEMENTED";
    default:
      return "INTERNAL";
  }
}
