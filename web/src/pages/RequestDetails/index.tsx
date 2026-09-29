import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { AssignVolunteerDialog } from '../../components/AssignVolunteerDialog';
import { fetchRequestDetail } from '../../api/client';
import { priorityLabel, type PoliceRequest, type RequestStatus } from '../../api/types';
import { ArrowLeft, UserCheck } from 'lucide-react';

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

const detailLabels: Record<string, string> = {
  items: 'Items',
  symptom: 'Symptom',
  symptoms: 'Symptoms',
  destination: 'Going to',
};

const formatValue = (value: unknown): string =>
  Array.isArray(value) ? value.map((v) => String(v)).join(', ') : String(value);

/** Extras the voice agent captured (items / symptom / destination). */
function detailEntries(details: unknown): Array<[string, string]> {
  if (details == null || typeof details !== 'object' || Array.isArray(details)) return [];
  return Object.entries(details as Record<string, unknown>).map(([key, value]) => [
    detailLabels[key] ?? key,
    formatValue(value),
  ]);
}

const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});


/** A request police may still hand to a named volunteer (BR-04, ASSIGNABLE_STATUSES). */
const ASSIGNABLE: RequestStatus[] = ['PENDING', 'MATCHING', 'DISPATCHED'];

const canAssign = (request: PoliceRequest): boolean =>
  ASSIGNABLE.includes(request.status) && request.assigned_volunteer === null;

export const RequestDetails: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<PoliceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
  const extras = detailEntries(request.details);
  const senior = request.senior;
  const volunteer = request.assigned_volunteer;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Button variant="ghost" size="sm" onClick={() => navigate('/requests')} style={{ alignSelf: 'flex-start', fontWeight: 500 }}>
        <ArrowLeft size={16} style={{ marginRight: '0.5rem' }} />
        Back to Requests
      </Button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }}>Request {request.id}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Badge variant={request.priority === 'urgent' ? 'error' : 'default'}>{priorityLabel(request.priority)}</Badge>
          <Badge variant={statusBadgeVariant[request.status]}>{request.status}</Badge>
          {canAssign(request) && (
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <UserCheck size={14} style={{ marginRight: '0.375rem' }} />
              Assign volunteer
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            backgroundColor: 'var(--color-status-success-bg)',
            color: 'var(--color-text-primary)',
            fontSize: '0.875rem',
          }}
        >
          {notice}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <Card>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Senior</h2>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>{senior.full_name ?? 'Name not recorded'}</span>
            {senior.phone_number && (
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{senior.phone_number}</span>
            )}
            {senior.email && (
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{senior.email}</span>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Request</h2>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
            <div><span style={{ color: 'var(--color-text-secondary)' }}>Category: </span>{categoryLabels[request.category] ?? request.category}</div>
            <div><span style={{ color: 'var(--color-text-secondary)' }}>Description: </span>{request.description}</div>
            {extras.map(([label, value]) => (
              <div key={label}><span style={{ color: 'var(--color-text-secondary)' }}>{label}: </span>{value}</div>
            ))}
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
          {volunteer ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>{volunteer.full_name ?? 'Name not recorded'}</span>
              {volunteer.phone_number && (
                <span style={{ color: 'var(--color-text-secondary)' }}>{volunteer.phone_number}</span>
              )}
              {volunteer.organization && (
                <span style={{ color: 'var(--color-text-secondary)' }}>{volunteer.organization}</span>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {canAssign(request)
                ? 'No volunteer assigned yet. You can assign one by hand.'
                : 'No volunteer assigned yet.'}
            </span>
          )}
        </div>
      </Card>
      {assignOpen && request && (
        <AssignVolunteerDialog
          request={request}
          onClose={() => setAssignOpen(false)}
          onAssigned={(volunteer) => {
            setRequest((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'DISPATCHED',
                    assigned_volunteer: {
                      id: volunteer.id,
                      full_name: volunteer.full_name,
                      phone_number: volunteer.phone_number,
                    },
                  }
                : prev,
            );
            setNotice(
              `${volunteer.full_name ?? 'Volunteer'} was assigned and has been asked to accept.`,
            );
          }}
        />
      )}
    </div>
  );
};