import React from 'react';
import { Search } from 'lucide-react';
import { control } from '../../lib/styles';
import { FilterChip } from './FilterChip';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Must say what it searches. `GET /police/requests` has no search parameter,
   * so that field is labelled "Search loaded rows" — calling it "Search" would
   * promise a server-wide search the API does not have.
   */
  label: string;
  placeholder?: string;
  width?: string;
}

/** A search field with its icon placed once, rather than at each of five call sites. */
export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  label,
  placeholder,
  width = '240px',
}) => (
  <div style={{ position: 'relative', width, maxWidth: '100%' }}>
    <Search
      size={16}
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '0.625rem',
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--color-ink-muted)',
        pointerEvents: 'none',
      }}
    />
    <input
      type="search"
      aria-label={label}
      placeholder={placeholder ?? label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...control,
        width: '100%',
        paddingLeft: '2rem',
        // The UA clear button sits on top of our own padding on `type="search"`.
        WebkitAppearance: 'none',
        appearance: 'none',
      }}
    />
  </div>
);

interface FilterBarProps {
  children: React.ReactNode;
}

/** One row of filter instruments. Wraps rather than scrolls, so nothing hides. */
export const FilterBar: React.FC<FilterBarProps> = ({ children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>{children}</div>
);

export { FilterChip };
