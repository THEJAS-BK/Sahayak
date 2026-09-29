import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { AssignVolunteerDialog } from '../../components/AssignVolunteerDialog';
import { fetchPoliceRequests } from '../../api/client';
import { priorityLabel, type PoliceRequest, type RequestStatus } from '../../api/types';
import { Search, UserCheck } from 'lucide-react';

const statusBadgeVariant: Record<RequestStatus, 'success' | 'warning' | 'error' | 'default'> = {
  COMPLETED: 'success',
  ACCEPTED: 'default',
  IN_PROGRESS: 'default',
  PENDING: 'warning',
  MATCHING: 'warning',
  DISPATCHED: 'warning',
  CANCELLED: 'error',
  UNASSIGNED: 'error',
};

const categoryLabels: Record<string, string> = {
  grocery_assistance: 'Grocery Assistance',
  medical_assistance: 'Medical Assistance',
  transport_assistance: 'Transport Assistance',
};

/** A request police may still hand to a named volunteer (BR-04, ASSIGNABLE_STATUSES). */
const ASSIGNABLE: RequestStatus[] = ['PENDING', 'MATCHING', 'DISPATCHED'];

const canAssign = (req: PoliceRequest): boolean =>
  ASSIGNABLE.includes(req.status) && req.assigned_volunteer === null;

const notifiedCount = (req: PoliceRequest): number => req.dispatch_batch?.length ?? 0;

const PAGE_SIZE = 50;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--color-border)',
  fontFamily: 'inherit',
  fontSize: '0.875rem',
  background: 'var(--color-surface-white)',
  color: 'var(--color-text-primary)',
  outline: 'none',
};

export const Requests: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load requests');
        if (reset) setRequests([]);
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

  const statuses: ('All' | RequestStatus)[] = [
    'All',
    'PENDING',
    'MATCHING',
    'DISPATCHED',
    'ACCEPTED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'UNASSIGNED',
  ];
  const priorities: ('All' | 'URGENT' | 'NORMAL')[] = ['All', 'URGENT', 'NORMAL'];

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
      `${volunteer.full_name ?? 'Volunteer'} was assigned to request ${request.id.slice(0, 8)} and has been asked to accept.`,
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Requests</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Help requests from seniors, newest first. Open a row to see the detail, the timeline and
          the assign action.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            backgroundColor: 'var(--color-status-error-bg)',
            color: 'var(--color-status-error)',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            backgroundColor: 'var(--color-status-success-bg)',
            color: 'var(--color-text-primary)',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '1rem',
              lineHeight: 1,
              color: 'inherit',
            }}
          >
            ×
          </button>
        </div>
      )}

      <Card>
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              aria-label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | RequestStatus)}
              style={selectStyle}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s === 'All' ? 'All statuses' : s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select
              aria-label="Priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'All' | 'URGENT' | 'NORMAL')}
              style={selectStyle}
            >
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p === 'All' ? 'All priorities' : p === 'URGENT' ? 'Urgent' : 'Normal'}
                </option>
              ))}
            </select>
          </div>

          <div style={{ position: 'relative', width: '260px', maxWidth: '100%' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-secondary)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              aria-label="Search loaded rows"
              placeholder="Search loaded rows…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.5rem 0.5rem 2.25rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--color-border)',
                outline: 'none',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
                background: 'var(--color-surface-white)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Loading requests…
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>ID</TableHeader>
                  <TableHeader>Senior</TableHeader>
                  <TableHeader>Category</TableHeader>
                  <TableHeader>Priority</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Volunteer</TableHeader>
                  <TableHeader>Created</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((req) => (
                  <TableRow
                    key={req.id}
                    onClick={() => navigate(`/requests/${req.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                        {req.id.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontWeight: 500 }}>
                        {req.senior.full_name ?? req.senior.email ?? 'Unknown'}
                      </span>
                    </TableCell>
                    <TableCell>{categoryLabels[req.category] ?? req.category.replace(/_/g, ' ')}</TableCell>
                    <TableCell>
                      <Badge variant={req.priority === 'urgent' ? 'error' : 'default'}>
                        {priorityLabel(req.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant[req.status]}>{req.status}</Badge>
                      {/*
                        An empty dispatch batch while the request is still
                        unassigned means dispatch found nobody in range and the
                        senior is waiting on an alert nobody received. The Assign
                        button in this same row is the fix.
                      */}
                      {notifiedCount(req) === 0 && canAssign(req) && (
                        <div
                          title="Dispatch found no volunteer in range. Nobody was notified — assign one by hand."
                          style={{
                            marginTop: '0.25rem',
                            fontSize: '0.75rem',
                            color: 'var(--color-status-error)',
                          }}
                        >
                          Nobody notified
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {req.assigned_volunteer?.full_name ?? (
                        <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                      )}
                    </TableCell>
                    <TableCell
                      style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}
                    >
                      {formatDate(req.created_at)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {canAssign(req) ? (
                        <Button size="sm" variant="outline" onClick={() => setAssignTarget(req)}>
                          <UserCheck size={14} style={{ marginRight: '0.375rem' }} />
                          Assign
                        </Button>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                          —
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell>
                      <div
                        style={{
                          padding: '2rem',
                          textAlign: 'center',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        {requests.length === 0
                          ? 'No requests match these filters.'
                          : 'No loaded row matches the search.'}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {cursor && (
              <div
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  borderTop: '1px solid var(--color-border)',
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
