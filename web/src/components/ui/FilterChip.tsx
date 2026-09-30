import React from 'react';
import { control } from '../../lib/styles';

interface FilterChipProps {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  /** Group label, announced by screen readers when chips sit in a toolbar. */
  group?: string;
}

/**
 * A toggle in a filter row.
 *
 * Seniors and Volunteers each had a private copy of this that was byte-identical
 * apart from the component name, and Monitoring used `aria-pressed` on its
 * equivalents while the others used a background colour with no state announced
 * at all.
 */
export const FilterChip: React.FC<FilterChipProps> = ({ label, count, active, onClick, group }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    style={{
      ...control,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.375rem',
      cursor: 'pointer',
      fontWeight: active ? 600 : 400,
      color: active ? 'var(--color-ink-inverse)' : 'var(--color-ink-muted)',
      background: active ? 'var(--color-navy)' : 'var(--color-raised)',
      borderColor: active ? 'var(--color-navy)' : 'var(--color-rule)',
    }}
  >
    {group && <span className="sr-only">{group}: </span>}
    {label}
    {count !== undefined && (
      <span
        className="tnum"
        style={{
          fontSize: 'var(--text-label)',
          color: active ? 'var(--color-ink-on-navy)' : 'var(--color-ink-muted)',
        }}
      >
        {count}
      </span>
    )}
  </button>
);
