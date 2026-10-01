import React, { useEffect, useState } from 'react';
import { Bell, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { fetchCurrentUser } from '../../api/client';
import type { CurrentUser } from '../../api/types';
import { formatClock } from '../../lib/format';
import { titleForPath } from '../../lib/nav';
import { useOverview } from '../../lib/useOverview';

/**
 * The bar above every page, carrying three things:
 *
 * 1. Which screen this is. It used to sit empty across 60% of its width while
 *    all thirteen pages repeated their own title underneath it.
 * 2. How old the numbers are. The freshness stamp is now permanent rather than
 *    a per-page flourish that three pages remembered and ten did not.
 * 3. How much unattended work is waiting.
 */
export const Header: React.FC = () => {
  const { pathname } = useLocation();
  const { overview, generatedAt, error } = useOverview();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const { title } = titleForPath(pathname);

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

  // Real unattended work, not a decorative dot. A permanently-red badge that
  // never means anything trains an officer to ignore the one control that would
  // tell them an SOS is waiting.
  const attention = overview
    ? overview.emergencies_awaiting_review + overview.verifications_pending
    : 0;

  const roleLabel =
    user?.role === 'police' ? 'Police officer' : user?.role ? user.role : 'Signed in';

  return (
    <header
      style={{
        flexShrink: 0,
        background: 'var(--color-raised)',
        borderBottom: '1px solid var(--color-rule)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0 1.5rem',
        minHeight: '3.5rem',
      }}
    >
      <h1
        style={{
          fontSize: 'var(--text-lead)',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        {generatedAt && (
          <span
            // Announced when it changes, so a stale board is not a silent one.
            aria-live="polite"
            style={{
              fontSize: 'var(--text-meta)',
              color: error ? 'var(--color-warning-ink)' : 'var(--color-ink-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {error ? 'Last update failed · ' : ''}
            as of <span className="tnum">{formatClock(generatedAt)}</span>
          </span>
        )}

        {attention > 0 && (
          <Link
            to="/emergencies"
            // A `title` is a tooltip, not an accessible name, and the badge
            // below contributes only a bare "9+". Without this the control is
            // announced as a number with no indication of what it counts.
            aria-label={`${attention} ${attention === 1 ? 'item' : 'items'} waiting for review. Open emergencies.`}
            title={`${attention} item${attention === 1 ? '' : 's'} waiting for review`}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              // 24px minimum target (WCAG 2.5.8); the bare 19px icon was under it.
              minWidth: '1.5rem',
              minHeight: '1.5rem',
              color: 'var(--color-ink-muted)',
              lineHeight: 0,
              borderRadius: 'var(--radius-control)',
            }}
          >
            <Bell size={19} aria-hidden="true" />
            <span
              className="tnum"
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                minWidth: '16px',
                height: '16px',
                padding: '0 4px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--color-error-ink)',
                color: 'var(--color-ink-inverse)',
                fontSize: 'var(--text-meta)',
                fontWeight: 700,
                lineHeight: '16px',
                textAlign: 'center',
              }}
            >
              {attention > 9 ? '9+' : attention}
            </span>
          </Link>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.2 }}>
              {user?.email ?? 'Police Officer'}
            </div>
            {/* Was a hardcoded "Station HQ". `/me` carries no station, so the
                role is the only honest thing to put here. */}
            <div style={{ fontSize: 'var(--text-meta)', color: 'var(--color-ink-muted)' }}>
              {roleLabel}
            </div>
          </div>

          <div
            aria-hidden="true"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--color-sunken)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-ink-muted)',
              flexShrink: 0,
            }}
          >
            <User size={17} />
          </div>
        </div>
      </div>
    </header>
  );
};
