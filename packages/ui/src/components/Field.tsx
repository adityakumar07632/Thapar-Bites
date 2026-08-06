import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const controlClass =
  'w-full rounded-lg border border-steel-200 bg-white px-3 py-2 text-sm text-steel-900 outline-none transition-colors placeholder:text-steel-400 focus:border-turmeric-500 disabled:bg-steel-100 disabled:text-steel-400';

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-sm', className)}>
      <span className="font-medium text-steel-700">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-chili-600">{error}</span>
      ) : (
        hint && <span className="text-xs text-steel-400">{hint}</span>
      )}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, className)} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(controlClass, className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(controlClass, className)} />;
}

export function Alert({
  tone = 'error',
  children,
  className,
}: {
  tone?: 'error' | 'success' | 'info';
  children: ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === 'error'
      ? 'bg-chili-500/10 text-chili-600'
      : tone === 'success'
        ? 'bg-cardamom-500/10 text-cardamom-600'
        : 'bg-turmeric-500/10 text-turmeric-700';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg px-3.5 py-2.5 text-sm', toneClass, className)}>
      {children}
    </div>
  );
}
