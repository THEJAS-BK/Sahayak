import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { fetchEmergencyEvents, reviewEmergencyEvent } from '../../api/client';
import type { EmergencyEvent, EmergencyStatus } from '../../api/types';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const triggerLabel: Record<string, string> = {
  semantic_llm: 'Detected distress',
  acoustic_distress: 'Acoustic distress',
  keyword_repetition: 'Keyword repetition',
};

const PAGE_SIZE = 25;

export const Emergencies: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<EmergencyStatus | 'ALL'>('LOGGED');
  const [events, setEvents] = useState<EmergencyEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      setError(null);
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const result = await fetchEmergencyEvents({
          ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
          limit: PAGE_SIZE,
          ...(reset || !cursor ? {} : { cursor: cursor ?? undefined }),
        });
        // Keyset pagination, not offset: a new SOS arriving mid-scroll would
        // otherwise shift every row and duplicate the one being read.
        setEvents((prev) => (reset ? result.events : [...prev, ...result.events]));
        setCursor(result.next_cursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load emergencies');
        if (reset) setEvents([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [statusFilter, cursor],
  );

  useEffect(() => {
    setCursor(null);
    void load(true);
    // Reloading on cursor too would re-fetch after every page and fight the
    // "load more" button; the cursor is read from inside load instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const markReviewed = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await reviewEmergencyEvent(id);
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'REVIEWED' as EmergencyStatus } : e)),
      );
      // Drop the row from a LOGGED-only view so the queue reflects the action.
      if (statusFilter === 'LOGGED') {
        setEvents((prev) => prev.filter((e) => e.id !== id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark reviewed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Emergency Events</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          SOS events raised by seniors, newest first. Marking one reviewed records that an officer
          has seen it.
        </p>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.375rem', backgroundColor: 'rgba(220,38,38,0.08)', color: 'var(--color-status-error)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <Card>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem' }}>
          {(['LOGGED', 'REVIEWED', 'ALL'] as const).map((value) => (
            <Button
              key={value}
              variant={statusFilter === value ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(value)}
            >
              {value === 'ALL' ? 'All' : value === 'LOGGED' ? 'Needs review' : 'Reviewed'}
            </Button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Loading emergencies…
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Raised</TableHeader>
                  <TableHeader>Senior</TableHeader>
                  <TableHeader>Trigger</TableHeader>
                  <TableHeader>Contact</TableHeader>
                  <TableHeader>Linked request</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Action</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell style={{ whiteSpace: 'nowrap' }}>{formatDate(event.created_at)}</TableCell>
                    <TableCell>
                      <span style={{ fontWeight: 500 }}>{event.senior.full_name ?? '—'}</span>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                        {event.senior.email}
                      </div>
                    </TableCell>
                    <TableCell>{triggerLabel[event.trigger_type] ?? event.trigger_type}</TableCell>
                    <TableCell>
                      {event.senior.phone_number ?? (
                        <span style={{ color: 'var(--color-text-secondary)' }}>Not provided</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {event.help_request_id ? (
                        <Link to={`/requests/${event.help_request_id}`} style={{ color: 'var(--color-primary-navy)' }}>
                          View request
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={event.status === 'LOGGED' ? 'error' : 'success'}>
                        {event.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {event.status === 'LOGGED' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === event.id}
                          onClick={() => markReviewed(event.id)}
                        >
                          Mark reviewed
                        </Button>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell>
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                        No emergency events{statusFilter === 'LOGGED' ? ' awaiting review' : ''}.
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {cursor && (
              <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
                <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => void load(false)}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};
