import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { fetchVerification, fetchVerifications, reviewVerification } from '../../api/client';
import type { VerificationStatus, VerificationSummary, VerificationDetail } from '../../api/types';
import { Eye, Search } from 'lucide-react';

const roleLabel = (role: string) =>
  role === 'senior' ? 'Senior' : role === 'volunteer' ? 'Volunteer' : role;

const statusVariant: Record<VerificationStatus, 'success' | 'warning' | 'error'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'error',
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export const Verification: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    'All' | 'Senior' | 'Volunteer'
  >('All');
const PAGE_SIZE = 25;

/** R-01/R-02 form keys, so an officer reads "Home location" and not "home_latitude". */
const FORM_LABELS: Record<string, string> = {
  full_name: 'Full name',
  phone_number: 'Phone',
  home_latitude: 'Home latitude',
  home_longitude: 'Home longitude',
  preferred_language: 'Preferred language',
  organization: 'Organisation',
  club_id: 'Club',
  skills: 'Skills',
  base_latitude: 'Base latitude',
  base_longitude: 'Base longitude',
  id_proof_ref: 'ID proof reference',
  emergency_contact: 'Emergency contact',
};

/**
 * Aadhaar is a government identifier. It is deliberately not rendered, not
 * even masked, so a screenshot of this drawer cannot leak one; the police
 * console has no operational need to read it back.
 */
const REDACTED_FIELDS = new Set(['aadhaar_number', 'aadhaar']);

function formatFormValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join(', ') : '—';
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !REDACTED_FIELDS.has(key),
    );
    if (entries.length === 0) return '—';
    return entries.map(([key, v]) => `${FORM_LABELS[key] ?? key}: ${formatFormValue(v)}`).join(' · ');
  }
  return String(value);
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(15,23,42,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
  zIndex: 60,
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--color-border)',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: '0.875rem',
  background: 'var(--color-surface-white)',
  color: 'var(--color-text-primary)',
};

const SECTION: React.CSSProperties = {
  fontSize: '0.6875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 700,
  color: 'var(--color-text-secondary)',
};

