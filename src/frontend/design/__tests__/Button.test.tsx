/**
 * Kitchen-sink test for the WP-02 Button primitive (spec §5) — proves all four
 * variants render correctly in isolation. Not wired into any existing screen.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, type ButtonVariant } from '../Button';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'destructive', 'ghost'];

describe('Button', () => {
  it.each(VARIANTS)('renders the %s variant with its label', (variant) => {
    render(<Button variant={variant}>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('defaults to the primary variant', () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole('button', { name: 'Default' }).className).toContain('bg-wp-primary');
  });

  it('defaults to type="button" (no accidental form submits)', () => {
    render(<Button>Submit-safe</Button>);
    expect(screen.getByRole('button', { name: 'Submit-safe' })).toHaveAttribute('type', 'button');
  });

  it('forwards onClick and other native button props', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    screen.getByRole('button', { name: 'Go' }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
