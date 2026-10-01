import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Section } from '../../components/ui/Section';
import { Skeleton } from '../../components/ui/Skeleton';
import { AssignVolunteerDialog } from '../../components/AssignVolunteerDialog';
import { fetchRequestDetail } from '../../api/client';
import type { PoliceRequest, RequestStatus } from '../../api/types';
import { ArrowLeft, UserCheck } from 'lucide-react';
import {
  categoryLabel,
  formatDateTime,
  priorityLabel,
  shortId,
  statusLabel,
} from '../../lib/format';
import { priorityTone, requestStatusTone, toneText } from '../../lib/tone';
import { pageStack } from '../../lib/styles';

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

/** A request police may still hand to a named volunteer (BR-04, ASSIGNABLE_STATUSES). */
const ASSIGNABLE: RequestStatus[] = ['PENDING', 'MATCHING', 'DISPATCHED'];

const canAssign = (request: PoliceRequest): boolean =>
  ASSIGNABLE.includes(request.status) && request.assigned_volunteer === null;

/** One labelled value in a detail card. */
const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
    <span
      style={{
        fontSize: 'var(--text-meta)',
        color: 'var(--color-ink-muted)',
        minWidth: '7.5rem',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
    <span style={{ fontSize: 'var(--text-body)', wordBreak: 'break-word' }}>{children}</span>
  </div>
);

export const RequestDetails: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const [request, setRequest] = useState<PoliceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRequestDetail(requestId);
      setRequest(result.request);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the request');
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const backLink = (
    <Link
      to="/requests"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: 'var(--text-meta)',
        color: 'var(--color-ink-muted)',
        alignSelf: 'flex-start',
      }}
    >
      <ArrowLeft size={16} /> Back to Requests
    </Link>
  );

  if (loading) {
    return (
      <div style={pageStack}>
        {backLink}
        <Card>
          <div role="status" aria-live="polite" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span className="sr-only">Loading the request…</span>
            <Skeleton width="40%" height="1.25rem" />
            <Skeleton width="70%" />
            <Skeleton width="55%" />
          </div>
        </Card>
      </div>
    );
  }

  // A failed load used to be a dead end: the error text with no way back to the
  // list and no way to retry.
  if (error || !request) {
    return (
      <div style={pageStack}>
        {backLink}
        <Alert onRetry={() => void load()}>{error ?? 'Request not found.'}</Alert>
      </div>
    );
  }

  const extras = detailEntries(request.details);
  const senior = request.senior;
  const volunteer = request.assigned_volunteer;

  return (
    <div style={pageStack}>
      {backLink}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.625rem', minWidth: 0 }}>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, margin: 0 }}>
            {senior.full_name ?? 'Help request'}
          </h1>
          <span className="mono" style={{ ...toneText.neutral, fontSize: 'var(--text-meta)' }}>
            {shortId(request.id)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge tone={requestStatusTone(request.status)} state dot>
            {statusLabel(request.status)}
          </Badge>
          <Badge tone={priorityTone(request.priority)} state={request.priority === 'urgent'}>
            {priorityLabel(request.priority)}
          </Badge>
          {canAssign(request) && (
            <Button size="sm" icon={<UserCheck size={14} />} onClick={() => setAssignOpen(true)}>
              Assign volunteer
            </Button>
          )}
        </div>
      </div>

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <div
        style={{
          display: 'grid',
          // Collapses on a narrow pane; a fixed two-column grid used to squeeze
          // the description into a two-word-per-line column.
          gridTemplateColumns: 'repeat(auto-fit, minmax(19rem, 1fr))',
          gap: '1.5rem',
        }}
      >
        <Card>
          <Section title="Senior" unbordered>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <DetailRow label="Name">
                <Link to={`/seniors/${senior.id}`} style={{ fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                  {senior.full_name ?? 'Name not recorded'}
                </Link>
              </DetailRow>
              <DetailRow label="Phone">
                {senior.phone_number ?? <span style={toneText.neutral}>Not provided</span>}
              </DetailRow>
              <DetailRow label="Email">
                {senior.email ?? <span style={toneText.neutral}>Not provided</span>}
              </DetailRow>
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Request" unbordered>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <DetailRow label="Category">{categoryLabel(request.category)}</DetailRow>
              <DetailRow label="Description">{request.description}</DetailRow>
              {extras.map(([label, value]) => (
                <DetailRow key={label} label={label}>
                  {value}
                </DetailRow>
              ))}
              <DetailRow label="Source">{request.source}</DetailRow>
              <DetailRow label="Raised">{formatDateTime(request.created_at)}</DetailRow>
              <DetailRow label="Location">
                {request.latitude != null && request.longitude != null ? (
                  // Precise to four decimals — enough for an officer to find the
                  // street, not enough to be a shareable coordinate.
                  <span className="mono">
                    {request.latitude.toFixed(4)}, {request.longitude.toFixed(4)}
                  </span>
                ) : (
                  <span style={toneText.neutral}>Not recorded</span>
                )}
              </DetailRow>
            </div>
          </Section>
        </Card>
      </div>

      <Card>
        <Section title="Photo" unbordered>
          {request.image_url ? (
            <a
              href={request.image_url}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-block', color: 'var(--color-ink-muted)', fontSize: 'var(--text-meta)' }}
            >
              <img
                src={request.image_url}
                alt={`Photo the senior attached to request ${shortId(request.id)}`}
                style={{
                  width: '100%',
                  maxWidth: '480px',
                  borderRadius: 'var(--radius-control)',
                  display: 'block',
                  cursor: 'zoom-in',
                }}
              />
              <span style={{ display: 'inline-block', marginTop: '0.5rem' }}>
                Attached by the senior · select to open full size
              </span>
            </a>
          ) : (
            <span style={toneText.neutral}>The senior did not attach a photo to this request.</span>
          )}
        </Section>
      </Card>

      <Card>
        <Section title="Volunteer" unbordered>
          {volunteer ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <DetailRow label="Name">
                <Link
                  to={`/volunteers/${volunteer.id}`}
                  style={{ fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                >
                  {volunteer.full_name ?? 'Name not recorded'}
                </Link>
              </DetailRow>
              <DetailRow label="Phone">
                {volunteer.phone_number ?? <span style={toneText.neutral}>Not provided</span>}
              </DetailRow>
            </div>
          ) : (
            <span style={toneText.neutral}>
              {canAssign(request)
                ? 'No volunteer assigned yet. You can assign one by hand.'
                : 'No volunteer assigned.'}
            </span>
          )}
        </Section>
      </Card>

      {assignOpen && request && (
        <AssignVolunteerDialog
          request={request}
          onClose={() => setAssignOpen(false)}
          onAssigned={(assigned) => {
            setRequest((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'DISPATCHED',
                    assigned_volunteer: {
                      id: assigned.id,
                      full_name: assigned.full_name,
                      phone_number: assigned.phone_number,
                    },
                  }
                : prev,
            );
            setNotice(
              `${assigned.full_name ?? 'Volunteer'} was assigned and has been asked to accept.`,
            );
          }}
        />
      )}
    </div>
  );
};
