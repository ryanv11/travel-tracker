/**
 * Travel Tracker — Zod Validation Middleware
 *
 * SEC-04: validateBody and validateQuery wrap route handlers to ensure
 * all inputs are validated before any business logic runs.
 * On failure, returns 400 with structured field-level errors in 'details'.
 *
 * Note on Express v5 + Zod v4 compatibility:
 * - req.query is a getter-only property in Express v5; use Object.defineProperty to override.
 * - Zod v4 exposes validation errors as `error.issues` (not `error.errors`).
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Middleware factory that validates req.body against a Zod schema.
 * On success, replaces req.body with the coerced/trimmed value.
 * On failure, returns 400 with { error, details }.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: formatZodErrors(result.error),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Middleware factory that validates req.query against a Zod schema.
 * On success, attaches the coerced/trimmed value via Object.defineProperty
 * (required because Express v5 makes req.query a read-only getter).
 * On failure, returns 400 with { error, details }.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: formatZodErrors(result.error),
      });
      return;
    }
    // Express v5: req.query is a getter-only property on IncomingMessage.
    // Override it using defineProperty so downstream handlers get the coerced value.
    Object.defineProperty(req, 'query', {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}

/** Convert Zod error to an array of { field, message } objects.
 *  Zod v4 uses `issues` (v3 used `errors` as an alias — no longer available). */
function formatZodErrors(error: ZodError): { field: string; message: string }[] {
  return error.issues.map((e) => ({
    field: e.path.join('.') || '_root',
    message: e.message,
  }));
}