/** V-02: the submitted form, so a decision is made on evidence not on a name. */
const VerificationDrawer: React.FC<{
  id: string;
  onClose: () => void;
}> = ({ id, onClose }) => {
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchVerification(id)
      .then((result) => {
        if (!cancelled) setDetail(result.verification);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load the application');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const formEntries = detail
    ? Object.entries(detail.form_data ?? {}).filter(([key]) => !REDACTED_FIELDS.has(key))
    : [];

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Verification detail" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--color-surface-white)',
          borderRadius: '0.5rem',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 45px rgba(15,23,42,0.25)',
        }}
      >
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Application</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              {detail ? `${roleLabel(detail.role)} · ${detail.user.email}` : 'Loading…'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loading && <p style={{ ...SECTION, margin: 0 }}>Loading…</p>}
          {error && (
            <p style={{ margin: 0, color: 'var(--color-status-error)', fontSize: '0.875rem' }}>{error}</p>
          )}

          {detail && (
            <>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge variant={statusVariant[detail.status]}>{detail.status}</Badge>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  Submitted {formatDate(detail.created_at)}
                </span>
              </div>

              <div>
                <p style={{ ...SECTION, margin: '0 0 0.5rem' }}>Submitted details</p>
                {formEntries.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                    No form data was submitted with this application.
                  </p>
                ) : (
                  <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem', margin: 0 }}>
                    {formEntries.map(([key, value]) => (
                      <React.Fragment key={key}>
                        <dt style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                          {FORM_LABELS[key] ?? key}
                        </dt>
                        <dd style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 500, wordBreak: 'break-word' }}>
                          {formatFormValue(value)}
                        </dd>
                      </React.Fragment>
                    ))}
                  </dl>
                )}
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  Aadhaar is collected for registration but is never displayed here.
                </p>
              </div>

              {detail.reviewed_at && (
                <div>
                  <p style={{ ...SECTION, margin: '0 0 0.5rem' }}>Review</p>
                  <p style={{ margin: 0, fontSize: '0.8125rem' }}>
                    {detail.status} on {formatDate(detail.reviewed_at)}
                  </p>
                  {detail.review_reason && (
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                      Reason: {detail.review_reason}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const Verification: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<VerificationStatus | 'ALL'>('ALL');
  const [roleFilter, setRoleFilter] = useState<'all' | 'senior' | 'volunteer'>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [records, setRecords] = useState<VerificationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<VerificationSummary | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean, nextCursor?: string | null) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        // The status filter is the one the API understands, so it goes up as a
        // query. Filtering it again on the client would only ever narrow the
        // first page and hide the rest of the queue.
        const result = await fetchVerifications({
          ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
          limit: String(PAGE_SIZE),
          ...(nextCursor ? { cursor: nextCursor } : {}),
        });
        setRecords((prev) => (reset ? result.verifications : [...prev, ...result.verifications]));
        setCursor(result.next_cursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load verifications');
        if (reset) setRecords([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    setCursor(null);
    void load(true);
  }, [load, appliedSearch, roleFilter]);

  const applyStatus = (id: string, status: 'APPROVED' | 'REJECTED') => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status, reviewed_at: new Date().toISOString() }
          : r,
      ),
    );
  };

  const updateStatus = async (record: VerificationSummary, status: 'APPROVED' | 'REJECTED', reason?: string) => {
    setBusyId(record.id);
    setError(null);
    setNotice(null);
    try {
      await reviewVerification(record.id, status, reason);
      applyStatus(record.id, status);
      setNotice(
        status === 'APPROVED'
          ? `${record.full_name ?? record.email} was approved and can now sign in.`
          : `${record.full_name ?? record.email} was rejected.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update verification');
    } finally {
      setBusyId(null);
      setRejecting(null);
      setRejectReason('');
    }
  };

  /**
   * Search is a client-side filter over the pages already loaded, and says so
   * in its placeholder. `GET /verifications` takes no search term, and paging
   * the whole table to filter it would be worse than the limitation.
   */
  const filtered = records.filter((record) => {
    if (roleFilter !== 'all' && record.role !== roleFilter) return false;
    const q = appliedSearch.trim().toLowerCase();
    if (q === '') return true;
    return (
      (record.full_name ?? '').toLowerCase().includes(q) ||
      record.email.toLowerCase().includes(q)
    );
  });

  const counts = useMemo(
    () => ({
      PENDING: records.filter((v) => v.status === 'PENDING').length,
      APPROVED: records.filter((v) => v.status === 'APPROVED').length,
      REJECTED: records.filter((v) => v.status === 'REJECTED').length,
    }),
    [records],
  );

  const tiles: Array<{ label: string; value: number; tone: 'warning' | 'success' | 'error' }> = [
    { label: 'Pending review', value: counts.PENDING, tone: 'warning' },
    { label: 'Approved', value: counts.APPROVED, tone: 'success' },
    { label: 'Rejected / returned', value: counts.REJECTED, tone: 'error' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }}>Identity Verifications</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: '0.4rem 0 0' }}>
          Review senior citizen registrations and volunteer character verifications.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            backgroundColor: 'var(--color-status-error-bg)',
            color: 'var(--color-status-error)',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        {tiles.map((tile) => (
          <div
            key={tile.label}
            style={{
              padding: '1rem 1.25rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-white)',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{tile.label}</div>
            <div style={{ fontSize: '1.875rem', fontWeight: 700, marginTop: '0.35rem' }}>{tile.value}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          borderRadius: '0.5rem',
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface-white)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              variant={statusFilter === 'PENDING' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('PENDING')}
            >
              Needs review
            </Button>
            <Button
              variant={statusFilter === 'ALL' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('ALL')}
            >
              All statuses
            </Button>
            <Button
              variant={statusFilter === 'APPROVED' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('APPROVED')}
            >
              Approved
            </Button>
            <Button
              variant={statusFilter === 'REJECTED' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('REJECTED')}
            >
              Rejected
            </Button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(['all', 'senior', 'volunteer'] as const).map((role) => (
              <Button
                key={role}
                variant={roleFilter === role ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setRoleFilter(role)}
              >
                {role === 'all' ? 'All types' : roleLabel(role)}
              </Button>
            ))}
          </div>

          <form
            style={{ position: 'relative', flex: 1, minWidth: '220px' }}
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedSearch(search.trim());
            }}
          >
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-secondary)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search loaded rows by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...fieldStyle, paddingLeft: '2.25rem' }}
            />
          </form>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Loading verifications…
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>ID</TableHeader>
                  <TableHeader>Applicant</TableHeader>
                  <TableHeader>Role</TableHeader>
                  <TableHeader>Submitted</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>

              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                        {record.id.slice(0, 8)}
                      </span>
                    </TableCell>

        {!loading && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>ID</TableHeader>
                <TableHeader>Name</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Submitted</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>

            <TableBody>
              {filteredData.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <span
                      style={{
                        fontWeight: 500,
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {record.id}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span style={{ fontWeight: 500 }}>
                      {record.full_name ?? record.email}
                    </span>
                  </TableCell>

                  <TableCell>{roleLabel(record.role)}</TableCell>

                  <TableCell
                    style={{
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {formatDate(record.created_at)}
                  </TableCell>

                  <TableCell>
                    <Badge variant={statusVariant[record.status]}>
                      {record.status}
                    </Badge>
                  </TableCell>

                  <TableCell>
		    <Button
  variant="ghost"
  size="sm"
  onClick={() => navigate(`/verification/${record.id}`)}
>
  View
</Button>
                    {record.status === 'PENDING' ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                        }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === record.id}
                          onClick={() =>
                            updateStatus(record.id, 'APPROVED')
                          }
                        >
                          Accept
                        </Button>
                    <TableCell>
                      <span style={{ fontWeight: 500 }}>{record.full_name ?? 'Name not provided'}</span>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                        {record.email}
                      </div>
                    </TableCell>

                    <TableCell>{roleLabel(record.role)}</TableCell>

                    <TableCell style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatDate(record.created_at)}
                    </TableCell>

                    <TableCell>
                      <Badge variant={statusVariant[record.status]}>{record.status}</Badge>
                    </TableCell>

                    <TableCell>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailId(record.id)}
                          title="View the submitted application"
                        >
                          <Eye size={14} style={{ marginRight: '0.25rem' }} />
                          View
                        </Button>

                        {record.status === 'PENDING' ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === record.id}
                              onClick={() => void updateStatus(record, 'APPROVED')}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === record.id}
                              style={{ color: 'var(--color-status-error)' }}
                              onClick={() => {
                                setRejecting(record);
                                setRejectReason('');
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        ) : (
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                            Reviewed
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell>
                      <div
                        style={{
                          padding: '2rem',
                          textAlign: 'center',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        {records.length === 0
                          ? 'No verifications match this filter.'
                          : 'No loaded row matches the search. Clear it to see the full page.'}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {cursor && (
              <div
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void load(false, cursor)}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {rejecting && (
        <div
          style={overlayStyle}
          role="dialog"
          aria-modal="true"
          aria-label="Reject application"
          onClick={() => setRejecting(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--color-surface-white)',
              borderRadius: '0.5rem',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 20px 45px rgba(15,23,42,0.25)',
            }}
          >
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Reject application</h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                {rejecting.full_name ?? rejecting.email} is told the reason you give here, so say
                what they can fix. Optional, but a rejection without one is a dead end.
              </p>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="e.g. The phone number on the application does not match the ID proof."
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
                {rejectReason.length}/500
              </div>
            </div>

            <div
              style={{
                padding: '0.875rem 1.5rem',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
              }}
            >
              <Button variant="secondary" size="sm" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={busyId === rejecting.id}
                style={{ backgroundColor: 'var(--color-status-error)' }}
                onClick={() => void updateStatus(rejecting, 'REJECTED', rejectReason)}
              >
                {busyId === rejecting.id ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailId && <VerificationDrawer id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
};
