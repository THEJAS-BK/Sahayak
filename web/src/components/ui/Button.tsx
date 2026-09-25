import React, { type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  style,
  ...props
}) => {
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0.375rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    border: 'none',
  };

  const sizeStyles = {
    sm: { padding: '0.375rem 0.75rem', fontSize: '0.875rem' },
    md: { padding: '0.5rem 1rem', fontSize: '1rem' },
    lg: { padding: '0.75rem 1.5rem', fontSize: '1.125rem' },
  };

  const variantStyles = {
    primary: {
      backgroundColor: 'var(--color-primary-navy)',
      color: 'var(--color-text-inverse)',
    },
    secondary: {
      backgroundColor: '#E2E8F0',
      color: 'var(--color-text-primary)',
    },
    outline: {
      backgroundColor: 'transparent',
      border: '1px solid var(--color-border)',
      color: 'var(--color-text-primary)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--color-text-secondary)',
    }
  };

  return (
    <button
      style={{
        ...baseStyles,
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
};
