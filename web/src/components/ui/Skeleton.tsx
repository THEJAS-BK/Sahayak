import React from 'react';

/** One placeholder bar. Sized by the caller to match the content it stands in for. */
export const Skeleton: React.FC<{ width?: string; height?: string; radius?: string }> = ({
  width = '100%',
  height = '0.875rem',
  radius = 'var(--radius-control)',
}) => (
  <span
    aria-hidden="true"
    className="skeleton"
    style={{ display: 'block', width, height, borderRadius: radius }}
  />
);

/**
 * A table-shaped loading state.
 *
 * Every page used to render a centred grey sentence, which meant the layout
 * collapsed on load and then jumped as the rows arrived. This is the shape of
 * what is coming, so nothing moves.
 */
export const SkeletonTable: React.FC<{ columns: number; rows?: number }> = ({
  columns,
  rows = 6,
}) => (
  <div style={{ padding: '0.5rem 0' }} role="status" aria-live="polite">
    <span className="sr-only">Loading…</span>
    {Array.from({ length: rows }, (_, r) => (
      <div
        key={r}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: '0.75rem',
          alignItems: 'center',
          padding: '0.6875rem 0.75rem',
          borderBottom: '1px solid var(--color-rule)',
        }}
      >
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} width={c === 0 ? '85%' : c === columns - 1 ? '55%' : '70%'} />
        ))}
      </div>
    ))}
  </div>
);

/** A shape-matching placeholder for the stat tile row. */
export const SkeletonTiles: React.FC<{ count: number }> = ({ count }) => (
  <div role="status" aria-live="polite" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
    <span className="sr-only">Loading…</span>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} style={{ flex: '1 1 170px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Skeleton width="60%" />
        <Skeleton width="35%" height="1.5rem" />
      </div>
    ))}
  </div>
);
