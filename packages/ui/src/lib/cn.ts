import { clsx, type ClassValue } from 'clsx';

/** Merge conditional class names. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
