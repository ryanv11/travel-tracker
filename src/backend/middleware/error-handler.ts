/**
 * Travel Tracker — Global Error Handler
 *
 * SEC-06: Must be registered as the LAST middleware in server.ts.
 * Never returns stack traces or internal details to the client.
 * Typed application errors (NotFoundError, LockError, etc.) set their own statusCode.
 * All other errors return 500 with a generic message — full details logged server-side.
 */

import type { NextFunction, Request, Response } from 'express';

interface AppError extends Error {
  statusCode?: number;
}

/**
 * Express error-handling middleware (4 params required by Express convention).
 * Catches all errors forwarded via next(err) or thrown in async handlers wrapped
 * with asyncHandler().
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;

  // Log full error server-side (SEC-08: never log req/res body)
  console.error('[ERROR]', req.method, req.path, statusCode, err.message, err.stack);

  // Return sanitised error to client — never expose stack traces
  if (statusCode < 500) {
    // Known application error — safe to return message to client
    res.status(statusCode).json({ error: err.message });
  } else {
    // Unexpected error — generic message only
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Wraps an async route handler so that any rejected promise is forwarded
 * to the global error handler via next(err), preventing unhandled rejections.
 *
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
