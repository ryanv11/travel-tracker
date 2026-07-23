/**
 * BUG-60 / ADL-37 — Express `trust proxy` configured for Railway's single edge hop.
 *
 * Railway sits a TLS-terminating edge proxy in front of this container and appends the
 * real client IP to X-Forwarded-For. Without `trust proxy`, Express won't read that
 * header and express-rate-limit (SEC-07) throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on
 * boot; with `trust proxy: true` a client could forge the chain and spoof its IP
 * (ERR_ERL_PERMISSIVE_TRUST_PROXY). The correct value is the integer hop count `1`.
 *
 * These assertions run against the test-export app (server-test-app.ts), which mirrors
 * server.ts's middleware pipeline, so they lock in the setting for the exact app tests
 * exercise. See ADL-37.
 */

import { describe, expect, it } from 'vitest';
import app from '../server-test-app.js';

describe('BUG-60 — trust proxy configuration', () => {
  it('trusts exactly one hop (integer 1), not the whole chain', () => {
    // The literal setting value must be the integer 1 — never `true` (spoofable) and
    // never left at the `false` default (rate limiter can't resolve client IPs).
    expect(app.get('trust proxy')).toBe(1);
  });

  it('compiled trust function trusts only the first (nearest) hop', () => {
    // Express compiles `trust proxy` into a predicate (addr, hopIndex) => boolean.
    // For hop count 1 it must trust hop 0 (Railway's edge, the immediate peer) and
    // NOT hop 1 — this is the security property: a forged X-Forwarded-For prefix from
    // the client sits at a deeper hop and is therefore ignored when resolving req.ip.
    const trust = app.get('trust proxy fn') as (addr: string, i: number) => boolean;
    expect(typeof trust).toBe('function');
    expect(trust('10.0.0.1', 0)).toBe(true);
    expect(trust('10.0.0.1', 1)).toBe(false);
  });
});
