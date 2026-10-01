import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { AgeCell } from '../../components/ui/AgeCell';
import { EmptyState } from '../../components/ui/EmptyState';
import { Section } from '../../components/ui/Section';
import { FilterBar, SearchInput } from '../../components/ui/SearchInput';
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
import { AssignVolunteerDialog } from '../../components/AssignVolunteerDialog';
import { fetchPoliceRequests } from '../../api/client';
import type { PoliceRequest, RequestStatus } from '../../api/types';
import {
  categoryLabel,
  priorityLabel,
  REQUEST_STATUSES,
  shortId,
  statusLabel,
} from '../../lib/format';
import { priorityTone, requestStatusTone, toneText } from '../../lib/tone';
import { controlInteractive, pageStack } from '../../lib/styles';
import { UserCheck } from 'lucide-react';

/** A request police may still hand to a named volunteer (BR-04, ASSIGNABLE_STATUSES). */
const ASSIGNABLE: RequestStatus[] = ['PENDING', 'MATCHING', 'DISPATCHED'];

const canAssign = (req: PoliceRequest): boolean =>
  ASSIGNABLE.includes(req.status) && req.assigned_volunteer === null;

/**
 * An empty dispatch batch on an assignable request means dispatch found nobody in
 * range and the senior is waiting on an alert nobody received. That is a
 * different failure from "waiting", and it gets its own word on the board.
 */
const notifiedCount = (req: PoliceRequest): number => req.dispatch_batch?.length ?? 0;

const PAGE_SIZE = 50;

