import React from 'react';
import { Bell, User } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header
      style={{
        height: '72px',
        backgroundColor: 'var(--color-surface-white)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 2rem',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            position: 'relative',
            color: 'var(--color-text-secondary)',
          }}
        >
          <Bell size={20} />
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              backgroundColor: 'var(--color-status-error)',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
            }}
          />
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              Admin User
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Station HQ
            </div>
          </div>

          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: '#E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-secondary)',
            }}
          >
            <User size={20} />
          </div>
        </div>
      </div>
    </header>
  );
};