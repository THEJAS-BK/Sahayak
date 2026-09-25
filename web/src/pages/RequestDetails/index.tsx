import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { fetchRequestDetail } from '../../api/client';
import { priorityLabel, type PoliceRequest, type RequestStatus } from '../../api/types';
import { ArrowLeft } from 'lucide-react';

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

const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

interface TimelineEntry {
  status: RequestStatus;
  at: string;
  note: string;
}

function buildTimeline(request: PoliceRequest): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  if (request.created_at) entries.push({ status: 'PENDING', at: request.created_at, note: 'Request created' });
  if (request.dispatched_at) entries.push({ status: 'DISPATCHED', at: request.dispatched_at, note: 'Dispatched to volunteers' });
  if (request.accepted_at) entries.push({ status: 'ACCEPTED', at: request.accepted_at, note: 'Accepted by volunteer' });
  if (request.status === 'IN_PROGRESS') entries.push({ status: 'IN_PROGRESS', at: request.updated_at, note: 'In progress' });
  if (request.completed_at) entries.push({ status: 'COMPLETED', at: request.completed_at, note: 'Request completed' });
  if (request.cancelled_at) entries.push({ status: 'CANCELLED', at: request.cancelled_at, note: 'Request cancelled' });
  return entries;
}

export const RequestDetails: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<PoliceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    fetchRequestDetail(requestId)
      .then((result) => setRequest(result.request))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load request');
        setRequest(null);
      })
      .finally(() => setLoading(false));
  }, [requestId]);

  if (loading) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>Loading request…</div>;
  }

  if (error || !request) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'flex-start' }}>
        <Link to="/requests" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={16} /> Back to Requests
        </Link>
        <Card>
          <div style={{ padding: '2rem', color: 'var(--color-status-error)' }}>{error ?? 'Request not found.'}</div>
        </Card>
      </div>
    );
  }

  const timeline = buildTimeline(request);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Button variant="ghost" size="sm" onClick={() => navigate('/requests')} style={{ alignSelf: 'flex-start', fontWeight: 500 }}>
        <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} />
        Back to Requests
      </Button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }}>Request {request.id}</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Badge variant={request.priority === 'urgent' ? 'error' : 'default'}>{priorityLabel(request.priority)}</Badge>
          <Badge variant={statusBadgeVariant[request.status]}>{request.status}</Badge>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <Card>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Senior</h2>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>{request.senior.full_name}</span>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{request.senior.phone_number}</span>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{request.senior.email}</span>
          </div>
        </Card>

        <Card>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Request</h2>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
            <div><span style={{ color: 'var(--color-text-secondary)' }}>Category: </span>{categoryLabels[request.category] ?? request.category}</div>
            <div><span style={{ color: 'var(--color-text-secondary)' }}>Description: </span>{request.description}</div>
            <div><span style={{ color: 'var(--color-text-secondary)' }}>Source: </span>{request.source}</div>
            <div><span style={{ color: 'var(--color-text-secondary)' }}>Created: </span>{formatDate(request.created_at)}</div>
            {request.latitude != null && request.longitude != null && (
              <div><span style={{ color: 'var(--color-text-secondary)' }}>Location: </span>{request.latitude.toFixed(4)}, {request.longitude.toFixed(4)}</div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Volunteer</h2>
        </div>
        <div style={{ padding: '1.5rem', fontSize: '0.875rem' }}>
          {request.assigned_volunteer ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>{request.assigned_volunteer.full_name}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{request.assigned_volunteer.phone_number}</span>
              {request.assigned_volunteer.organization && (
                <span style={{ color: 'var(--color-text-secondary)' }}>{request.assigned_volunteer.organization}</span>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--color-text-secondary)' }}>No volunteer assigned yet.</span>
          )}
        </div>
      </Card>

      {timeline.length > 0 && (
        <Card>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Request Timeline</h2>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {timeline.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{
                  marginTop: '0.25rem',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: i === timeline.length - 1 ? 'var(--color-primary-navy)' : 'var(--color-border)',
                  flexShrink: 0,
                }} />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{entry.status}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{formatDate(entry.at)} · {entry.note}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};