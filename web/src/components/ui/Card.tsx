import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({ children, className = '', style }) => {
  return (
    <div
      className={`card ${className}`}
      style={{
        backgroundColor: 'var(--color-surface-white)',
        borderRadius: '0.5rem',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
