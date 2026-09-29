import React, { useEffect, useState } from 'react';
import { Bell, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchCurrentUser, fetchPoliceOverview } from '../../api/client';
import type { CurrentUser, PoliceOverview } from '../../api/types';

/**
 * The bell shows the real unattended work count from P-08, not a decorative
 * dot. A permanently-red badge that never means anything trains an officer to
 * ignore the one control that would tell them an SOS is waiting.
 */
export const Header: React.FC = () => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [overview, setOverview] = useState<PoliceOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        // A 401 here is already handled by the client, which redirects to login.
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchPoliceOverview()
        .then((result) => {
          if (!cancelled) setOverview(result);
        })
        .catch(() => {
          // The badge is advisory. A failure here must not blank the header.
        });
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const attention = overview
    ? overview.emergencies_awaiting_review + overview.verifications_pending
    : null;

  const roleLabel =
    user?.role === 'police' ? 'Police officer' : user?.role ? user.role : 'Signed in';

  return (
    <header
      style={{
        height: '64px',
        flexShrink: 0,
        backgroundColor: 'var(--color-surface-white)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 2rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        {attention !== null && attention > 0 && (
          <Link
            to="/emergencies"
            title={`${attention} item${attention === 1 ? '' : 's'} waiting for review`}
            style={{
              position: 'relative',
              display: 'inline-flex',
              color: 'var(--color-text-secondary)',
              lineHeight: 0,
            }}
          >
            <Bell size={20} />
            <span
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-6px',
                minWidth: '16px',
                height: '16px',
                padding: '0 4px',
                borderRadius: '999px',
                backgroundColor: 'var(--color-status-error)',
                color: '#fff',
                fontSize: '0.625rem',
                fontWeight: 700,
                lineHeight: '16px',
                textAlign: 'center',
              }}
            >
              {attention > 9 ? '9+' : attention}
            </span>
          </Link>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              {user?.email ?? 'Police Officer'}
            </div>
            {/* Was a hardcoded "Station HQ". `/me` carries no station, so the
                role is the only honest thing to put here. */}
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
              {roleLabel}
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
              flexShrink: 0,
            }}
          >
            <User size={18} />
          </div>
        </div>
      </div>
    </header>
  );
};
