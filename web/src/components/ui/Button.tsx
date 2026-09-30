import React, { type ButtonHTMLAttributes } from 'react';
import { toneStyles } from '../../lib/tone';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Renders the child with an icon, sized and spaced together. Every call site
   * was hand-rolling `<UserCheck size={14} style={{marginRight: '0.375rem'}} />`.
   */
  icon?: React.ReactNode;
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '0.3125rem 0.625rem', fontSize: 'var(--text-body)' },
  md: { padding: '0.4375rem 0.875rem', fontSize: 'var(--text-body)' },
};

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: 'var(--color-navy)', color: 'var(--color-ink-inverse)' },
  secondary: { background: 'var(--color-sunken)', color: 'var(--color-ink)' },
  outline: {
    background: 'transparent',
    border: '1px solid var(--color-rule-strong)',
    color: 'var(--color-ink)',
  },
  ghost: { background: 'transparent', color: 'var(--color-ink-muted)' },
  // Destructive actions were previously recoloured at each call site, which is
  // how three different reds ended up in the verification flows.
  danger: { background: 'var(--color-error-ink)', color: 'var(--color-ink-inverse)' },
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  style,
  disabled,
  ...props
}) => (
  <button
    disabled={disabled}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: icon ? '0.375rem' : 0,
      borderRadius: 'var(--radius-control)',
      fontFamily: 'inherit',
      fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      border: '1px solid transparent',
      opacity: disabled ? 0.55 : 1,
      transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
      ...sizeStyles[size],
      ...variantStyles[variant],
      ...style,
    }}
    {...props}
  >
    {icon}
    {children}
  </button>
);

/**
 * The outline of a control that removes something. Visually lighter than a
 * `danger` button so a row of actions does not turn into a wall of red, but it
 * reads as destructive in the one place a mis-click would be expensive.
 */
export const DangerButton: React.FC<Omit<ButtonProps, 'variant'>> = (props) => {
  const { style, ...rest } = props;
  return (
    <Button
      {...rest}
      variant="outline"
      style={{
        borderColor: toneStyles.error.color,
        color: toneStyles.error.color,
        ...style,
      }}
    />
  );
};
