import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { AgeCell } from '../../components/ui/AgeCell';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { Section } from '../../components/ui/Section';
import { StatStrip, StatTile } from '../../components/ui/StatTile';
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
import type { PoliceRequest } from '../../api/types';
import { useOverview } from '../../lib/useOverview';
import {
  categoryLabel,
  OPEN_STATUSES,
  priorityLabel,
  shortId,
  statusLabel,
} from '../../lib/format';
import { priorityTone, requestStatusTone, toneText, type Tone } from '../../lib/tone';
import { pageStack } from '../../lib/styles';

const RECENT_LIMIT = 6;
const RECENT_FETCH = '100';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  // The header already polls this endpoint; the Dashboard used to run a second
  // interval against the same URL, so two counts could be on screen at once and
  // disagree for the length of a refresh.
  const { overview, generatedAt, loading: overviewLoading, error: overviewError, reload } =
    useOverview();

  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      // The recent table only; the counts come from the aggregate, so there is
      // no reason to pull 200 rows to total them on the client.
      const result = await fetchPoliceRequests({ limit: RECENT_FETCH });
      setRequests(result.requests);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load recent requests');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const openRequests = useMemo(
    () => requests.filter((r) => OPEN_STATUSES.includes(r.status)),
    [requests],
  );

  const latestOpen = useMemo(
    () =>
      [...openRequests]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, RECENT_LIMIT),
    [openRequests],
  );

  const unlocated = useMemo(
    () => requests.filter((r) => r.latitude == null || r.longitude == null).length,
    [requests],
  );

  /**
   * Four raised tiles, and only the things that need a person to decide.
   *
   * The previous eight-tile grid gave "volunteers free" the same weight as "SOS
   * to review", so a station with nothing to do and a station with two people
   * waiting for emergency review produced the same visual page. The four quiet
   * figures dropped to `StatStrip` are context, not calls to action.
   */
  const decisions = useMemo<Array<{ label: string; value: number; hint: string; to: string; tone: Tone }>>(
    () =>
      overview
        ? [
            {
              label: 'SOS to review',
              value: overview.emergencies_awaiting_review,
              hint: 'Emergency events logged by the agent, not yet reviewed',
              to: '/emergencies',
              tone: overview.emergencies_awaiting_review > 0 ? 'error' : 'neutral',
            },
            {
              label: 'Registrations to review',
              value: overview.verifications_pending,
              hint: 'Seniors and volunteers waiting on approval',
              to: '/verification',
              tone: overview.verifications_pending > 0 ? 'warning' : 'neutral',
            },
            {
              label: 'Urgent requests open',
              value: overview.urgent_requests,
              hint: 'Flagged urgent and not yet finished',
              to: '/monitoring',
              tone: overview.urgent_requests > 0 ? 'error' : 'neutral',
            },
            {
              label: 'Nobody assigned',
              value: overview.unassigned_requests,
              hint: 'Open with no volunteer and no answer to a dispatch',
              to: '/requests',
              tone: overview.unassigned_requests > 0 ? 'warning' : 'neutral',
            },
          ]
        : [],
    [overview],
  );

  const context = useMemo(
    () =>
      overview
        ? [
            { label: 'open requests', value: overview.open_requests },
            { label: 'operations running', value: overview.active_operations },
            { label: 'completed today', value: overview.completed_today },
            { label: 'volunteers free', value: overview.volunteers_available },
          ]
        : [],
    [overview],
  );

  const loading = overviewLoading || listLoading;
  const error = overviewError ?? listError;

  return (
    <div style={pageStack}>
      {error && (
        <Alert onRetry={() => { void reload(); void loadRequests(); }}>
          {error}
          {overviewError && listError && ' The rest of the board is showing its last good values.'}
        </Alert>
      )}

      {loading && !overview ? (
        <SkeletonTiles count={4} />
      ) : (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {decisions.map((item) => (
            <StatTile
              key={item.label}
              label={item.label}
              value={item.value}
              hint={item.hint}
              tone={item.tone}
              to={item.to}
            />
          ))}
        </div>
      )}

      {context.length > 0 && <StatStrip items={context} />}

      <Section
        title="Latest open requests"
        description="The six most recently raised requests that are not finished."
        actions={
          <Link to="/requests" style={{ fontSize: 'var(--text-meta)', fontWeight: 600 }}>
            All requests →
          </Link>
        }
      >
        <Card flush>
          {listLoading && requests.length === 0 ? (
            <SkeletonTable columns={6} rows={RECENT_LIMIT} />
          ) : (
            <Table density="dense">
              <TableCaption>
                The six most recently raised open assistance requests. Each row links to its detail
                page.
              </TableCaption>
              <TableHead>
                <TableRow>
                  <TableHeader width="5rem">Waiting</TableHeader>
                  <TableHeader>Caller</TableHeader>
                  <TableHeader>Category</TableHeader>
                  <TableHeader>Priority</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader align="right">Ref</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {latestOpen.map((req) => (
                  <TableRow key={req.id} onClick={() => navigate(`/requests/${req.id}`)}>
                    <TableCell>
                      <AgeCell createdAt={req.created_at} status={req.status} now={generatedAt!.getTime()} />
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
                    </TableCell>
                    <TableCell align="right">
                      <span className="mono" style={toneText.neutral}>
                        {shortId(req.id)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}

                {latestOpen.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState
                        title={openRequests.length === 0 ? 'No open requests' : 'No open request on this page'}
                        description={
                          openRequests.length === 0
                            ? 'Nothing is waiting on a volunteer right now.'
                            : `${openRequests.length} open request${
                                openRequests.length === 1 ? '' : 's'
                              } exist, but none are in the ${RECENT_FETCH} most recent. Open All requests to reach them.`
                        }
                        action={
                          <Link
                            to="/monitoring"
                            style={{ fontWeight: 600, color: 'var(--color-navy)' }}
                          >
                            Open the monitoring board →
                          </Link>
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      </Section>

      {unlocated > 0 && (
        <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--color-ink-muted)' }}>
          {unlocated} of the {requests.length} most recent requests carry no coordinates, so they are
          not plotted on the <Link to="/map">map</Link>.
        </p>
      )}
    </div>
  );
};
