import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'contrast' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-turmeric-500 text-steel-900 hover:bg-turmeric-400 active:bg-turmeric-600 disabled:bg-steel-200 disabled:text-steel-500',
  contrast:
    'bg-steel-900 text-steel-50 hover:bg-steel-800 active:bg-steel-900 disabled:bg-steel-200 disabled:text-steel-400',
  secondary:
    'bg-transparent text-steel-800 border border-steel-300 hover:border-steel-700 active:bg-steel-100 disabled:text-steel-300 disabled:border-steel-200',
  ghost:
    'bg-transparent text-steel-700 hover:bg-steel-100 active:bg-steel-150 disabled:text-steel-300',
  danger:
    'bg-transparent text-chili-600 border border-chili-500/40 hover:bg-chili-500/5 active:bg-chili-500/10 disabled:text-steel-300 disabled:border-steel-200',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2.5 rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-display font-semibold tracking-tight',
        'transition-colors duration-150 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
