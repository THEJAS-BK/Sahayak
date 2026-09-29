import React from 'react';
import { LayoutDashboard, Users, AlertTriangle, ShieldCheck, LogOut, ListChecks, ScrollText, Map as MapIcon, Activity } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Map as MapIcon,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearSession, logout } from '../../api/client';

/**
 * `exact` matters for `/`: without it React Router treats the dashboard as a
 * match for every sibling path and highlights two items at once.
 */
const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', end: true },
  { icon: ListChecks, label: 'Requests', path: '/requests' },
  { icon: Activity, label: 'Monitoring', path: '/monitoring' },
  { icon: AlertTriangle, label: 'Emergencies', path: '/emergencies' },
  { icon: ShieldCheck, label: 'Verification', path: '/verification' },
  { icon: Users, label: 'Seniors', path: '/seniors' },
  { icon: Users, label: 'Volunteers', path: '/volunteers' },
  { icon: MapIcon, label: 'Map', path: '/map' },
  { icon: ScrollText, label: 'Audit Logs', path: '/audit-logs' },
];

/** Sections, purely for grouping. Every item is a real, wired screen. */
const groups = [
  { label: 'Operations', items: menuItems.slice(0, 4) },
  { label: 'People', items: menuItems.slice(4, 7) },
  { label: 'Oversight', items: menuItems.slice(7) },
];

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
      style={{
        width: '250px',
        flexShrink: 0,
        backgroundColor: 'var(--color-primary-navy)',
        color: 'var(--color-text-inverse)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <h1
          style={{
            fontSize: '1.125rem',
            fontWeight: 700,
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <ShieldCheck size={22} />
          Sahayak Admin
        </h1>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#94A3B8' }}>
          Police operations console
        </p>
      </div>

      <nav
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '1rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        {groups.map((group) => (
          <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span
              style={{
                padding: '0 0.75rem',
                fontSize: '0.6875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#64748B',
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
                  gap: '0.75rem',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.375rem',
                  backgroundColor: isActive ? 'var(--color-primary-navy-hover)' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#94A3B8',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  fontSize: '0.9375rem',
                  fontWeight: isActive ? 600 : 500,
                  transition: 'background-color 0.15s, color 0.15s',
                })}
              >
                <item.icon size={18} style={{ flexShrink: 0 }} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: '1.5rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
               <button onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
            color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
            fontFamily: 'inherit', textAlign: 'left', fontSize: '1rem' as const, width: '100%',
        }}>
          <LogOut size={20} />
      <div
        style={{
          padding: '0.75rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <button
          onClick={() => void handleLogout()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.625rem 0.75rem',
            color: '#94A3B8',
            background: 'none',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: 500,
            fontFamily: 'inherit',
            textAlign: 'left',
            fontSize: '0.9375rem',
            width: '100%',
          }}
        >
          <LogOut size={18} style={{ flexShrink: 0 }} />
          Logout
        </button>
      </div>
    </aside>
  );
};
