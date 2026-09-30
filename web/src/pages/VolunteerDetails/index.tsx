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
import { fetchVolunteer } from '../../api/client';
import type { VolunteerDetail } from '../../api/types';
import { categoryLabel, formatDateTime, shortId, statusLabel } from '../../lib/format';
import { toneText } from '../../lib/tone';
import { pageStack } from '../../lib/styles';

/** How long a reported position is trusted before it is called stale. */
const POSITION_FRESH_MS = 10 * 60 * 1000;

export const VolunteerDetails: React.FC = () => {
  const { volunteerId } = useParams<{ volunteerId: string }>();
  const [profile, setProfile] = useState<{
    volunteer: VolunteerDetail;
    positionIsFresh: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!volunteerId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchVolunteer(volunteerId);
      // `current_*` is only trustworthy within 10 minutes. Decided here, at
      // fetch time, rather than during render: computing it in the render body
      // would make a stale pin look live for as long as the component sat
      // mounted.
      const updatedAt = result.volunteer.location_updated_at;
      const positionIsFresh =
        updatedAt !== null && Date.now() - new Date(updatedAt).getTime() < POSITION_FRESH_MS;
      setProfile({ volunteer: result.volunteer, positionIsFresh });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the volunteer');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [volunteerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const backLink = (
    <Link
      to="/volunteers"
      style={{
        color: 'var(--color-ink-muted)',
        fontSize: 'var(--text-meta)',
        alignSelf: 'flex-start',
      }}
    >
      ← Volunteers
    </Link>
  );

  if (loading) {
    return (
      <div style={pageStack}>
        {backLink}
        <Card>
          <div role="status" aria-live="polite" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span className="sr-only">Loading the volunteer…</span>
            <Skeleton width="35%" height="1.25rem" />
            <Skeleton width="60%" />
            <Skeleton width="45%" />
          </div>
        </Card>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={pageStack}>
        {backLink}
        <Alert onRetry={() => void load()}>{error ?? 'Volunteer not found.'}</Alert>
      </div>
    );
  }

  const { volunteer, positionIsFresh } = profile;

  return (
    <div style={pageStack}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {backLink}
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, margin: 0 }}>
          {volunteer.full_name ?? volunteer.email}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge
            tone={volunteer.is_verified ? 'success' : 'warning'}
            state
            dot
          >
            {volunteer.verification_status === 'NONE' ? 'Not approved' : volunteer.verification_status}
          </Badge>
          {/* Duty is a current state the officer acts on, so it carries the dot
              too; approval above is a settled fact. */}
          <Badge tone={volunteer.is_available ? 'success' : 'neutral'} dot>
            {volunteer.is_available ? 'On duty' : 'Off duty'}
          </Badge>
          {volunteer.active_request_id && (
            <Badge tone="error" dot>
              On a job
            </Badge>
          )}
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
              <dd style={{ margin: 0 }}>{volunteer.email}</dd>
              <dt style={toneText.neutral}>Phone</dt>
              <dd style={{ margin: 0 }}>
                {volunteer.phone_number ?? <span style={toneText.neutral}>Not provided</span>}
              </dd>
              <dt style={toneText.neutral}>Organisation</dt>
              <dd style={{ margin: 0 }}>
                {volunteer.organization ?? <span style={toneText.neutral}>—</span>}
              </dd>
              <dt style={toneText.neutral}>Club</dt>
              <dd style={{ margin: 0 }}>{volunteer.club_id ?? <span style={toneText.neutral}>—</span>}</dd>
              <dt style={toneText.neutral}>Skills</dt>
              <dd style={{ margin: 0 }}>
                {volunteer.skills.length > 0 ? volunteer.skills.join(', ') : '—'}
              </dd>
              <dt style={toneText.neutral}>Registered</dt>
              <dd style={{ margin: 0 }}>{formatDateTime(volunteer.created_at)}</dd>
            </dl>
          </Section>
        </Card>

        <Card>
          <Section title="Position" unbordered>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', margin: 0, marginBottom: '1rem' }}>
              <dt style={toneText.neutral}>Base</dt>
              <dd style={{ margin: 0 }}>
                {volunteer.base_latitude !== null && volunteer.base_longitude !== null ? (
                  <span className="mono">
                    {volunteer.base_latitude.toFixed(4)}, {volunteer.base_longitude.toFixed(4)}
                  </span>
                ) : (
                  <span style={toneText.neutral}>Not recorded</span>
                )}
              </dd>
              <dt style={toneText.neutral}>Last reported</dt>
              <dd style={{ margin: 0 }}>
                {volunteer.location_updated_at ? (
                  <>
                    {formatDateTime(volunteer.location_updated_at)}{' '}
                    {!positionIsFresh && (
                      <Badge tone="warning">Stale</Badge>
                    )}
                  </>
                ) : (
                  <span style={toneText.neutral}>Never</span>
                )}
              </dd>
            </dl>
            <Alert tone="warning" role="note">
              Base coordinates are whatever was typed at registration and are often only a locality.
              Treat them as a hint, not a location.
            </Alert>
          </Section>
        </Card>
      </div>

      <Section title="Assignment history" unbordered>
        <Card flush>
          <Table density="dense">
            <TableCaption>
              Requests dispatched to this volunteer, and what became of each offer.
            </TableCaption>
            <TableHead>
              <TableRow>
                <TableHeader>Request</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader align="right">Offered at</TableHeader>
                <TableHeader>Outcome</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Raised</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {volunteer.assignments.map((assignment) => (
                <TableRow key={assignment.request_id}>
                  <TableCell>
                    <Link
                      to={`/requests/${assignment.request_id}`}
                      className="mono"
                      style={{ color: 'var(--color-navy)', fontWeight: 600 }}
                    >
                      {shortId(assignment.request_id)}
                    </Link>
                  </TableCell>
                  <TableCell>{categoryLabel(assignment.category)}</TableCell>
                  <TableCell align="right">
                    {assignment.distance_m !== null ? (
                      // The dispatch radius is real, unlike the base coordinates.
                      <span className="tnum">{Math.round(assignment.distance_m)} m</span>
                    ) : (
                      <span style={toneText.neutral}>—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {assignment.was_assigned ? (
                      <Badge tone="success" dot>
                        Assigned
                      </Badge>
                    ) : assignment.declined ? (
                      <Badge tone="warning" dot>
                        Declined
                      </Badge>
                    ) : (
                      <span style={toneText.neutral}>Offered only</span>
                    )}
                  </TableCell>
                  <TableCell style={toneText.neutral}>{statusLabel(assignment.status)}</TableCell>
                  <TableCell style={{ ...toneText.neutral, whiteSpace: 'nowrap' }}>
                    {formatDateTime(assignment.created_at)}
                  </TableCell>
                </TableRow>
              ))}

              {volunteer.assignments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      title="No assignment history"
                      description="No request has been dispatched to this volunteer."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </Section>
    </div>
  );
};
