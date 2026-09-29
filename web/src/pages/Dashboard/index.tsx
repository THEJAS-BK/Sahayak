import React, { useEffect, useMemo, useState } from 'react';
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
import { fetchPoliceRequests } from '../../api/client';
import type { PoliceRequest } from '../../api/types';
import { priorityLabel } from '../../api/types';
import { Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';

const OPEN_STATUSES = ['PENDING', 'MATCHING', 'DISPATCHED', 'ACCEPTED', 'IN_PROGRESS'];
const ACTIVE_STATUSES = ['DISPATCHED', 'ACCEPTED', 'IN_PROGRESS'];

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();

  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

export const Dashboard: React.FC = () => {
  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPoliceRequests({ limit: '200' })
  .then((reqResult) => {
    setRequests(reqResult.requests);
  })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Failed to load dashboard data',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const openRequests = requests.filter((r) =>
      OPEN_STATUSES.includes(r.status),
    ).length;

    const activeOperations = requests.filter((r) =>
      ACTIVE_STATUSES.includes(r.status),
    ).length;

    const urgentRequests = requests.filter(
      (r) => r.priority === 'urgent',
    ).length;

    const completedToday = requests.filter(
      (r) =>
        r.status === 'COMPLETED' &&
        r.completed_at &&
        isToday(r.completed_at),
    ).length;

    return {
      openRequests,
      activeOperations,
      completedToday,
      urgentRequests,
    };
  }, [requests]);

  const latestRequests = useMemo(() => {
    const open = requests.filter((r) => OPEN_STATUSES.includes(r.status));

    return [...open]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime(),
      )
      .slice(0, 5);
  }, [requests]);

  if (loading) {
    return (
      <div style={{ color: 'var(--color-text-secondary)' }}>
        Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: 'var(--color-status-error)' }}>
        {error}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      {/* Header */}
      <div>
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 700,
            margin: 0,
          }}
        >
          Overall Situation
        </h1>

        <p
          style={{
            color: 'var(--color-text-secondary)',
            margin: '0.4rem 0 0',
          }}
        >
          Live operational picture across all jurisdictions
        </p>
      </div>

      {/* Live Status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '-3rem',
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '0.4rem 0.75rem',
            borderRadius: '999px',
            background: '#ecfdf5',
            color: '#047857',
          }}
        >
          ● LIVE • UPDATED 10:48 AM
        </span>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
        }}
      >
        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Open Requests
            </span>
            <Clock size={18} />
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {stats.openRequests}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Active Operations
            </span>
            <Activity size={18} />
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {stats.activeOperations}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Completed Today
            </span>
            <CheckCircle size={18} />
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {stats.completedToday}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Urgent Requests
            </span>
            <AlertCircle size={18} />
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 700 }}>
            {stats.urgentRequests}
          </div>
        </Card>
      </div>

      {/* Latest Requests */}
      <Card>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '1rem',
              fontWeight: 600,
            }}
          >
            Latest Open Requests
          </h2>

          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-primary-navy)',
              fontWeight: 600,
            }}
          >
            View all requests →
          </span>
        </div>

        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>ID</TableHeader>
              <TableHeader>Caller</TableHeader>
              <TableHeader>Priority</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Time</TableHeader>
            </TableRow>
          </TableHead>

          <TableBody>
            {latestRequests.map((req) => (
              <TableRow key={req.id}>
                <TableCell>
                  <span style={{ fontWeight: 500 }}>{req.id}</span>
                </TableCell>

                <TableCell>
                  {req.senior.full_name ?? req.senior.email}
                </TableCell>

                <TableCell>
                  <Badge
                    variant={
                      req.priority === 'urgent' ? 'error' : 'success'
                    }
                  >
                    {priorityLabel(req.priority)}
                  </Badge>
                </TableCell>

                <TableCell>
                  <Badge
                    variant={
                      req.status === 'DISPATCHED' ||
                      req.status === 'MATCHING' ||
                      req.status === 'PENDING'
                        ? 'warning'
                        : req.status === 'CANCELLED' ||
                            req.status === 'UNASSIGNED'
                          ? 'error'
                          : 'default'
                    }
                  >
                    {req.status}
                  </Badge>
                </TableCell>

                <TableCell
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {formatTime(req.created_at)}
                </TableCell>
              </TableRow>
            ))}

            {latestRequests.length === 0 && (
              <TableRow>
                <TableCell>
                  <div
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    No open requests.
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};