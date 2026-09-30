import React from 'react';
import { Link } from 'react-router-dom';
import { toneText, type Tone } from '../../lib/tone';

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  /** The context line under the figure — where the number came from. */
  hint?: string;
  tone?: Tone;
  /** Makes the whole tile a link to the page that explains the number. */
  to?: string;
}

const tile: React.CSSProperties = {
  background: 'var(--color-raised)',
  borderRadius: 'var(--radius-panel)',
  boxShadow: 'var(--shadow-raised)',
  padding: '0.875rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  minWidth: 0,
};

/**
 * A number that matters right now.
 *
 * Deliberately one figure with a short label, left-aligned. The Dashboard used
 * to run eight of these across the top in a centred row, which made a
 * single glance at the page return nothing: an officer's first question is
 * whether anything needs them, not what the totals are.
 */
export const StatTile: React.FC<StatTileProps> = ({ label, value, hint, tone = 'neutral', to }) => {
  const body = (
    <>
      <span
        style={{
          fontSize: 'var(--text-meta)',
          fontWeight: 500,
          color: 'var(--color-ink-muted)',
        }}
      >
        {label}
      </span>
      {/* Tabular figures, or the tile twitches as the count crosses a digit
          boundary on the next poll. */}
      <span
        className="tnum"
        style={{
          fontSize: 'var(--text-figure)',
          fontWeight: 700,
          lineHeight: 'var(--text-figure--line-height)',
          letterSpacing: '-0.02em',
          ...toneText[tone],
        }}
      >
        {value}
      </span>
      {hint && (
        <span style={{ fontSize: 'var(--text-label)', color: 'var(--color-ink-muted)' }}>{hint}</span>
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} style={{ ...tile, flex: '1 1 170px', textDecoration: 'none' }}>
        {body}
      </Link>
    );
  }
  return <div style={{ ...tile, flex: '1 1 170px' }}>{body}</div>;
};

interface StatStripProps {
  items: Array<{ label: string; value: React.ReactNode; tone?: Tone; to?: string }>;
}

/**
 * The same figures, demoted to a single line.
 *
 * For the numbers that are context rather than a call to action. One raised
 * object per thing that needs a decision, and everything else on one quiet line.
 */
export const StatStrip: React.FC<StatStripProps> = ({ items }) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.25rem 1.5rem',
      alignItems: 'baseline',
      padding: '0.625rem 0.875rem',
      background: 'var(--color-raised)',
      borderRadius: 'var(--radius-control)',
      border: '1px solid var(--color-rule)',
    }}
  >
    {items.map((item) => {
      const content = (
        <>
          <span
            className="tnum"
            style={{ fontSize: 'var(--text-lead)', fontWeight: 600, ...toneText[item.tone ?? 'neutral'] }}
          >
            {item.value}
          </span>
          <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-ink-muted)' }}>{item.label}</span>
        </>
      );
      return item.to ? (
        <Link key={item.label} to={item.to} style={{ display: 'inline-flex', gap: '0.375rem' }}>
          {content}
        </Link>
      ) : (
        <span key={item.label} style={{ display: 'inline-flex', gap: '0.375rem' }}>
          {content}
        </span>
      );
    })}
  </div>
);
