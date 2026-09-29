import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { fetchPoliceRequests } from '../../api/client';
import type { PoliceRequest, RequestStatus } from '../../api/types';
import { Activity, RefreshCw } from 'lucide-react';

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

/**
 * DISPATCHED is grouped with UNASSIGNED here, which is what made the old label
 * "Unassigned" wrong: a DISPATCHED request has a named volunteer who has not
 * answered yet. It is an unanswered offer, not a missing one.
 */
const PENDING_STATUSES: RequestStatus[] = ['PENDING', 'MATCHING'];
const LIVE_STATUSES: RequestStatus[] = ['ACCEPTED', 'IN_PROGRESS'];
const AWAITING_STATUSES: RequestStatus[] = ['DISPATCHED', 'UNASSIGNED'];

const OPEN_STATUSES: RequestStatus[] = [...PENDING_STATUSES, ...LIVE_STATUSES, ...AWAITING_STATUSES];

const REFRESH_MS = 15_000;

const selectStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-white)',
  fontFamily: 'inherit',
  fontSize: '0.8125rem',
  color: 'var(--color-text-primary)',
  outline: 'none',
};

/**
 * `<input type="datetime-local">` hands back `YYYY-MM-DDTHH:mm`, which
 * `new Date()` reads as *local midnight* on the day, not the end of it. A
 * `to` of `2026-09-27T14:00` therefore excluded everything raised after 14:00
 * on the day the officer thought they were including.
 */
