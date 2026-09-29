import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { fetchPoliceOverview, fetchPoliceRequests } from '../../api/client';
import type { PoliceOverview, PoliceRequest, RequestStatus } from '../../api/types';
import { priorityLabel } from '../../api/types';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  ClipboardCheck,
  Clock,
  MapPin,
  Users,
  type LucideIcon,
} from 'lucide-react';

const OPEN_STATUSES: RequestStatus[] = ['PENDING', 'MATCHING', 'DISPATCHED', 'ACCEPTED', 'IN_PROGRESS'];

const REFRESH_MS = 30_000;
const RECENT_LIMIT = 6;

const statusVariant: Record<RequestStatus, 'success' | 'warning' | 'error' | 'default'> = {
  COMPLETED: 'success',
  CANCELLED: 'error',
  UNASSIGNED: 'error',
  PENDING: 'warning',
  MATCHING: 'warning',
  DISPATCHED: 'warning',
  ACCEPTED: 'default',
  IN_PROGRESS: 'default',
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

/**
 * The console's own day, sent to the API as the "completed today" window.
 *
 * Neon runs in UTC. Without this an officer in IST reading the tile before
 * 05:30 UTC saw yesterday's completions counted as today's, and the number
 * disagreed with the same filter on the Requests page.
 */
function todayWindow(): { from: string; to: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

interface Tile {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  to: string;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<PoliceOverview | null>(null);
  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [overviewResult, requestResult] = await Promise.all([
        fetchPoliceOverview(todayWindow()),
        // The recent table only; the tiles come from the aggregate, so there is
        // no reason to pull 200 rows to count them on the client.
        fetchPoliceRequests({ limit: '100' }),
      ]);
      setOverview(overviewResult);
      setRequests(requestResult.requests);
      setRefreshedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

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

  const tiles = useMemo<Tile[]>(() => {
    if (!overview) return [];
    return [
      {
        label: 'Open requests',
        value: overview.open_requests,
        icon: Clock,
        tone: 'var(--color-text-secondary)',
        to: '/requests',
      },
      {
        label: 'Active operations',
        value: overview.active_operations,
        icon: Activity,
        tone: '#2563eb',
        to: '/monitoring',
      },
      {
        label: 'Nobody assigned',
        value: overview.unassigned_requests,
        icon: Users,
        tone: 'var(--color-status-warning)',
        to: '/requests',
      },
      {
        label: 'Urgent open',
        value: overview.urgent_requests,
        icon: AlertCircle,
        tone: 'var(--color-status-error)',
        to: '/requests',
      },
      {
        label: 'Completed today',
        value: overview.completed_today,
        icon: CheckCircle,
        tone: 'var(--color-status-success)',
        to: '/requests',
      },
      {
        label: 'SOS to review',
        value: overview.emergencies_awaiting_review,
        icon: MapPin,
        tone: 'var(--color-status-error)',
        to: '/emergencies',
      },
      {
        label: 'Verifications pending',
        value: overview.verifications_pending,
        icon: ClipboardCheck,
        tone: 'var(--color-status-warning)',
        to: '/verification',
      },
      {
        label: 'Volunteers free',
        value: overview.volunteers_available,
        icon: Users,
        tone: 'var(--color-status-success)',
        to: '/volunteers',
      },
    ];
  }, [overview]);

  if (loading) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>Loading dashboard…</div>;
  }

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
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }}>Overall Situation</h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: '0.4rem 0 0' }}>
            Live operational picture across all jurisdictions
          </p>
        </div>

        {refreshedAt && (
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
            ● LIVE · updated {refreshedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
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
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            to={tile.to}
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <Card
              style={{
                padding: '1rem 1.25rem',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              <span
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {tile.label}
                <tile.icon size={16} style={{ color: tile.tone, flexShrink: 0 }} />
              </span>
              <span style={{ fontSize: '1.875rem', fontWeight: 700, lineHeight: 1.1 }}>
                {tile.value}
              </span>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Latest open requests</h2>
          <Link
            to="/requests"
            style={{ fontSize: '0.75rem', color: 'var(--color-primary-navy)', fontWeight: 600 }}
          >
            View all requests →
          </Link>
        </div>

        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>ID</TableHeader>
              <TableHeader>Caller</TableHeader>
              <TableHeader>Category</TableHeader>
              <TableHeader>Priority</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Time</TableHeader>
            </TableRow>
          </TableHead>

          <TableBody>
            {latestOpen.map((req) => (
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
                  {req.senior.full_name ?? req.senior.email ?? 'Unknown'}
                </TableCell>

                <TableCell>{req.category.replace(/_/g, ' ')}</TableCell>

                <TableCell>
                  <Badge variant={req.priority === 'urgent' ? 'error' : 'default'}>
                    {priorityLabel(req.priority)}
                  </Badge>
                </TableCell>

                <TableCell>
                  <Badge variant={statusVariant[req.status]}>{req.status}</Badge>
                </TableCell>

                <TableCell style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                  {formatTime(req.created_at)}
                </TableCell>
              </TableRow>
            ))}

            {latestOpen.length === 0 && (
              <TableRow>
                <TableCell>
                  <div
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {openRequests.length === 0
                      ? 'No open requests.'
                      : 'No open requests on this page of results.'}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {unlocated > 0 && (
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          {unlocated} of the {requests.length} most recent requests carry no coordinates, so they are
          not plotted on the{' '}
          <Link to="/map" style={{ color: 'var(--color-primary-navy)' }}>
            map
          </Link>
          .
        </p>
      )}
    </div>
  );
};