export const Requests: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | RequestStatus>('All');
  const [priorityFilter, setPriorityFilter] = useState<'All' | 'URGENT' | 'NORMAL'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [assignTarget, setAssignTarget] = useState<PoliceRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean, nextCursor?: string | null) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        // Keyset, not offset: a new request arriving while an officer is
        // reading page two would otherwise shift the rows and duplicate one.
        const result = await fetchPoliceRequests({
          ...(statusFilter === 'All' ? {} : { status: statusFilter }),
          ...(priorityFilter === 'All'
            ? {}
            : { priority: priorityFilter === 'URGENT' ? 'urgent' : 'normal' }),
          limit: String(PAGE_SIZE),
          ...(nextCursor ? { cursor: nextCursor } : {}),
        });
        setRequests((prev) => (reset ? result.requests : [...prev, ...result.requests]));
        setCursor(result.next_cursor);
        setFetchedAt(new Date());
      } catch (err) {
        // Keeps the loaded rows on a failed "load more": the officer still has
        // page one, and clearing it would throw away work they already read.
        setError(err instanceof Error ? err.message : 'Failed to load requests');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [statusFilter, priorityFilter],
  );

  useEffect(() => {
    setCursor(null);
    void load(true);
  }, [load]);

  /**
   * `GET /police/requests` takes no search term, so this narrows the pages
   * already loaded. The field says so, rather than implying a server-wide
   * search that does not exist.
   */
  const filtered = requests.filter((req) => {
    const q = searchQuery.trim().toLowerCase();
    if (q === '') return true;
    return (
      (req.senior.full_name ?? '').toLowerCase().includes(q) ||
      (req.senior.email ?? '').toLowerCase().includes(q) ||
      (req.assigned_volunteer?.full_name ?? '').toLowerCase().includes(q)
    );
  });

  const handleAssigned = (
    request: PoliceRequest,
    volunteer: { id: string; full_name: string | null; phone_number: string | null },
  ) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === request.id
          ? {
              ...r,
              status: 'DISPATCHED',
              assigned_volunteer: {
                id: volunteer.id,
                full_name: volunteer.full_name,
                phone_number: volunteer.phone_number,
              },
            }
          : r,
      ),
    );
    setNotice(
      `${volunteer.full_name ?? 'Volunteer'} was assigned to request ${shortId(request.id)} and has been asked to accept.`,
    );
  };

  const hasFilters = statusFilter !== 'All' || priorityFilter !== 'All' || searchQuery.trim() !== '';

  return (
    <div style={pageStack}>
      {error && (
        <Alert onRetry={() => void load(true)} hint="Any rows already loaded are still shown below.">
          {error}
        </Alert>
      )}

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Card flush>
        {/* The 0.625rem gutter is the dense table cell padding, so the title,
            the filters and the first column of the table share one left edge. */}
        <div style={{ padding: '0.875rem 0.625rem', borderBottom: '1px solid var(--color-rule)' }}>
          <Section
            title="All requests"
            description="Every request ever raised, newest first. Open a row for the detail, the timeline and the assign action."
            unbordered
            actions={
              <span
                className="tnum"
                style={{ fontSize: 'var(--text-meta)', color: 'var(--color-ink-muted)', whiteSpace: 'nowrap' }}
              >
                {filtered.length} of {requests.length} loaded
              </span>
            }
          >
            <FilterBar>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                label="Search loaded rows"
                placeholder="Search loaded rows…"
                width="220px"
              />
              <select
                aria-label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'All' | RequestStatus)}
                style={controlInteractive}
              >
                <option value="All">All statuses</option>
                {REQUEST_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Priority"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as 'All' | 'URGENT' | 'NORMAL')}
                style={controlInteractive}
              >
                <option value="All">All priorities</option>
                <option value="URGENT">Urgent</option>
                <option value="NORMAL">Normal</option>
              </select>
            </FilterBar>
          </Section>
        </div>

        {loading && requests.length === 0 ? (
          <SkeletonTable columns={9} rows={10} />
        ) : (
          <>
            <Table density="dense" stickyHeader>
              <TableCaption>
                Assistance requests, newest first. Each row links to the request detail page.
              </TableCaption>
              <TableHead>
                <TableRow>
                  <TableHeader width="5rem">Waiting</TableHeader>
                  <TableHeader width="4.5rem">Photo</TableHeader>
                  <TableHeader>Senior</TableHeader>
                  <TableHeader>Category</TableHeader>
                  <TableHeader>Priority</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Volunteer</TableHeader>
                  <TableHeader align="right">Ref</TableHeader>
                  <TableHeader align="right" width="6rem">
                    Actions
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((req) => (
                  <TableRow key={req.id} onClick={() => navigate(`/requests/${req.id}`)}>
                    <TableCell>
                      <AgeCell createdAt={req.created_at} status={req.status} now={fetchedAt!.getTime()} />
                    </TableCell>
                    <TableCell>
                      {req.image_url ? (
                        <img
                          src={req.image_url}
                          alt={`Photo attached to request ${shortId(req.id)}`}
                          loading="lazy"
                          style={{
                            width: '44px',
                            height: '44px',
                            objectFit: 'cover',
                            borderRadius: 'var(--radius-control)',
                            background: 'var(--color-sunken)',
                            display: 'block',
                          }}
                        />
                      ) : (
                        <span style={{ ...toneText.neutral }} aria-label="No photo attached">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* The focusable path to the same row. */}
                      <Link
                        to={`/requests/${req.id}`}
                        style={{ fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                      >
                        {req.senior.full_name ?? req.senior.email ?? 'Unknown'}
                      </Link>
                    </TableCell>
                    <TableCell style={toneText.neutral}>{categoryLabel(req.category)}</TableCell>
                    <TableCell>
                      <Badge tone={priorityTone(req.priority)} state={req.priority === 'urgent'}>
                        {priorityLabel(req.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={requestStatusTone(req.status)} state dot>
                        {statusLabel(req.status)}
                      </Badge>
                      {/*
                        An empty dispatch batch while the request is still
                        unassigned means dispatch found nobody in range and the
                        senior is waiting on an alert nobody received. The Assign
                        button in this same row is the fix.
                      */}
                      {notifiedCount(req) === 0 && canAssign(req) && (
                        <div
                          title="Dispatch found no volunteer in range. Nobody was notified — assign one by hand."
                          style={{ marginTop: '0.25rem', fontSize: 'var(--text-meta)', ...toneText.error }}
                        >
                          Nobody notified
                        </div>
                      )}
                    </TableCell>
                    <TableCell style={toneText.neutral}>
                      {req.assigned_volunteer?.full_name ?? <span aria-label="Unassigned">—</span>}
                    </TableCell>
                    <TableCell align="right">
                      <span className="mono" style={toneText.neutral}>
                        {shortId(req.id)}
                      </span>
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      {canAssign(req) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAssignTarget(req)}
                          icon={<UserCheck size={14} />}
                        >
                          Assign
                        </Button>
                      ) : (
                        <span style={{ ...toneText.neutral, fontSize: 'var(--text-body)' }}>—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <EmptyState
                        title={
                          requests.length === 0
                            ? 'No requests match these filters'
                            : 'No loaded row matches the search'
                        }
                        description={
                          requests.length === 0
                            ? 'Nothing has been raised under this status and priority combination.'
                            : `${requests.length} request${
                                requests.length === 1 ? '' : 's'
                              } loaded, none matching the current search. Search only covers loaded rows.`
                        }
                        action={
                          hasFilters ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setStatusFilter('All');
                                setPriorityFilter('All');
                                setSearchQuery('');
                              }}
                            >
                              Clear filters
                            </Button>
                          ) : undefined
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
                  onClick={() => void load(false, cursor)}
                >
                  {loadingMore ? 'Loading…' : `Load more (${requests.length} shown)`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {assignTarget && (
        <AssignVolunteerDialog
          request={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={(volunteer) => handleAssigned(assignTarget, volunteer)}
        />
      )}
    </div>
  );
};
