import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'default';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default' }) => {
  let bgColor = 'var(--color-border)';
  let color = 'var(--color-text-secondary)';

  if (variant === 'success') {
    bgColor = 'var(--color-status-success-bg)';
    color = 'var(--color-status-success)';
  } else if (variant === 'warning') {
    bgColor = 'var(--color-status-warning-bg)';
    color = 'var(--color-status-warning)';
  } else if (variant === 'error') {
    bgColor = 'var(--color-status-error-bg)';
    color = 'var(--color-status-error)';
  }

  return (
    <span
      style={{
        backgroundColor: bgColor,
        color: color,
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
};
