import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Alert } from './ui/Alert';
import { EmptyState } from './ui/EmptyState';
import { Skeleton } from './ui/Skeleton';
import { SearchInput } from './ui/SearchInput';
import { assignRequestToVolunteer, fetchAssignableVolunteers } from '../api/client';
import type { AssignableVolunteer, PoliceRequest } from '../api/types';
import { UserCheck } from 'lucide-react';
import { shortId } from '../lib/format';

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
    // Debounced so typing a name is not one request per keystroke.
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

  const allBlocked = !loading && volunteers.length > 0 && volunteers.every((v) => !v.can_assign);

  return (
    <Modal
      title="Assign a volunteer"
      onClose={onClose}
      width={580}
      footer={<Button variant="secondary" onClick={onClose}>Cancel</Button>}
    >
      <p
        style={{
          margin: '0 0 1rem',
          fontSize: 'var(--text-meta)',
          color: 'var(--color-ink-muted)',
          lineHeight: 1.5,
        }}
      >
        Request <span className="mono">{shortId(request.id)}</span> for{' '}
        <strong style={{ color: 'var(--color-ink)' }}>
          {request.senior.full_name ?? request.senior.email ?? 'this senior'}
        </strong>
        . The volunteer is asked, not committed, and still has to accept. Listed by readiness, not
        distance — live volunteer positions are not available yet.
      </p>

      <SearchInput
        value={search}
        onChange={setSearch}
        label="Search volunteers"
        placeholder="Search by name, email or organisation…"
        width="100%"
      />

      {error && (
        <div style={{ marginTop: '1rem' }}>
          <Alert onRetry={load}>{error}</Alert>
        </div>
      )}

      {loading && (
        <div role="status" aria-live="polite" style={{ marginTop: '1rem' }}>
          <span className="sr-only">Loading volunteers…</span>
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.875rem 0',
                borderBottom: '1px solid var(--color-rule)',
              }}
            >
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <Skeleton width="45%" />
                <Skeleton width="65%" height="0.75rem" />
              </div>
              <Skeleton width="5rem" height="1.875rem" />
            </div>
          ))}
        </div>
      )}

      {!loading && volunteers.length === 0 && (
        <EmptyState
          title="No volunteer matches that search"
          description="P-04 orders this list by readiness, so an empty result means nobody in the system is currently eligible for this request."
        />
      )}

      {!loading && allBlocked && (
        <div style={{ marginTop: '0.75rem' }}>
          <Alert tone="warning" role="status">
            No volunteer is currently eligible for this request. Every one is either unverified, off
            duty, or already on another job.
          </Alert>
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
                borderBottom: '1px solid var(--color-rule)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{volunteer.full_name ?? volunteer.email}</span>
                <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-ink-muted)' }}>
                  {[volunteer.phone_number, volunteer.organization].filter(Boolean).join(' · ') ||
                    volunteer.email}
                </span>
                {blocked ? (
                  <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-ink-muted)' }}>
                    {blocked}
                  </span>
                ) : (
                  <Badge tone="success" dot>
                    Ready
                  </Badge>
                )}
              </div>
              {/* The button is not merely disabled for a blocked volunteer: a
                  disabled control gives no reason, and the reason is the one
                  thing that tells an officer whether to wait or to escalate. */}
              <Button
                size="sm"
                disabled={Boolean(blocked) || assigningId !== null}
                onClick={() => assign(volunteer)}
                icon={<UserCheck size={14} />}
                aria-label={
                  blocked
                    ? `Cannot assign ${volunteer.full_name ?? volunteer.email}: ${blocked}`
                    : `Assign ${volunteer.full_name ?? volunteer.email}`
                }
              >
                {assigningId === volunteer.id ? 'Assigning…' : 'Assign'}
              </Button>
            </div>
          );
        })}
    </Modal>
  );
};
