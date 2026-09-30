import React from 'react';

interface SectionProps {
  title: React.ReactNode;
  /** Right-aligned controls — a row count, a filter bar, a refresh. */
  actions?: React.ReactNode;
  description?: string;
  /** Optional: a section that is only a titled header bar (a filter row) needs no body. */
  children?: React.ReactNode;
  /** Removes the bottom rule, for the last section on a page. */
  unbordered?: boolean;
}

/**
 * A page section: a title, a rule, then the content.
 *
 * The old pages boxed every section in a card with a shadow, so a page read as
 * six identical objects at the same visual weight and the hierarchy lived only
 * in the font size of the heading. A section is not an object; it is a place on
 * the page, and a rule is enough to say so.
 */
export const Section: React.FC<SectionProps> = ({
  title,
  actions,
  description,
  children,
  unbordered = false,
}) => (
  <section style={{ display: 'flex', flexDirection: 'column' }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
        paddingBottom: '0.625rem',
        borderBottom: unbordered ? 'none' : '1px solid var(--color-rule)',
        marginBottom: '0.875rem',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h2
          style={{
            fontSize: 'var(--text-lead)',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            lineHeight: 'var(--text-lead--line-height)',
          }}
        >
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--color-ink-muted)', margin: '0.125rem 0 0' }}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
    {children}
  </section>
);
