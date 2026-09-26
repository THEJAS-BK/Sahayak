import React, { useEffect, useState } from 'react';
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

const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const Requests: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | RequestStatus>('All');
  const [priorityFilter, setPriorityFilter] = useState<'All' | 'URGENT' | 'NORMAL'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [assignTarget, setAssignTarget] = useState<PoliceRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (statusFilter !== 'All') params.status = statusFilter;
    if (priorityFilter !== 'All') params.priority = priorityFilter === 'URGENT' ? 'urgent' : 'normal';
    setLoading(true);
    setError(null);
    fetchPoliceRequests(params)
      .then((result) => setRequests(result.requests))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load requests');
        setRequests([]);
      })
      .finally(() => setLoading(false));
  }, [statusFilter, priorityFilter]);

  const statuses: ('All' | RequestStatus)[] = ['All', 'PENDING', 'MATCHING', 'DISPATCHED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'UNASSIGNED'];
  const priorities: ('All' | 'URGENT' | 'NORMAL')[] = ['All', 'URGENT', 'NORMAL'];

  const filtered = requests.filter((req) => {
    const matchesSearch = (req.senior.full_name ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleAssigned = (request: PoliceRequest, volunteer: { id: string; full_name: string | null }) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === request.id
          ? {
              ...r,
              status: 'DISPATCHED',
              assigned_volunteer: {
                id: volunteer.id,
                full_name: volunteer.full_name,
                phone_number: null,
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
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Review help requests from seniors.</p>
      </div>

      <Card>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | RequestStatus)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--color-border)',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
                background: 'var(--color-surface-white)',
              }}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'All' | 'URGENT' | 'NORMAL')}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--color-border)',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
                background: 'var(--color-surface-white)',
              }}
            >
              {priorities.map((p) => (
                <option key={p} value={p}>{p === 'All' ? 'All Priorities' : p}</option>
              ))}
            </select>
          </div>

          <div style={{ position: 'relative', width: '250px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input
              type="text"
              placeholder="Search by senior name..."
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
              }}
            />
          </div>
        </div>

        {loading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Loading requests…</div>
        )}
        {error && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-status-error)' }}>{error}</div>
        )}
        {notice && (
          <div
            style={{
              padding: '0.75rem 1rem',
              margin: '0 0 1rem',
              borderRadius: '0.375rem',
              backgroundColor: 'var(--color-status-success-bg)',
              color: 'var(--color-text-primary)',
              fontSize: '0.875rem',
            }}
          >
            {notice}
          </div>
        )}
        {!loading && !error && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>ID</TableHeader>
                <TableHeader>Senior</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Assigned Volunteer</TableHeader>
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
                    <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>{req.id}</span>
                  </TableCell>
                  <TableCell>
                    <span style={{ fontWeight: 500 }}>{req.senior.full_name ?? req.senior.email}</span>
                  </TableCell>
                  <TableCell>{categoryLabels[req.category] ?? req.category}</TableCell>
                  <TableCell>
                    <Badge variant={req.priority === 'urgent' ? 'error' : 'default'}>{priorityLabel(req.priority)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[req.status]}>{req.status}</Badge>
                  </TableCell>
                  <TableCell>{req.assigned_volunteer?.full_name ?? '—'}</TableCell>
                  <TableCell style={{ color: 'var(--color-text-secondary)' }}>{formatDate(req.created_at)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {canAssign(req) ? (
                      <Button size="sm" variant="outline" onClick={() => setAssignTarget(req)}>
                        <UserCheck size={14} style={{ marginRight: '0.375rem' }} />
                        Assign
                      </Button>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell>
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      No requests found.
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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