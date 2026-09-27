import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { fetchSenior } from '../../api/client';
import type { SeniorDetail } from '../../api/types';

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

/** P-07: one senior. Aadhaar is not part of this payload and is not displayed. */
export const SeniorDetails: React.FC = () => {
  const { seniorId } = useParams<{ seniorId: string }>();
  const [senior, setSenior] = useState<SeniorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seniorId) return;
    setLoading(true);
    setError(null);
    fetchSenior(seniorId)
      .then((result) => setSenior(result.senior))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load senior');
        setSenior(null);
      })
      .finally(() => setLoading(false));
  }, [seniorId]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        Loading senior…
      </div>
    );
  }

  if (error || !senior) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.375rem', backgroundColor: 'rgba(220,38,38,0.08)', color: 'var(--color-status-error)', fontSize: '0.875rem' }}>
          {error ?? 'Senior not found.'}
        </div>
        <Link to="/seniors" style={{ color: 'var(--color-primary-navy)' }}>
          ← Back to seniors
        </Link>
      </div>
    );
  }

  const contact = senior.emergency_contact;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <Link to="/seniors" style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          ← Seniors
        </Link>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0.5rem 0 0.5rem 0' }}>
          {senior.full_name ?? 'Profile incomplete'}
        </h1>
        <Badge variant={senior.is_verified ? 'success' : 'warning'}>
          {senior.verification_status === 'NONE' ? 'Not approved' : senior.verification_status}
        </Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <Card>
          <SectionTitle>Contact</SectionTitle>
          <dl style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', margin: 0 }}>
            <dt style={FIELD}>Email</dt>
            <dd style={{ margin: 0 }}>{senior.email}</dd>
            <dt style={FIELD}>Phone</dt>
            <dd style={{ margin: 0 }}>{senior.phone_number ?? '—'}</dd>
            <dt style={FIELD}>Language</dt>
            <dd style={{ margin: 0 }}>{senior.preferred_language ?? '—'}</dd>
            <dt style={FIELD}>Home</dt>
            <dd style={{ margin: 0 }}>
              {senior.home_latitude !== null && senior.home_longitude !== null
                ? `${senior.home_latitude}, ${senior.home_longitude}`
                : '—'}
            </dd>
            <dt style={FIELD}>Registered</dt>
            <dd style={{ margin: 0 }}>{formatDate(senior.created_at)}</dd>
          </dl>
        </Card>

        <Card>
          <SectionTitle>Emergency contact</SectionTitle>
          {contact ? (
            <dl style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', margin: 0 }}>
              <dt style={FIELD}>Name</dt>
              <dd style={{ margin: 0 }}>{contact.name ?? '—'}</dd>
              <dt style={FIELD}>Phone</dt>
              <dd style={{ margin: 0 }}>{contact.phone ?? '—'}</dd>
              <dt style={FIELD}>Relation</dt>
              <dd style={{ margin: 0 }}>{contact.relation ?? '—'}</dd>
            </dl>
          ) : (
            <div style={{ padding: '1.5rem', ...FIELD, margin: 0 }}>
              None on file. This senior registered without an emergency contact.
            </div>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle>Verifications</SectionTitle>
        <Table>
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
                <TableCell style={{ whiteSpace: 'nowrap' }}>{formatDate(verification.created_at)}</TableCell>
                <TableCell style={{ textTransform: 'capitalize' }}>{verification.role}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      verification.status === 'APPROVED'
                        ? 'success'
                        : verification.status === 'REJECTED'
                          ? 'error'
                          : 'warning'
                    }
                  >
                    {verification.status}
                  </Badge>
                </TableCell>
                <TableCell style={{ color: 'var(--color-text-secondary)' }}>
                  {verification.review_reason ?? '—'}
                </TableCell>
                <TableCell style={{ color: 'var(--color-text-secondary)' }}>
                  {verification.reviewer_email ?? '—'}
                </TableCell>
              </TableRow>
            ))}
            {senior.verifications.length === 0 && (
              <TableRow>
                <TableCell>
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    No verification records.
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        <Card>
          <SectionTitle>Recent requests</SectionTitle>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Category</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Created</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {senior.requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <Link to={`/requests/${req.id}`} style={{ color: 'var(--color-primary-navy)' }}>
                      {req.category}
                    </Link>
                  </TableCell>
                  <TableCell>{req.status}</TableCell>
                  <TableCell style={{ whiteSpace: 'nowrap' }}>{formatDate(req.created_at)}</TableCell>
                </TableRow>
              ))}
              {senior.requests.length === 0 && (
                <TableRow>
                  <TableCell>
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      No requests.
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <SectionTitle>Emergency events</SectionTitle>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Trigger</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Raised</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {senior.emergencies.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{event.trigger_type.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <Badge variant={event.status === 'LOGGED' ? 'error' : 'success'}>{event.status}</Badge>
                  </TableCell>
                  <TableCell style={{ whiteSpace: 'nowrap' }}>{formatDate(event.created_at)}</TableCell>
                </TableRow>
              ))}
              {senior.emergencies.length === 0 && (
                <TableRow>
                  <TableCell>
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      No emergency events.
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
};
