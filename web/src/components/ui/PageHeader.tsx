import React from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: string;
  /** The live freshness stamp, or any right-aligned control. */
  actions?: React.ReactNode;
}

/**
 * A page title and a rule.
 *
 * Not a card, and not a 30px heading floating over a grey page — the section
 * boundary is the rule underneath, which is what the other twelve pages already
 * did informally.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => (
  <header
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '1rem',
      flexWrap: 'wrap',
      paddingBottom: '0.875rem',
      borderBottom: '1px solid var(--color-rule)',
    }}
  >
    <div style={{ minWidth: 0 }}>
      <h1
        style={{
          fontSize: 'var(--text-display)',
          fontWeight: 700,
          letterSpacing: '-0.015em',
          lineHeight: 'var(--text-display--line-height)',
        }}
      >
        {title}
      </h1>
      {description && (
        <p
          style={{
            margin: '0.25rem 0 0',
            color: 'var(--color-ink-muted)',
            fontSize: 'var(--text-body)',
            lineHeight: 'var(--text-body--line-height)',
            maxWidth: '68ch',
          }}
        >
          {description}
        </p>
      )}
    </div>
    {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{actions}</div>}
  </header>
);