function dayEnd(value: string): Date | null {
  if (value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const Monitoring: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const [statusFilter, setStatusFilter] = useState<'All' | RequestStatus>('All');
  const [priorityFilter, setPriorityFilter] = useState<'All' | 'URGENT' | 'NORMAL'>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [assignedFilter, setAssignedFilter] = useState<'All' | 'Assigned' | 'Unassigned'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Held in a ref so the polling effect does not restart every time a fetch
  // changes the row count. The old version listed `requests.length` as a
  // dependency, so each response tore down the interval and immediately issued
  // another request — a poll that doubled itself on every tick.
  const filtersRef = useRef({ statusFilter, priorityFilter, fromDate, toDate });

  // Synced in an effect, not during render: writing `ref.current` while
  // rendering is exactly the kind of thing that makes a component skip an
  // update. Declared before the polling effect, so it is current by the time
  // that effect asks for filters.
  useEffect(() => {
    filtersRef.current = { statusFilter, priorityFilter, fromDate, toDate };
  }, [statusFilter, priorityFilter, fromDate, toDate]);

  const load = useCallback(async () => {
    const { statusFilter: status, priorityFilter: priority, fromDate: from, toDate: toRaw } =
      filtersRef.current;
    const to = dayEnd(toRaw);
    try {
      const result = await fetchPoliceRequests({
        // P-01 does the filtering; doing it here instead meant paging through a
        // capped 200-row window and reporting a total that stopped there.
        ...(status !== 'All' ? { status } : {}),
        ...(priority !== 'All' ? { priority: priority === 'URGENT' ? 'urgent' : 'normal' } : {}),
        ...(from ? { from: new Date(from).toISOString() } : {}),
        ...(to ? { to: to.toISOString() } : {}),
        limit: '200',
      });
      setRequests(result.requests);
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      // A failed refresh must not wipe a board that was reading fine a second
      // ago; surface the error and keep the last good data on screen.
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, statusFilter, priorityFilter, fromDate, toDate]);

  const pending = useMemo(() => requests.filter((r) => PENDING_STATUSES.includes(r.status)), [requests]);
  const operational = useMemo(() => requests.filter((r) => LIVE_STATUSES.includes(r.status)), [requests]);
  const awaiting = useMemo(() => requests.filter((r) => AWAITING_STATUSES.includes(r.status)), [requests]);

  const openRequests = useMemo(() => requests.filter((r) => OPEN_STATUSES.includes(r.status)), [requests]);

  const categories = useMemo(
    () => Array.from(new Set(openRequests.map((r) => r.category))).sort(),
    [openRequests],
  );

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const to = dayEnd(toDate);
    return openRequests.filter((req) => {
      if (statusFilter !== 'All' && req.status !== statusFilter) return false;
      if (categoryFilter !== 'All' && req.category !== categoryFilter) return false;

      if (assignedFilter !== 'All') {
        const isAssigned = req.assigned_volunteer !== null;
        if (assignedFilter === 'Assigned' && !isAssigned) return false;
        if (assignedFilter === 'Unassigned' && isAssigned) return false;
      }

      if (q !== '') {
        const seniorName = (req.senior.full_name ?? req.senior.email ?? '').toLowerCase();
        const volunteerName = (req.assigned_volunteer?.full_name ?? '').toLowerCase();
        if (!seniorName.includes(q) && !volunteerName.includes(q)) return false;
      }

      // The window was already applied server-side; re-checking it here is only
      // needed for the `to` end-of-day rounding the API cannot infer.
      if (to && new Date(req.created_at) > to) return false;

      return true;
    });
  }, [openRequests, statusFilter, categoryFilter, assignedFilter, searchQuery, toDate]);

  const segments = useMemo(
    () => [
      { key: 'pending', label: 'Waiting for a volunteer', value: pending.length, className: 'bg-amber-400' },
      { key: 'operational', label: 'A volunteer is on it', value: operational.length, className: 'bg-blue-500' },
      { key: 'awaiting', label: 'Offer not answered', value: awaiting.length, className: 'bg-[var(--color-status-error)]' },
    ],
    [pending.length, operational.length, awaiting.length],
  );

  const total = openRequests.length || 1;
  const hasFilters =
    statusFilter !== 'All' ||
    priorityFilter !== 'All' ||
    categoryFilter !== 'All' ||
    assignedFilter !== 'All' ||
    fromDate !== '' ||
    toDate !== '' ||
    searchQuery.trim() !== '';

  const resetFilters = () => {
    setStatusFilter('All');
    setPriorityFilter('All');
    setCategoryFilter('All');
    setAssignedFilter('All');
    setFromDate('');
    setToDate('');
    setSearchQuery('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.875rem',
              fontWeight: 700,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
            }}
          >
            <Activity size={26} style={{ color: '#2563eb' }} />
            Live Monitoring
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: '0.4rem 0 0' }}>
            Operational overview of open assistance requests, refreshed every 15 seconds.
          </p>
        </div>

        {updatedAt && (
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '0.4rem 0.75rem',
              borderRadius: '999px',
              background: 'var(--color-status-success-bg)',
              color: '#047857',
              whiteSpace: 'nowrap',
            }}
          >
            ● LIVE · {updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
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
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            justifyContent: 'space-between',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid currentColor',
              background: 'none',
              color: 'inherit',
              fontFamily: 'inherit',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '1rem',
        }}
      >
        {[
          { label: 'Current open', value: openRequests.length },
          { label: 'Waiting for a volunteer', value: pending.length },
          { label: 'A volunteer is on it', value: operational.length },
          { label: 'Offer not answered', value: awaiting.length },
        ].map((tile) => (
          <Card
            key={tile.label}
            style={{
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {tile.label}
            </span>
            <span style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem' }}>{tile.value}</span>
          </Card>
        ))}
      </div>

      <Card style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9375rem', fontWeight: 600 }}>
          Where the open requests are sitting
        </h3>

        {openRequests.length === 0 ? (
          <div
            style={{
              height: '2.5rem',
              width: '100%',
              background: 'var(--color-surface-workspace)',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            No open requests
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              height: '2.5rem',
              display: 'flex',
              borderRadius: '999px',
              overflow: 'hidden',
              background: 'var(--color-surface-workspace)',
            }}
          >
            {segments.map((segment) => (
              <div
                key={segment.key}
                className={segment.className}
                style={{ width: `${(segment.value / total) * 100}%` }}
                title={`${segment.label}: ${segment.value}`}
              />
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            marginTop: '1rem',
            fontSize: '0.75rem',
            color: 'var(--color-text-secondary)',
            fontWeight: 600,
          }}
        >
          {segments.map((segment) => (
            <span key={segment.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`h-2.5 w-2.5 rounded-full ${segment.className}`} />
              {segment.label} ({segment.value})
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            background: 'var(--color-surface-workspace)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>Open requests</h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              aria-label="Search by senior or volunteer"
              placeholder="Search senior/volunteer…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...selectStyle, minWidth: '190px' }}
            />
            <select
              aria-label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | RequestStatus)}
              style={selectStyle}
            >
              <option value="All">All statuses</option>
              {OPEN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select
              aria-label="Priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'All' | 'URGENT' | 'NORMAL')}
              style={selectStyle}
            >
              <option value="All">All priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="NORMAL">Normal</option>
            </select>
            <select
              aria-label="Category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="All">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabels[category] ?? category.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <select
              aria-label="Assignment"
              value={assignedFilter}
              onChange={(e) => setAssignedFilter(e.target.value as 'All' | 'Assigned' | 'Unassigned')}
              style={selectStyle}
            >
              <option value="All">Any assignment</option>
              <option value="Assigned">Assigned</option>
              <option value="Unassigned">Unassigned</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={selectStyle}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={selectStyle}
              />
            </label>

            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  ...selectStyle,
                  cursor: 'pointer',
                  fontWeight: 600,
                  textDecoration: 'underline',
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading && openRequests.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Loading operations…
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>ID</TableHeader>
                <TableHeader>Senior</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>Volunteer</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader>Age</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRequests.map((req) => (
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
                    <span style={{ fontWeight: 600 }}>
                      {req.senior.full_name ?? req.senior.email ?? 'Unknown'}
                    </span>
                  </TableCell>
                  <TableCell style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    {categoryLabels[req.category] ?? req.category.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell style={{ color: 'var(--color-text-secondary)' }}>
                    {req.assigned_volunteer?.full_name ?? (
                      <span style={{ color: 'var(--color-status-warning)' }}>Nobody</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[req.status]}>{req.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={req.priority === 'urgent' ? 'error' : 'default'}>
                      {req.priority.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {new Date(req.created_at).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                </TableRow>
              ))}

              {filteredRequests.length === 0 && (
                <TableRow>
                  <TableCell>
                    <div
                      style={{
                        padding: '2.5rem',
                        textAlign: 'center',
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.875rem',
                      }}
                    >
                      {openRequests.length === 0
                        ? 'No open requests in this window.'
                        : 'No open request matches these filters.'}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};
