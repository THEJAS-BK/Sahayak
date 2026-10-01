import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { AgeCell } from '../../components/ui/AgeCell';
import { EmptyState } from '../../components/ui/EmptyState';
import { Section } from '../../components/ui/Section';
import { StatTile } from '../../components/ui/StatTile';
import { FilterBar, SearchInput } from '../../components/ui/SearchInput';
import { SkeletonTable, SkeletonTiles } from '../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { fetchPoliceRequests } from '../../api/client';
import type { PoliceRequest, RequestStatus } from '../../api/types';
import {
  categoryLabel,
  dayEnd,
  OPEN_STATUSES,
  priorityLabel,
  shortId,
  statusLabel,
} from '../../lib/format';
import { priorityTone, requestStatusTone, toneSwatch } from '../../lib/tone';
import { controlInteractive, pageStack } from '../../lib/styles';

/**
 * DISPATCHED is grouped with UNASSIGNED here, which is what made the old label
 * "Unassigned" wrong: a DISPATCHED request has a named volunteer who has not
 * answered yet. It is an unanswered offer, not a missing one.
 */
const PENDING_STATUSES: RequestStatus[] = ['PENDING', 'MATCHING'];
const LIVE_STATUSES: RequestStatus[] = ['ACCEPTED', 'IN_PROGRESS'];
const AWAITING_STATUSES: RequestStatus[] = ['DISPATCHED', 'UNASSIGNED'];

