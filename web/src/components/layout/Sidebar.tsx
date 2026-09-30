import React from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearSession, logout } from '../../api/client';
import { navGroups } from '../../lib/nav';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    // A-04 revokes the refresh token server-side. Police accounts are issued
    // none, so `logout()` resolves to null and there is nothing to revoke —
    // the local session still has to go either way, and a failed revoke must
    // not leave the officer stuck in the console.
    try {
      await logout();
    } catch {
      // Intentionally ignored: the token expires on its own.
    } finally {
      clearSession();
      navigate('/login', { replace: true });
    }
  };

  return (
    <aside
      className="on-navy"
      style={{
        width: '232px',
        flexShrink: 0,
        background: 'var(--color-navy)',
        color: 'var(--color-ink-inverse)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '1.125rem 1.25rem', borderBottom: '1px solid var(--color-navy-rule)' }}>
        <p
          style={{
            fontSize: 'var(--text-lead)',
            fontWeight: 700,
            letterSpacing: '-0.015em',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <ShieldCheck size={20} />
          Sahayak
        </p>
        <p style={{ margin: '0.125rem 0 0', fontSize: 'var(--text-meta)', color: 'var(--color-ink-on-navy)' }}>
          Police operations console
        </p>
      </div>

      <nav
        aria-label="Sections"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '0.875rem 0.625rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {navGroups.map((group) => (
          <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
            {/*
              Sentence case, not the old 11px tracked-out capitals. The group
              label is a caption on a list of nine items, and at 11px on navy it
              also fell below the contrast floor.
            */}
            <span
              style={{
                padding: '0 0.5rem 0.25rem',
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-on-navy)',
              }}
            >
              {group.label}
            </span>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: '0.4375rem 0.5rem',
                  borderRadius: 'var(--radius-control)',
                  // A left rule rather than a filled block. The fill made the
                  // active row look like a button sitting on a darker button.
                  borderLeft: `2px solid ${isActive ? 'var(--color-ink-inverse)' : 'transparent'}`,
                  background: isActive ? 'var(--color-navy-raised)' : 'transparent',
                  color: isActive ? 'var(--color-ink-inverse)' : 'var(--color-ink-on-navy)',
                  fontSize: 'var(--text-body)',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'background-color 0.15s, color 0.15s',
                })}
              >
                <item.icon size={17} aria-hidden="true" style={{ flexShrink: 0 }} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: '0.625rem', borderTop: '1px solid var(--color-navy-rule)' }}>
        <button
          type="button"
          onClick={() => void handleLogout()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            padding: '0.4375rem 0.5rem',
            color: 'var(--color-ink-on-navy)',
            background: 'none',
            border: 'none',
            borderRadius: 'var(--radius-control)',
            cursor: 'pointer',
            fontWeight: 400,
            fontFamily: 'inherit',
            textAlign: 'left',
            fontSize: 'var(--text-body)',
            width: '100%',
          }}
        >
          <LogOut size={17} aria-hidden="true" style={{ flexShrink: 0 }} />
          Log out
        </button>
      </div>
    </aside>
  );
};
