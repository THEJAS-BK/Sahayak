import React from 'react';

interface EmptyStateProps {
  title: string;
  /**
   * The one line that makes the difference between "nothing is wrong" and
   * "your filters hid something", which are very different screens and used to
   * render as the same grey sentence.
   */
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action, icon }) => (
  <div
    style={{
      padding: '3rem 1.5rem',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '0.5rem',
      color: 'var(--color-ink-muted)',
    }}
  >
    {icon && (
      <span aria-hidden="true" style={{ color: 'var(--color-rule-strong)' }}>
        {icon}
      </span>
    )}
    <p style={{ fontSize: 'var(--text-lead)', fontWeight: 600, color: 'var(--color-ink)' }}>{title}</p>
    {description && (
      <p style={{ fontSize: 'var(--text-body)', maxWidth: '38ch', lineHeight: 1.5 }}>{description}</p>
    )}
    {action && <div style={{ marginTop: '0.5rem' }}>{action}</div>}
  </div>
);
