import React, { useEffect, useState } from 'react';
import { Bell, Search, User } from 'lucide-react';
import { fetchCurrentUser } from '../../api/client';
import type { CurrentUser } from '../../api/types';

export const Header: React.FC = () => {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((me) => setUser(me))
      .catch(() => setUser(null));
  }, []);

  return (
    <header style={{
      height: '72px',
      backgroundColor: 'var(--color-surface-white)',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 2rem',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
          <input
            type="text"
            placeholder="Search..."
            style={{
              width: '100%',
              padding: '0.5rem 0.5rem 0.5rem 2.5rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--color-border)',
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', color: 'var(--color-text-secondary)' }}>
          <Bell size={20} />
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px', backgroundColor: 'var(--color-status-error)', width: '8px', height: '8px', borderRadius: '50%'
          }}></span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{user?.email ?? 'Police Officer'}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Station HQ</div>
          </div>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
            <User size={20} />
          </div>
        </div>
      </div>
    </header>
  );
};