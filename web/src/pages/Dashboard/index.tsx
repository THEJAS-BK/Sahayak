import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { fetchPoliceRequests, fetchAuditLogs } from '../../api/client';
import type { AuditLog, PoliceRequest } from '../../api/types';
import { priorityLabel } from '../../api/types';
import { Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';

const OPEN_STATUSES = ['PENDING', 'MATCHING', 'DISPATCHED', 'ACCEPTED', 'IN_PROGRESS'];
const ACTIVE_STATUSES = ['DISPATCHED', 'ACCEPTED', 'IN_PROGRESS'];

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

const activityType = (log: AuditLog): 'alert' | 'system' | 'request' => {
  if (log.action.startsWith('emergency')) return 'alert';
  if (log.action.startsWith('verification') || log.action.startsWith('registration')) return 'system';
  return 'request';
};

const activityTitle = (log: AuditLog) =>
  log.action.replace(/(^|\.)/g, (m) => (m === '.' ? ' ' : '')).replace(/\b\w/g, (c) => c.toUpperCase());

export const Dashboard: React.FC = () => {
  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchPoliceRequests({ limit: '200' }), fetchAuditLogs(10)])
      .then(([reqResult, auditResult]) => {
        setRequests(reqResult.requests);
        setAuditLogs(auditResult.logs);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const openRequests = requests.filter((r) => OPEN_STATUSES.includes(r.status)).length;
    const activeOperations = requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length;
    const urgentRequests = requests.filter((r) => r.priority === 'urgent').length;
    const completedToday = requests.filter(
      (r) => r.status === 'COMPLETED' && r.completed_at && isToday(r.completed_at),
    ).length;
    return { openRequests, activeOperations, completedToday, urgentRequests };
  }, [requests]);

  const latestRequests = useMemo(() => {
    const open = requests.filter((r) => OPEN_STATUSES.includes(r.status));
    return [...open]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [requests]);

  if (loading) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>Loading dashboard…</div>;
  }

  if (error) {
    return <div style={{ color: 'var(--color-status-error)' }}>{error}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Dashboard Overview</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Monitor active requests and recent system activity.</p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
        <Card style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Open Requests</h3>
            <Clock size={20} color="var(--color-status-warning)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.openRequests}</div>
        </Card>

        <Card style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Active Operations</h3>
            <Activity size={20} color="var(--color-text-primary)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.activeOperations}</div>
        </Card>

        <Card style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Completed Today</h3>
            <CheckCircle size={20} color="var(--color-status-success)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.completedToday}</div>
        </Card>

        <Card style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Urgent Requests</h3>
            <AlertCircle size={20} color="var(--color-status-error)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.urgentRequests}</div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Latest Requests Table */}
        <Card>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Latest Open Requests</h2>
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
                  <TableCell>{req.senior.full_name ?? req.senior.email}</TableCell>
                  <TableCell>
                    <Badge variant={req.priority === 'urgent' ? 'error' : 'success'}>
                      {priorityLabel(req.priority)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={req.status === 'DISPATCHED' || req.status === 'MATCHING' || req.status === 'PENDING' ? 'warning' : req.status === 'CANCELLED' || req.status === 'UNASSIGNED' ? 'error' : 'default'}>
                      {req.status}
                    </Badge>
                  </TableCell>
                  <TableCell style={{ color: 'var(--color-text-secondary)' }}>{formatTime(req.created_at)}</TableCell>
                </TableRow>
              ))}
              {latestRequests.length === 0 && (
                <TableRow>
                  <TableCell>
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      No open requests.
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Recent Activity Feed */}
        <Card>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Recent Activity</h2>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {auditLogs.map((log) => {
              const type = activityType(log);
              return (
                <div key={log.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{
                    marginTop: '0.25rem',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: type === 'alert' ? 'var(--color-status-error)' : 'var(--color-primary-navy)',
                    flexShrink: 0,
                  }} />
                  <div>
                    <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', fontWeight: 500 }}>
                      {activityTitle(log)} <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>· {log.entity_type}:{log.entity_id}</span>
                    </p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{formatTime(log.created_at)}</p>
                  </div>
                </div>
              );
            })}
            {auditLogs.length === 0 && (
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>No recent activity.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};