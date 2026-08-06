import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface HostelSelectProps {
  id?: string;
  value: string;
  onChange: (hostel: string) => void;
  hostels: readonly string[];
  required?: boolean;
  className?: string;
}

/**
 * Searchable hostel dropdown for the student registration and profile edit
 * forms. Students can type to filter the list of official Thapar University
 * hostel names instead of scrolling through all 15 options.
 */
export function HostelSelect({ id, value, onChange, hostels, required, className }: HostelSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? hostels.filter((h) => h.toLowerCase().includes(query.toLowerCase()))
    : hostels;

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function openDropdown() {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function select(hostel: string) {
    onChange(hostel);
    setOpen(false);
    setQuery('');
  }

  // Keyboard nav
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
    if (e.key === 'Enter' && filtered.length === 1) {
      e.preventDefault();
      select(filtered[0]);
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        id={id}
        type="button"
        onClick={openDropdown}
        className={cn(
          'flex w-full items-center justify-between rounded-xl border bg-white px-3.5 py-3 text-sm outline-none transition-colors',
          open ? 'border-turmeric-500' : 'border-steel-200',
          !value && 'text-steel-400',
        )}
      >
        <span className={value ? 'text-steel-900' : 'text-steel-400'}>
          {value || 'Select hostel'}
        </span>
        <ChevronDown
          size={15}
          className={cn('shrink-0 text-steel-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Hidden native select for form validation / accessibility */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      >
        <option value="" disabled />
        {hostels.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-steel-200 bg-white shadow-lg">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-steel-100 px-3 py-2">
            <Search size={13} className="shrink-0 text-steel-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search hostel…"
              className="flex-1 bg-transparent text-sm text-steel-900 outline-none placeholder:text-steel-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-steel-400">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-4 py-2.5 text-xs text-steel-400">No hostel matches "{query}"</li>
            ) : (
              filtered.map((h) => (
                <li key={h}>
                  <button
                    type="button"
                    onClick={() => select(h)}
                    className={cn(
                      'flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors hover:bg-turmeric-500/8',
                      h === value
                        ? 'bg-turmeric-500/10 font-semibold text-turmeric-700'
                        : 'text-steel-800',
                    )}
                  >
                    {h}
                    {h === value && (
                      <span className="ml-auto text-turmeric-600">✓</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
