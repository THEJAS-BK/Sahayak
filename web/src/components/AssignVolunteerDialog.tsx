import React, { useCallback, useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { assignRequestToVolunteer, fetchAssignableVolunteers } from '../api/client';
import type { AssignableVolunteer, PoliceRequest } from '../api/types';
import { Search, UserCheck, X } from 'lucide-react';

interface Props {
  request: PoliceRequest;
  onClose: () => void;
  onAssigned: (volunteer: { id: string; full_name: string | null; phone_number: string | null }) => void;
}

/**
 * P-05: pick a volunteer by hand. The volunteer still has to accept.
 *
 * No distance column on purpose: volunteer positions are registration-time
 * guesses right now, so "nearest" would be false precision. The list is
 * "whoever can take it", ordered ready-first by P-04. Distance comes back with
 * the plan in `plans/deferred-before-production.md`.
 */
export const AssignVolunteerDialog: React.FC<Props> = ({ request, onClose, onAssigned }) => {
  const [volunteers, setVolunteers] = useState<AssignableVolunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAssignableVolunteers({ search: search || undefined })
      .then((result) => setVolunteers(result.volunteers))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load volunteers'))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const assign = async (volunteer: AssignableVolunteer) => {
    setAssigningId(volunteer.id);
    setError(null);
    try {
      const result = await assignRequestToVolunteer(request.id, volunteer.id);
      onAssigned(result.volunteer);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign the request');
    } finally {
      setAssigningId(null);
    }
  };

  // Trust the server's P-05 verdict; only the reason for a refusal is ours.
  const blockedReason = (v: AssignableVolunteer) => {
    if (v.can_assign) return null;
    if (!v.is_verified) return 'Not approved yet';
    if (v.has_active_assignment) return 'Already on another job';
    if (!v.is_available) return 'Off duty — cannot accept';
    return 'Not assignable';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Assign a volunteer"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--color-surface-white)',
          borderRadius: '0.5rem',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 45px rgba(15,23,42,0.25)',
        }}
      >
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Assign a volunteer</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              Request {request.id.slice(0, 8)} · the volunteer is asked, not committed, and still has to accept.
              Listed by readiness, not distance — live volunteer positions are not available yet.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>

        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-secondary)',
              }}
            />
            <input
              type="text"
              placeholder="Search by name, email or organisation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--color-border)',
                outline: 'none',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '0.5rem 1.5rem 1rem', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '0.375rem',
                backgroundColor: 'var(--color-status-error-bg)',
                color: 'var(--color-status-error)',
                fontSize: '0.875rem',
                margin: '0.5rem 0',
              }}
            >
              {error}
            </div>
          )}

          {loading && <div style={{ padding: '1.5rem 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Loading volunteers…</div>}

          {!loading && volunteers.length === 0 && (
            <div style={{ padding: '1.5rem 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              No volunteers match that search.
            </div>
          )}

          {!loading &&
            volunteers.map((volunteer) => {
              const blocked = blockedReason(volunteer);
              return (
                <div
                  key={volunteer.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.875rem 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                      {volunteer.full_name ?? volunteer.email}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      {[volunteer.phone_number, volunteer.organization].filter(Boolean).join(' · ') || volunteer.email}
                    </span>
                    <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {blocked ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{blocked}</span>
                      ) : (
                        <Badge variant="success">Ready</Badge>
                      )}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    disabled={Boolean(blocked) || assigningId !== null}
                    onClick={() => assign(volunteer)}
                  >
                    <UserCheck size={14} style={{ marginRight: '0.375rem' }} />
                    {assigningId === volunteer.id ? 'Assigning…' : 'Assign'}
                  </Button>
                </div>
              );
            })}
        </div>

        <div
          style={{
            padding: '0.875rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};
