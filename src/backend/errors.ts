/**
 * Travel Tracker — Typed Application Errors
 *
 * These error classes are thrown by route handlers and services.
 * The global error handler (middleware/error-handler.ts) catches them
 * and maps statusCode → HTTP response, keeping route handlers clean.
 */

/** Thrown when a resource cannot be found. Returns 404. */
export class NotFoundError extends Error {
  statusCode = 404;
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

/** Thrown when a write is attempted on a locked trip. Returns 403. */
export class LockError extends Error {
  statusCode = 403;
  constructor() {
    super('Trip is locked');
    this.name = 'LockError';
  }
}

/** Thrown on uniqueness violations (e.g. duplicate city on trip). Returns 409. */
export class ConflictError extends Error {
  statusCode = 409;
  constructor(msg: string) {
    super(msg);
    this.name = 'ConflictError';
  }
}

/** Thrown on input validation failures. Returns 400. */
export class ValidationError extends Error {
  statusCode = 400;
  constructor(msg: string) {
    super(msg);
    this.name = 'ValidationError';
  }
}
