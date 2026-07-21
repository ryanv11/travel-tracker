/**
 * Test for the WP-02 Input primitive (spec §5) — not wired into any existing form.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../Input';

describe('Input', () => {
  it('renders and accepts a value via onChange like a native input', () => {
    render(<Input placeholder="Search trips…" defaultValue="" />);
    const input = screen.getByPlaceholderText('Search trips…');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('applies the wp-* token classes', () => {
    render(<Input placeholder="x" />);
    expect(screen.getByPlaceholderText('x').className).toContain('bg-wp-bg-surface');
  });

  it('merges a caller-supplied className', () => {
    render(<Input placeholder="y" className="w-full" />);
    expect(screen.getByPlaceholderText('y').className).toContain('w-full');
  });
});
