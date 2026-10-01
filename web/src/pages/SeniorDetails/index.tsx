import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { Section } from '../../components/ui/Section';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { fetchSenior } from '../../api/client';
import type { SeniorDetail } from '../../api/types';
import {
  categoryLabel,
  elapsedLabel,
  formatDateTime,
  statusLabel,
  triggerLabel,
  verificationRoleLabel,
} from '../../lib/format';
import {
  emergencyStatusTone,
  seniorVerificationTone,
  toneText,
  verificationStatusTone,
} from '../../lib/tone';
import { pageStack } from '../../lib/styles';

/** P-07: one senior. Aadhaar is not part of this payload and is not displayed. */
export const SeniorDetails: React.FC = () => {
  const { seniorId } = useParams<{ seniorId: string }>();
  const [senior, setSenior] = useState<SeniorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!seniorId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSenior(seniorId);
      setSenior(result.senior);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the senior');
      setSenior(null);
    } finally {
      setLoading(false);
    }
  }, [seniorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const backLink = (
    <Link
      to="/seniors"
      style={{
        color: 'var(--color-ink-muted)',
        fontSize: 'var(--text-meta)',
        alignSelf: 'flex-start',
      }}
    >
      ← Seniors
    </Link>
  );

  if (loading) {
    return (
      <div style={pageStack}>
        {backLink}
        <Card>
          <div role="status" aria-live="polite" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span className="sr-only">Loading the senior…</span>
            <Skeleton width="35%" height="1.25rem" />
            <Skeleton width="60%" />
            <Skeleton width="45%" />
          </div>
        </Card>
      </div>
    );
  }

  if (error || !senior) {
    return (
      <div style={pageStack}>
        {backLink}
        <Alert onRetry={() => void load()}>{error ?? 'Senior not found.'}</Alert>
      </div>
    );
  }

  const contact = senior.emergency_contact;

  return (
    <div style={pageStack}>
      {/* Outside the heading column, so the gap under the back link is the
          pageStack rhythm (1.5rem) rather than the 0.5rem that pairs the
          title with its badges. RequestDetails already works this way. */}
      {backLink}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, margin: 0 }}>
          {senior.full_name ?? 'Profile incomplete'}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge
            tone={senior.is_verified ? 'success' : seniorVerificationTone(senior.verification_status)}
            state
            dot
          >
            {senior.verification_status === 'NONE' ? 'Not approved' : senior.verification_status}
          </Badge>
          <span style={{ ...toneText.neutral, fontSize: 'var(--text-meta)' }}>
            Registered {formatDateTime(senior.created_at)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(19rem, 1fr))',
          gap: '1.5rem',
        }}
      >
        <Card>
          <Section title="Contact" unbordered>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', margin: 0 }}>
              <dt style={toneText.neutral}>Email</dt>
              <dd style={{ margin: 0 }}>{senior.email}</dd>
              <dt style={toneText.neutral}>Phone</dt>
              <dd style={{ margin: 0 }}>
                {senior.phone_number ?? <span style={toneText.neutral}>Not provided</span>}
              </dd>
              <dt style={toneText.neutral}>Language</dt>
              <dd style={{ margin: 0 }}>
                {senior.preferred_language ?? <span style={toneText.neutral}>Not stated</span>}
              </dd>
              <dt style={toneText.neutral}>Home</dt>
              <dd style={{ margin: 0 }}>
                {senior.home_latitude !== null && senior.home_longitude !== null ? (
                  <span className="mono">
                    {senior.home_latitude.toFixed(4)}, {senior.home_longitude.toFixed(4)}
                  </span>
                ) : (
                  <span style={toneText.neutral}>Not recorded</span>
                )}
              </dd>
              <dt style={toneText.neutral}>Requests</dt>
              <dd style={{ margin: 0 }}>
                <span className="tnum">{senior.request_count}</span>
              </dd>
            </dl>
          </Section>
        </Card>

        <Card>
          <Section title="Emergency contact" unbordered>
            {contact ? (
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', margin: 0 }}>
                <dt style={toneText.neutral}>Name</dt>
                <dd style={{ margin: 0 }}>{contact.name ?? <span style={toneText.neutral}>—</span>}</dd>
                <dt style={toneText.neutral}>Phone</dt>
                <dd style={{ margin: 0 }}>
                  {contact.phone ?? <span style={toneText.neutral}>Not provided</span>}
                </dd>
                <dt style={toneText.neutral}>Relation</dt>
                <dd style={{ margin: 0 }}>{contact.relation ?? <span style={toneText.neutral}>—</span>}</dd>
              </dl>
            ) : (
              /* Called out rather than a bare dash: no emergency contact is a
                 gap someone should act on, not a missing optional field. */
              <Alert tone="warning" role="status">
                No emergency contact on file. This senior registered without one.
              </Alert>
            )}
          </Section>
        </Card>
      </div>

      <Section title="Verifications" unbordered>
        <Card flush>
          <Table density="dense">
            <TableCaption>
              Identity verifications submitted for this senior, with the review outcome.
            </TableCaption>
            <TableHead>
              <TableRow>
                <TableHeader>Submitted</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Reason</TableHeader>
                <TableHeader>Reviewed by</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {senior.verifications.map((verification) => (
                <TableRow key={verification.id}>
                  <TableCell style={{ ...toneText.neutral, whiteSpace: 'nowrap' }}>
                    {formatDateTime(verification.created_at)}
                  </TableCell>
                  <TableCell>{verificationRoleLabel(verification.role)}</TableCell>
                  <TableCell>
                    <Badge tone={verificationStatusTone(verification.status)} state dot>
                      {verification.status}
                    </Badge>
                  </TableCell>
                  <TableCell style={toneText.neutral}>
                    {verification.review_reason ?? '—'}
                  </TableCell>
                  <TableCell style={toneText.neutral}>
                    {verification.reviewer_email ?? '—'}
                  </TableCell>
                </TableRow>
              ))}

              {senior.verifications.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState
                      title="No verification record"
                      description="This senior has never submitted an identity verification."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))',
          gap: '1.5rem',
        }}
      >
        <Section title="Recent requests" unbordered>
          <Card flush>
            <Table density="dense">
              <TableCaption>
                Assistance requests raised by this senior, newest first.
              </TableCaption>
              <TableHead>
                <TableRow>
                  <TableHeader>Category</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Age</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {senior.requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <Link
                        to={`/requests/${req.id}`}
                        style={{ fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                      >
                        {categoryLabel(req.category)}
                      </Link>
                    </TableCell>
                    <TableCell style={toneText.neutral}>{statusLabel(req.status)}</TableCell>
                    <TableCell>
                      <span className="tnum" style={toneText.neutral}>
                        {elapsedLabel(req.created_at) ?? '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}

                {senior.requests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <EmptyState
                        title="No requests"
                        description="This senior has not raised an assistance request."
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </Section>

        <Section title="Emergency events" unbordered>
          <Card flush>
            <Table density="dense">
              <TableCaption>
                Emergency events raised for this senior, newest first. A reviewed event has been
                seen by an officer; it is not necessarily resolved.
              </TableCaption>
              <TableHead>
                <TableRow>
                  <TableHeader>Trigger</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Age</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {senior.emergencies.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{triggerLabel(event.trigger_type)}</TableCell>
                    <TableCell>
                      <Badge tone={emergencyStatusTone(event.status)} state dot>
                        {event.status === 'LOGGED' ? 'Needs review' : 'Reviewed'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="tnum" style={toneText.neutral}>
                        {elapsedLabel(event.created_at) ?? '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}

                {senior.emergencies.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <EmptyState
                        title="No emergency event"
                        description="The agent has not raised an SOS for this senior."
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </Section>
      </div>
    </div>
  );
};
