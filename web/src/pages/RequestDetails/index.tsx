import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { mockRequests, mockRequestDetail, type RequestStatus } from '../../data/mock';
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

export const RequestDetails: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();

  const detail = requestId === mockRequestDetail.id ? mockRequestDetail : undefined;
  const request = detail ?? mockRequests.find((r) => r.id === requestId);

  if (!request) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'flex-start' }}>
        <Link to="/requests" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          <ArrowLeft size={16} /> Back to Requests
        </Link>
        <Card>
          <div style={{ padding: '2rem', color: 'var(--color-text-secondary)' }}>Request not found.</div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Button variant="ghost" size="sm" onClick={() => navigate('/requests')} style={{ alignSelf: 'flex-start', fontWeight: 500 }}>
        <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} />
        Back to Requests
      </Button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }}>Request {request.id}</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Badge variant={request.priority === 'URGENT' ? 'error' : 'default'}>{request.priority}</Badge>
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

      {detail && (
        <Card>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Request Timeline</h2>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {detail.timeline.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{
                  marginTop: '0.25rem',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: i === detail.timeline.length - 1 ? 'var(--color-primary-navy)' : 'var(--color-border)',
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