const REFRESH_MS = 15_000;

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
      setError(err instanceof Error ? err.message : 'Could not load the open requests');
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

  // The same three buckets as the tiles, in one declaration, so the bar and the
  // numbers above it can never disagree about what a colour means.
  const segments = useMemo(
    () => [
      { key: 'pending', label: 'Waiting for a volunteer', value: pending.length, tone: 'warning' as const },
      { key: 'operational', label: 'A volunteer is on it', value: operational.length, tone: 'neutral' as const },
      { key: 'awaiting', label: 'Offer not answered', value: awaiting.length, tone: 'error' as const },
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
    <div style={pageStack}>
      {/*
        The page title lives in the header now, so this is the board and the
        filters. The 15-second freshness stamp moved to the header, where it
        applies to every page rather than the three that remembered it.
      */}
      {error && (
        <Alert
          onRetry={() => void load()}
          hint="The board below is the last set of rows that loaded. Nothing has been cleared."
        >
          {error}
        </Alert>
      )}

      {loading && requests.length === 0 ? (
        <SkeletonTiles count={4} />
      ) : (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {/*
            The three that need a decision come first and are the only raised
            objects on the page. Total open is context, so it sits beside them at
            the same size rather than as a fourth tile competing for attention.
          */}
          <StatTile
            label="Offer not answered"
            value={awaiting.length}
            tone={awaiting.length > 0 ? 'error' : 'neutral'}
            hint={awaiting.length > 0 ? 'A volunteer was asked and has not replied' : undefined}
          />
          <StatTile
            label="Waiting for a volunteer"
            value={pending.length}
            tone={pending.length > 0 ? 'warning' : 'neutral'}
            hint={pending.length > 0 ? 'Dispatched with nobody in range' : undefined}
          />
          <StatTile
            label="A volunteer is on it"
            value={operational.length}
            tone="success"
            hint={`${openRequests.length} open in total`}
          />
        </div>
      )}

      <Section title="Where the open requests are sitting" unbordered>
        {openRequests.length === 0 ? (
          <div
            style={{
              height: '2.5rem',
              width: '100%',
              background: 'var(--color-sunken)',
              borderRadius: 'var(--radius-pill)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'var(--text-meta)',
              color: 'var(--color-ink-muted)',
            }}
          >
            No open requests
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              height: '0.5rem',
              display: 'flex',
              borderRadius: 'var(--radius-pill)',
              overflow: 'hidden',
              background: 'var(--color-sunken)',
            }}
          >
            {segments.map((segment) => (
              <div
                key={segment.key}
                style={{
                  width: `${(segment.value / total) * 100}%`,
                  background: toneSwatch[segment.tone],
                }}
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
            marginTop: '0.75rem',
            fontSize: 'var(--text-meta)',
            color: 'var(--color-ink-muted)',
          }}
        >
          {segments.map((segment) => (
            <span key={segment.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                aria-hidden="true"
                style={{
                  width: '0.5rem',
                  height: '0.5rem',
                  borderRadius: '50%',
                  background: toneSwatch[segment.tone],
                }}
              />
              {segment.label} <span className="tnum" style={{ fontWeight: 600 }}>{segment.value}</span>
            </span>
          ))}
        </div>
      </Section>

      <Card flush>
        {/* The 0.625rem gutter is the dense table cell padding, so the title,
            the filters and the first column of the table share one left edge. */}
        <div style={{ padding: '0.875rem 0.625rem', borderBottom: '1px solid var(--color-rule)' }}>
          <Section
            title="Open requests"
            unbordered
            actions={
              <span className="tnum" style={{ fontSize: 'var(--text-meta)', color: 'var(--color-ink-muted)' }}>
                {filteredRequests.length} shown
              </span>
            }
          >
            <FilterBar>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                label="Search senior or volunteer"
                placeholder="Search senior/volunteer…"
                width="220px"
              />
              <select
                aria-label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'All' | RequestStatus)}
                style={controlInteractive}
              >
                <option value="All">All statuses</option>
                {OPEN_STATUSES.map((status) => (
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
              <select
                aria-label="Category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={controlInteractive}
              >
                <option value="All">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Assignment"
                value={assignedFilter}
                onChange={(e) => setAssignedFilter(e.target.value as 'All' | 'Assigned' | 'Unassigned')}
                style={controlInteractive}
              >
                <option value="All">Any assignment</option>
                <option value="Assigned">Assigned</option>
                <option value="Unassigned">Unassigned</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: 'var(--text-meta)' }}>
                From
                <input
                  type="date"
                  aria-label="Raised from"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  style={controlInteractive}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: 'var(--text-meta)' }}>
                To
                <input
                  type="date"
                  aria-label="Raised up to"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  style={controlInteractive}
                />
              </label>

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              )}
            </FilterBar>
          </Section>
        </div>

        {loading && openRequests.length === 0 ? (
          <SkeletonTable columns={7} rows={8} />
        ) : (
          <Table density="dense" stickyHeader>
            <TableCaption>
              Open assistance requests, the longest waiting first. Select a row to open the request.
            </TableCaption>
            <TableHead>
              <TableRow>
                {/* Age leads. "How long has this person been waiting" is the
                    question this page exists to answer, and it was previously
                    the last column, as a formatted timestamp. */}
                <TableHeader width="5rem">Waiting</TableHeader>
                <TableHeader>Senior</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>Volunteer</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader align="right" width="6rem">Ref</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRequests.map((req) => (
                <TableRow key={req.id} onClick={() => navigate(`/requests/${req.id}`)}>
                  <TableCell>
                    <AgeCell
                      createdAt={req.created_at}
                      status={req.status}
                      now={updatedAt!.getTime()}
                    />
                  </TableCell>
                  <TableCell>
                    {/*
                      The row is clickable for the mouse, but a <tr> with a
                      handler is invisible to a keyboard. This link is the
                      focusable, announced path to the same place.
                    */}
                    <Link
                      to={`/requests/${req.id}`}
                      style={{ fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                    >
                      {req.senior.full_name ?? req.senior.email ?? 'Unknown'}
                    </Link>
                  </TableCell>
                  <TableCell style={{ color: 'var(--color-ink-muted)' }}>{categoryLabel(req.category)}</TableCell>
                  <TableCell style={{ color: 'var(--color-ink-muted)' }}>
                    {req.assigned_volunteer?.full_name ?? <span aria-label="No volunteer assigned">Nobody</span>}
                  </TableCell>
                  <TableCell>
                    <Badge tone={requestStatusTone(req.status)} state dot>
                      {statusLabel(req.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge tone={priorityTone(req.priority)} state={req.priority === 'urgent'}>
                      {priorityLabel(req.priority)}
                    </Badge>
                  </TableCell>
                  <TableCell align="right">
                    <span className="mono" style={{ color: 'var(--color-ink-muted)' }}>
                      {shortId(req.id)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}

              {filteredRequests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      icon={<ListGlyph />}
                      title={
                        openRequests.length === 0
                          ? 'No open requests'
                          : 'No open request matches these filters'
                      }
                      description={
                        openRequests.length === 0
                          ? 'Nothing is waiting on a volunteer right now.'
                          : `${openRequests.length} open request${
                              openRequests.length === 1 ? '' : 's'
                            } on the board, none matching the current filters.`
                      }
                      action={
                        hasFilters ? (
                          <Button variant="outline" size="sm" onClick={resetFilters}>
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
        )}
      </Card>
    </div>
  );
};

const ListGlyph: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
  </svg>
);
