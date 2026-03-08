/**
 * AdminPage — wraps the AdminPanel component (AD-01 through AD-07).
 *
 * Route: /admin
 */
import React from 'react';
import { AdminPanel } from '../components/Admin/AdminPanel';

/**
 * Renders the admin configuration page.
 */
export function AdminPage() {
  return <AdminPanel />;
}
