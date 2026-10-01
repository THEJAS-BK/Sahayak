import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { AgeCell } from '../../components/ui/AgeCell';
import { PageHeader } from '../../components/ui/PageHeader';
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

/**
 * The same `dl` grid the other detail pages use.
 *
 * It replaced a flex row with a fixed-width label and baseline alignment, which
 * put every value at a slightly different x once a label wrapped to two lines —
 * so a column of values read as a column of unrelated fragments.
 */
const DetailList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <dl
    style={{
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr)',
      gap: '0.5rem 1rem',
      margin: 0,
    }}
  >
    {children}
  </dl>
);

/** One labelled value. The label is muted; the value is the thing being read. */
const Detail: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <dt style={{ ...toneText.neutral, fontSize: 'var(--text-meta)' }}>{label}</dt>
    <dd style={{ margin: 0, wordBreak: 'break-word' }}>{children}</dd>
  </>
);

/** The missing-value word, so an absent field reads as absent rather than blank. */
const Absent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={toneText.neutral}>{children}</span>
);

const linkStyle: React.CSSProperties = {
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
};

export const RequestDetails: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  const [request, setRequest] = useState<PoliceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The age on this page is tied to when the detail was fetched, not to a fresh
  // `Date.now()` at render — otherwise it drifts more optimistic than the
  // status it sits next to, which is the failure mode AgeCell exists to stop.
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRequestDetail(requestId);
      setRequest(result.request);
      setFetchedAt(Date.now());
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
        <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <span className="sr-only">Loading the request…</span>
          <Skeleton width="30%" height="1.5rem" />
          <Skeleton width="20%" height="0.75rem" />
        </div>
        <Section title="Request" unbordered>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <Skeleton width="90%" />
            <Skeleton width="75%" />
            <Skeleton width="60%" />
          </div>
        </Section>
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
  const assignable = canAssign(request);
  /**
   * An empty dispatch batch on a request nobody is assigned means dispatch found
   * nobody in range, so the senior is waiting on an alert that was never
   * delivered. The board names this on the row; the detail page has to say it
   * too, or the officer reads "waiting" where the truth is "unreached".
   */
  const nobodyNotified = assignable && (request.dispatch_batch?.length ?? 0) === 0;

  return (
    <div style={pageStack}>
      {backLink}

      <PageHeader
        title={senior.full_name ?? 'Help request'}
        description={`${categoryLabel(request.category)} · raised ${formatDateTime(request.created_at)}`}
        actions={
          <>
            <Badge tone={requestStatusTone(request.status)} state dot>
              {statusLabel(request.status)}
            </Badge>
            <Badge tone={priorityTone(request.priority)} state={request.priority === 'urgent'}>
              {priorityLabel(request.priority)}
            </Badge>
            {assignable && (
              <Button size="sm" icon={<UserCheck size={14} />} onClick={() => setAssignOpen(true)}>
                Assign volunteer
              </Button>
            )}
          </>
        }
      />

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {nobodyNotified && (
        <Alert tone="error" role="status">
          Dispatch found no volunteer in range, so nobody was notified of this request. Assign one by
          hand.
        </Alert>
      )}

      <Section title="Request">
        {/* The description is the reason the page exists, so it leads as body
            copy. It used to sit as one row in a label/value grid next to the
            category, which is a filing cabinet, not a briefing. */}
        <p
          style={{
            margin: '0 0 1rem',
            fontSize: 'var(--text-lead)',
            lineHeight: '1.5',
            maxWidth: '68ch',
          }}
        >
          {request.description}
        </p>
        <DetailList>
          <Detail label="Category">{categoryLabel(request.category)}</Detail>
          <Detail label="Waiting">
            <AgeCell createdAt={request.created_at} status={request.status} now={fetchedAt} />
          </Detail>
          <Detail label="Raised">{formatDateTime(request.created_at)}</Detail>
          <Detail label="Source">{request.source}</Detail>
          <Detail label="Location">
            {request.latitude != null && request.longitude != null ? (
              // Precise to four decimals — enough for an officer to find the
              // street, not enough to be a shareable coordinate.
              <span className="mono">
                {request.latitude.toFixed(4)}, {request.longitude.toFixed(4)}
              </span>
            ) : (
              <Absent>Not recorded</Absent>
            )}
          </Detail>
          {extras.map(([label, value]) => (
            <Detail key={label} label={label}>
              {value}
            </Detail>
          ))}
          <Detail label="Reference">
            <span className="mono" style={toneText.neutral}>
              {request.id}
            </span>
          </Detail>
        </DetailList>
      </Section>

      <div
        style={{
          display: 'grid',
          // Collapses on a narrow pane; a fixed two-column grid used to squeeze
          // the description into a two-word-per-line column.
          gridTemplateColumns: 'repeat(auto-fit, minmax(19rem, 1fr))',
          gap: '1.5rem',
        }}
      >
        <Section title="Senior" unbordered>
          <DetailList>
            <Detail label="Name">
              <Link to={`/seniors/${senior.id}`} style={linkStyle}>
                {senior.full_name ?? 'Name not recorded'}
              </Link>
            </Detail>
            <Detail label="Phone">
              {senior.phone_number ?? <Absent>Not provided</Absent>}
            </Detail>
            <Detail label="Email">
              {senior.email ?? <Absent>Not provided</Absent>}
            </Detail>
          </DetailList>
        </Section>

        <Section title="Volunteer" unbordered>
          {volunteer ? (
            <DetailList>
              <Detail label="Name">
                <Link to={`/volunteers/${volunteer.id}`} style={linkStyle}>
                  {volunteer.full_name ?? 'Name not recorded'}
                </Link>
              </Detail>
              <Detail label="Phone">
                {volunteer.phone_number ?? <Absent>Not provided</Absent>}
              </Detail>
              {volunteer.organization && <Detail label="Organisation">{volunteer.organization}</Detail>}
            </DetailList>
          ) : (
            <p style={{ margin: 0, ...toneText.neutral }}>
              {assignable
                ? 'No volunteer assigned yet. Assign one by hand.'
                : 'No volunteer assigned.'}
            </p>
          )}
        </Section>
      </div>

      {request.image_url && (
        <Section title="Photo" unbordered>
          {/* A photo is an object, so this is the one place on the page a Card
              belongs. The padding is set here because Card is deliberately bare
              — it is a surface, not a box with margins inside it. */}
          <Card style={{ padding: '0.75rem', width: 'fit-content', maxWidth: '100%' }}>
            <a href={request.image_url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
              <img
                src={request.image_url}
                alt={`Photo the senior attached to request ${shortId(request.id)}`}
                style={{
                  display: 'block',
                  width: '100%',
                  maxWidth: '480px',
                  borderRadius: 'var(--radius-control)',
                  cursor: 'zoom-in',
                  background: 'var(--color-sunken)',
                }}
              />
              <span
                style={{
                  display: 'block',
                  marginTop: '0.5rem',
                  color: 'var(--color-ink-muted)',
                  fontSize: 'var(--text-meta)',
                }}
              >
                Attached by the senior · select to open full size
              </span>
            </a>
          </Card>
        </Section>
      )}

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