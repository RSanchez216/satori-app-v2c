import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Pluralize an English noun based on a count. The count is rendered with
 * `toLocaleString()` so larger numbers carry thousands separators
 * automatically; for small numbers it's a no-op.
 *
 * @example
 *   pluralize(1, 'fault')             // "1 fault"
 *   pluralize(3, 'fault')             // "3 faults"
 *   pluralize(1, 'issue type')        // "1 issue type"
 *   pluralize(2, 'index', 'indices')  // "2 indices"
 *   pluralize(1234, 'event')          // "1,234 events"
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : (plural ?? singular + 's')}`
}
