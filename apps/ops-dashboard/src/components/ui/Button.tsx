import type { ButtonHTMLAttributes } from 'react';
import { Button as BaseButton } from '@campus-bites/ui';
import type { ButtonVariant } from '@campus-bites/ui';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  /** Ops buttons are compact by default; callers may still pass a size. */
  size?: 'sm' | 'md';
}

/**
 * Ops keeps a dark, high-contrast primary (the student app's primary is
 * turmeric) — mapped onto the shared button's `contrast` variant so both
 * products stay on one implementation.
 */
const VARIANT_MAP: Record<Variant, ButtonVariant> = {
  primary: 'contrast',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
};

export function Button({ variant = 'primary', size = 'sm', ...props }: ButtonProps) {
  return <BaseButton variant={VARIANT_MAP[variant]} size={size} {...props} />;
}
