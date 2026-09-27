import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { fetchVolunteer } from '../../api/client';
import type { VolunteerDetail } from '../../api/types';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const FIELD: React.CSSProperties = { color: 'var(--color-text-secondary)', fontSize: '0.8125rem' };

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      padding: '1rem 1.5rem',
      borderBottom: '1px solid var(--color-border)',
      fontWeight: 600,
      fontSize: '0.9375rem',
    }}
  >
    {children}
  </div>
);

export const VolunteerDetails: React.FC = () => {
  const { volunteerId } = useParams<{ volunteerId: string }>();
  const [profile, setProfile] = useState<{ volunteer: VolunteerDetail; positionIsFresh: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!volunteerId) return;
    setLoading(true);
    setError(null);
    fetchVolunteer(volunteerId)
      .then((result) => {
        // `current_*` is only trustworthy within 10 minutes. Decided here, at
        // fetch time, rather than during render: computing it in the render body
        // would make a stale pin look live for as long as the component sat
        // mounted.
        const updatedAt = result.volunteer.location_updated_at;
        const positionIsFresh =
          updatedAt !== null && Date.now() - new Date(updatedAt).getTime() < 10 * 60 * 1000;
        setProfile({ volunteer: result.volunteer, positionIsFresh });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load volunteer');
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [volunteerId]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        Loading volunteer…
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.375rem', backgroundColor: 'rgba(220,38,38,0.08)', color: 'var(--color-status-error)', fontSize: '0.875rem' }}>
          {error ?? 'Volunteer not found.'}
        </div>
        <Link to="/volunteers" style={{ color: 'var(--color-primary-navy)' }}>
          ← Back to volunteers
        </Link>
      </div>
    );
  }

  const { volunteer, positionIsFresh } = profile;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <Link to="/volunteers" style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          ← Volunteers
        </Link>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0.5rem 0 0.5rem 0' }}>
          {volunteer.full_name ?? volunteer.email}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Badge variant={volunteer.is_verified ? 'success' : 'warning'}>
            {volunteer.verification_status === 'NONE' ? 'Not approved' : volunteer.verification_status}
          </Badge>
          <Badge variant={volunteer.is_available ? 'success' : 'default'}>
            {volunteer.is_available ? 'On duty' : 'Off duty'}
          </Badge>
          {volunteer.active_request_id && (
            <Badge variant="error">On a job</Badge>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <Card>
          <SectionTitle>Contact</SectionTitle>
          <dl style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', margin: 0 }}>
            <dt style={FIELD}>Email</dt>
            <dd style={{ margin: 0 }}>{volunteer.email}</dd>
            <dt style={FIELD}>Phone</dt>
            <dd style={{ margin: 0 }}>{volunteer.phone_number ?? '—'}</dd>
            <dt style={FIELD}>Organisation</dt>
            <dd style={{ margin: 0 }}>{volunteer.organization ?? '—'}</dd>
            <dt style={FIELD}>Club</dt>
            <dd style={{ margin: 0 }}>{volunteer.club_id ?? '—'}</dd>
            <dt style={FIELD}>Skills</dt>
            <dd style={{ margin: 0 }}>{volunteer.skills.length > 0 ? volunteer.skills.join(', ') : '—'}</dd>
            <dt style={FIELD}>Registered</dt>
            <dd style={{ margin: 0 }}>{formatDate(volunteer.created_at)}</dd>
          </dl>
        </Card>

        <Card>
          <SectionTitle>Position</SectionTitle>
          <dl style={{ padding: '0 1.5rem 1.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', margin: 0 }}>
            <dt style={FIELD}>Base</dt>
            <dd style={{ margin: 0 }}>
              {volunteer.base_latitude !== null && volunteer.base_longitude !== null
                ? `${volunteer.base_latitude}, ${volunteer.base_longitude}`
                : '—'}
            </dd>
            <dt style={FIELD}>Last reported</dt>
            <dd style={{ margin: 0 }}>
              {volunteer.location_updated_at
                ? `${formatDate(volunteer.location_updated_at)}${positionIsFresh ? '' : ' (stale)'}`
                : 'Never'}
            </dd>
          </dl>
          <p style={{ padding: '0 1.5rem 1.5rem', ...FIELD, margin: 0 }}>
            Base coordinates are whatever was typed at registration and are often only a locality.
            Treat them as a hint, not a location.
          </p>
        </Card>
      </div>

      <Card>
        <SectionTitle>Assignment history</SectionTitle>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Request</TableHeader>
              <TableHeader>Category</TableHeader>
              <TableHeader>Offered at distance</TableHeader>
              <TableHeader>Outcome</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Created</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {volunteer.assignments.map((assignment) => (
              <TableRow key={assignment.request_id}>
                <TableCell>
                  <Link to={`/requests/${assignment.request_id}`} style={{ color: 'var(--color-primary-navy)' }}>
                    {assignment.request_id.slice(0, 8)}
                  </Link>
                </TableCell>
                <TableCell>{assignment.category}</TableCell>
                <TableCell>
                  {assignment.distance_m !== null ? `${Math.round(assignment.distance_m)} m` : '—'}
                </TableCell>
                <TableCell>
                  {assignment.was_assigned ? (
                    <Badge variant="success">Assigned</Badge>
                  ) : assignment.declined ? (
                    <Badge variant="warning">Declined</Badge>
                  ) : (
                    <span style={FIELD}>Offered only</span>
                  )}
                </TableCell>
                <TableCell>{assignment.status}</TableCell>
                <TableCell style={{ whiteSpace: 'nowrap' }}>{formatDate(assignment.created_at)}</TableCell>
              </TableRow>
            ))}
            {volunteer.assignments.length === 0 && (
              <TableRow>
                <TableCell>
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    No requests have been dispatched to this volunteer.
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
