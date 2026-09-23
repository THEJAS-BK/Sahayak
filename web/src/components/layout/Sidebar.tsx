import React from 'react';
import { LayoutDashboard, Users, AlertTriangle, ShieldCheck, Settings, LogOut, ListChecks } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export const Sidebar: React.FC = () => {
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: ListChecks, label: 'Requests', path: '/requests' },
    { icon: ShieldCheck, label: 'Verification', path: '/verification' },
    { icon: AlertTriangle, label: 'Emergencies', path: '/emergencies' },
    { icon: Users, label: 'Seniors', path: '/seniors' },
    { icon: Users, label: 'Volunteers', path: '/volunteers' },
  ];

  return (
    <aside style={{
      width: '260px',
      backgroundColor: 'var(--color-primary-navy)',
      color: 'var(--color-text-inverse)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck size={24} />
          Sahayak Admin
        </h1>
      </div>

      <nav style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              backgroundColor: isActive ? 'var(--color-primary-navy-hover)' : 'transparent',
              color: isActive ? '#FFFFFF' : '#94A3B8',
              textDecoration: 'none',
              fontWeight: 500,
              transition: 'all 0.2s',
            })}
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '1.5rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <a href="#" style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
            color: '#94A3B8', textDecoration: 'none', fontWeight: 500
        }}>
          <Settings size={20} />
          Settings
        </a>
        <a href="#" style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
            color: '#94A3B8', textDecoration: 'none', fontWeight: 500
        }}>
          <LogOut size={20} />
          Logout
        </a>
      </div>
    </aside>
  );
};
