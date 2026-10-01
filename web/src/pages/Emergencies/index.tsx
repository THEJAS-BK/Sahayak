import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterChip } from '../../components/ui/FilterChip';
import { Section } from '../../components/ui/Section';
import { SkeletonTable } from '../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { fetchEmergencyEvents, reviewEmergencyEvent } from '../../api/client';
import type { EmergencyEvent, EmergencyStatus } from '../../api/types';
import { elapsedLabel, formatDateTime, shortId, triggerLabel } from '../../lib/format';
import { emergencyStatusTone, toneText } from '../../lib/tone';
import { pageStack } from '../../lib/styles';

const PAGE_SIZE = 25;

type StatusView = EmergencyStatus | 'ALL';

const VIEWS: Array<{ value: StatusView; label: string }> = [
  { value: 'LOGGED', label: 'Needs review' },
  { value: 'REVIEWED', label: 'Reviewed' },
  { value: 'ALL', label: 'All' },
];

export const Emergencies: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<StatusView>('LOGGED');
  const [events, setEvents] = useState<EmergencyEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Held in a ref so switching filter re-fetches once, rather than once per
  // render of a callback that closes over the cursor.
  const cursorRef = useRef<string | null>(null);

  const load = useCallback(async (reset: boolean) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchEmergencyEvents({
        ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
        limit: PAGE_SIZE,
        ...(reset || !cursorRef.current ? {} : { cursor: cursorRef.current }),
      });
      // Keyset pagination, not offset: a new SOS arriving mid-scroll would
      // otherwise shift every row and duplicate the one being read.
      setEvents((prev) => (reset ? result.events : [...prev, ...result.events]));
      cursorRef.current = result.next_cursor;
      setCursor(result.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emergency events');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    cursorRef.current = null;
    setCursor(null);
    void load(true);
  }, [load]);

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
      setError(err instanceof Error ? err.message : 'Failed to mark the event reviewed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={pageStack}>
      {error && (
        <Alert onRetry={() => void load(events.length === 0)}>
          {error}
        </Alert>
      )}

      <Card flush>
        {/* The 0.625rem gutter is the dense table cell padding, so the title,
            the filters and the first column of the table share one left edge. */}
        <div style={{ padding: '0.875rem 0.625rem', borderBottom: '1px solid var(--color-rule)' }}>
          <Section
            title="SOS events"
            description="Emergency events raised by the monitoring agent, newest first. Marking one reviewed records that an officer has seen it."
            unbordered
            actions={
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {VIEWS.map((view) => (
                  <FilterChip
                    key={view.value}
                    group="Review state"
                    label={view.label}
                    active={statusFilter === view.value}
                    onClick={() => setStatusFilter(view.value)}
                  />
                ))}
              </div>
            }
          />
        </div>

        {loading && events.length === 0 ? (
          <SkeletonTable columns={8} rows={8} />
        ) : (
          <>
            <Table density="dense" stickyHeader>
              <TableCaption>
                Emergency events logged by the agent. The action column records a review.
              </TableCaption>
              <TableHead>
                <TableRow>
                  <TableHeader width="5rem">Age</TableHeader>
                  <TableHeader>Raised</TableHeader>
                  <TableHeader>Senior</TableHeader>
                  <TableHeader>Trigger</TableHeader>
                  <TableHeader>Contact</TableHeader>
                  <TableHeader>Linked request</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader align="right" width="9rem">
                    Action
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      {/*
                        An unread SOS has no volunteer waiting on it, so age is
                        shown against the wall clock rather than tinted — there
                        is no status here that resolves on its own.
                      */}
                      <span className="tnum" style={toneText.neutral}>
                        {elapsedLabel(event.created_at) ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell style={{ ...toneText.neutral, whiteSpace: 'nowrap' }}>
                      {formatDateTime(event.created_at)}
                    </TableCell>
                    <TableCell>
                      <span style={{ fontWeight: 600 }}>{event.senior.full_name ?? 'Name not provided'}</span>
                      <div style={{ ...toneText.neutral, fontSize: 'var(--text-label)' }}>
                        {event.senior.email}
                      </div>
                    </TableCell>
                    <TableCell>{triggerLabel(event.trigger_type)}</TableCell>
                    <TableCell>
                      {/* A missing phone number on an SOS is the thing an officer
                          needs to see, so it says so rather than showing a dash. */}
                      {event.senior.phone_number ??
                        <span style={toneText.error}>Not provided</span>}
                    </TableCell>
                    <TableCell>
                      {event.help_request_id ? (
                        <Link
                          to={`/requests/${event.help_request_id}`}
                          style={{ color: 'var(--color-navy)', fontWeight: 600 }}
                        >
                          <span className="mono">{shortId(event.help_request_id)}</span>
                        </Link>
                      ) : (
                        <span style={toneText.neutral}>Not linked</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={emergencyStatusTone(event.status)} state dot>
                        {event.status === 'LOGGED' ? 'Needs review' : 'Reviewed'}
                      </Badge>
                    </TableCell>
                    <TableCell align="right">
                      {event.status === 'LOGGED' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === event.id}
                          onClick={() => void markReviewed(event.id)}
                        >
                          {busyId === event.id ? 'Saving…' : 'Mark reviewed'}
                        </Button>
                      ) : (
                        <span style={toneText.neutral}>—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState
                        title={
                          statusFilter === 'LOGGED'
                            ? 'No emergency event is waiting for review'
                            : 'No emergency event here'
                        }
                        description={
                          statusFilter === 'LOGGED'
                            ? 'The agent has not raised an unreviewed SOS. Events that have been reviewed are under the Reviewed view.'
                            : `Nothing matches the ${statusFilter === 'ALL' ? 'full' : statusFilter.toLowerCase()} history.`
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {cursor && (
              <div
                style={{
                  padding: '0.875rem',
                  display: 'flex',
                  justifyContent: 'center',
                  borderTop: '1px solid var(--color-rule)',
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void load(false)}
                >
                  {loadingMore ? 'Loading…' : `Load more (${events.length} shown)`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};
