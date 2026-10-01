import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, DangerButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterChip } from '../../components/ui/FilterChip';
import { Field } from '../../components/ui/Field';
import { Section } from '../../components/ui/Section';
import { StatStrip } from '../../components/ui/StatTile';
import { Skeleton, SkeletonTable } from '../../components/ui/Skeleton';
import { SearchInput } from '../../components/ui/SearchInput';
import { Card } from '../../components/ui/Card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { fetchVerification, fetchVerifications, reviewVerification } from '../../api/client';
import type { VerificationDetail, VerificationStatus, VerificationSummary } from '../../api/types';
import { Eye } from 'lucide-react';
import { elapsedLabel, formatDateTime, shortId, verificationRoleLabel } from '../../lib/format';
import { verificationStatusTone, toneText } from '../../lib/tone';
import { pageStack } from '../../lib/styles';

const PAGE_SIZE = 25;
const REASON_LIMIT = 500;

type StatusView = VerificationStatus | 'ALL';
type RoleView = 'all' | 'senior' | 'volunteer';

const STATUS_VIEWS: Array<{ value: StatusView; label: string }> = [
  { value: 'PENDING', label: 'Needs review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

const ROLE_VIEWS: Array<{ value: RoleView; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'senior', label: 'Senior' },
  { value: 'volunteer', label: 'Volunteer' },
];

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
 * even masked, so a screenshot of this dialog cannot leak one; the police
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
    return entries
      .map(([key, v]) => `${FORM_LABELS[key] ?? key}: ${formatFormValue(v)}`)
      .join(' · ');
  }
  return String(value);
}

/** V-02: the submitted form, so a decision is made on evidence not on a name. */
const VerificationDialog: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
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
    <Modal title="Application" onClose={onClose} width={540}>
      {loading && (
        <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <span className="sr-only">Loading the application…</span>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} width={`${100 - i * 8}%`} />
          ))}
        </div>
      )}

      {error && <Alert onRetry={() => window.location.reload()}>{error}</Alert>}

      {detail && (
        <>
          <div
            style={{
              display: 'flex',
              gap: '0.625rem',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: '1.25rem',
            }}
          >
            <Badge tone={verificationStatusTone(detail.status)} state dot>
              {detail.status}
            </Badge>
            <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-ink-muted)' }}>
              {verificationRoleLabel(detail.role)} · {detail.user.email}
            </span>
          </div>

          <Section title="Submitted details" unbordered>
            {formEntries.length === 0 ? (
              <p style={{ margin: 0, ...toneText.neutral }}>No form data was submitted.</p>
            ) : (
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(8rem, auto) 1fr',
                  gap: '0.5rem 1rem',
                  margin: 0,
                }}
              >
                {formEntries.map(([key, value]) => (
                  <React.Fragment key={key}>
                    <dt style={{ fontSize: 'var(--text-meta)', color: 'var(--color-ink-muted)' }}>
                      {FORM_LABELS[key] ?? key}
                    </dt>
                    <dd style={{ margin: 0, fontSize: 'var(--text-body)', wordBreak: 'break-word' }}>
                      {formatFormValue(value)}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            )}
            <p style={{ margin: '1rem 0 0', fontSize: 'var(--text-label)', ...toneText.neutral }}>
              Aadhaar is collected for registration but is never displayed here.
            </p>
          </Section>

          {detail.reviewed_at && (
            <div style={{ marginTop: '1.25rem' }}>
              <Section title="Review" unbordered>
                <p style={{ margin: 0, fontSize: 'var(--text-body)' }}>
                  {detail.status} on {formatDateTime(detail.reviewed_at)}
                </p>
                {detail.review_reason && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: 'var(--text-body)', ...toneText.neutral }}>
                    Reason given: {detail.review_reason}
                  </p>
                )}
              </Section>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export const Verification: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<StatusView>('PENDING');
  const [roleFilter, setRoleFilter] = useState<RoleView>('all');
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
  }, [load]);

  const updateStatus = async (
    record: VerificationSummary,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) => {
    setBusyId(record.id);
    setError(null);
    setNotice(null);
    try {
      await reviewVerification(record.id, status, reason);
      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? { ...r, status, reviewed_at: new Date().toISOString() }
            : r,
        ),
      );
      setNotice(
        status === 'APPROVED'
          ? `${record.full_name ?? record.email} was approved and can now sign in.`
          : `${record.full_name ?? record.email} was rejected.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the verification');
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
      (record.full_name ?? '').toLowerCase().includes(q) || record.email.toLowerCase().includes(q)
    );
  });

  // Counts cover the loaded pages only, so the label says so rather than
  // implying a whole-queue total the API never returns.
  const counts = useMemo(
    () => ({
      PENDING: records.filter((v) => v.status === 'PENDING').length,
      APPROVED: records.filter((v) => v.status === 'APPROVED').length,
      REJECTED: records.filter((v) => v.status === 'REJECTED').length,
    }),
    [records],
  );

  return (
    <div style={pageStack}>
      {error && <Alert onRetry={() => void load(true)}>{error}</Alert>}
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <StatStrip
        items={[
          { label: 'loaded and pending review', value: counts.PENDING, tone: 'warning' },
          { label: 'loaded and approved', value: counts.APPROVED, tone: 'success' },
          { label: 'loaded and rejected', value: counts.REJECTED, tone: 'error' },
        ]}
      />

      <Card flush>
        {/* The 0.625rem gutter is the dense table cell padding, so the title,
            the filters and the first column of the table share one left edge. */}
        <div style={{ padding: '0.875rem 0.625rem', borderBottom: '1px solid var(--color-rule)' }}>
          <Section
            title="Registrations to review"
            description="Senior citizen registrations and volunteer character verifications."
            unbordered
            actions={
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {STATUS_VIEWS.map((view) => (
                  <FilterChip
                    key={view.value}
                    group="Status"
                    label={view.label}
                    active={statusFilter === view.value}
                    onClick={() => setStatusFilter(view.value)}
                  />
                ))}
              </div>
            }
          >
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {ROLE_VIEWS.map((view) => (
                  <FilterChip
                    key={view.value}
                    group="Applicant type"
                    label={view.label}
                    active={roleFilter === view.value}
                    onClick={() => setRoleFilter(view.value)}
                  />
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setAppliedSearch(search.trim());
                }}
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
              >
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  label="Search loaded rows by name or email"
                  placeholder="Search loaded rows…"
                  width="220px"
                />
                {/* Enter applies rather than filtering as you type, so the row
                    count under the filter does not jump mid-word. */}
                <Button type="submit" size="sm" variant="outline">
                  Search
                </Button>
              </form>
            </div>
          </Section>
        </div>

        {loading && records.length === 0 ? (
          <div style={{ padding: '0.5rem 0' }}>
            <SkeletonTable columns={7} rows={8} />
          </div>
        ) : (
          <>
            <Table density="dense" stickyHeader>
              <TableCaption>
                Identity verification submissions. View opens the submitted form; approve and
                reject apply to pending applications.
              </TableCaption>
              <TableHead>
                <TableRow>
                  <TableHeader width="4.5rem">Age</TableHeader>
                  <TableHeader>Applicant</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>Submitted</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader align="right">Ref</TableHeader>
                  <TableHeader align="right" width="14rem">
                    Actions
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <span className="tnum" style={toneText.neutral}>
                        {elapsedLabel(record.created_at) ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span style={{ fontWeight: 600 }}>
                        {record.full_name ?? 'Name not provided'}
                      </span>
                      <div style={{ ...toneText.neutral, fontSize: 'var(--text-label)' }}>
                        {record.email}
                      </div>
                    </TableCell>
                    <TableCell style={toneText.neutral}>{verificationRoleLabel(record.role)}</TableCell>
                    <TableCell style={{ ...toneText.neutral, whiteSpace: 'nowrap' }}>
                      {formatDateTime(record.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={verificationStatusTone(record.status)} state dot>
                        {record.status}
                      </Badge>
                    </TableCell>
                    <TableCell align="right">
                      <span className="mono" style={toneText.neutral}>
                        {shortId(record.id)}
                      </span>
                    </TableCell>
                    <TableCell align="right">
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.375rem',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Eye size={14} />}
                          onClick={() => setDetailId(record.id)}
                        >
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
                            <DangerButton
                              size="sm"
                              disabled={busyId === record.id}
                              onClick={() => {
                                setRejecting(record);
                                setRejectReason('');
                              }}
                            >
                              Reject
                            </DangerButton>
                          </>
                        ) : (
                          <span style={toneText.neutral}>Reviewed</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        title={
                          records.length === 0
                            ? 'No application matches this filter'
                            : 'No loaded row matches the search'
                        }
                        description={
                          records.length === 0
                            ? statusFilter === 'PENDING'
                              ? 'The review queue is empty. Approved and rejected applications are under the other filters.'
                              : 'Nothing matches this status and type combination.'
                            : `${records.length} loaded, none matching the search. Search only covers loaded rows.`
                        }
                        action={
                          records.length > 0 && appliedSearch !== '' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSearch('');
                                setAppliedSearch('');
                              }}
                            >
                              Clear search
                            </Button>
                          ) : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {cursor && (
              <div
                style={{
                  padding: '0.875rem',
                  display: 'flex',
                  justifyContent: 'center',
                  borderTop: '1px solid var(--color-rule)',
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void load(false, cursor)}
                >
                  {loadingMore ? 'Loading…' : `Load more (${records.length} shown)`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {rejecting && (
        <Modal
          title="Reject application"
          onClose={() => setRejecting(null)}
          width={460}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={busyId === rejecting.id}
                onClick={() => void updateStatus(rejecting, 'REJECTED', rejectReason)}
              >
                {busyId === rejecting.id ? 'Rejecting…' : 'Reject'}
              </Button>
            </>
          }
        >
          <p style={{ margin: '0 0 1rem', fontSize: 'var(--text-body)', color: 'var(--color-ink-muted)' }}>
            {rejecting.full_name ?? rejecting.email} is told the reason given here, so say what they
            can fix. The field is optional, but a rejection without one is a dead end for the person
            on the other side.
          </p>

          <Field label="Reason" hint={`${rejectReason.length}/${REASON_LIMIT}`}>
            {({ id, style }) => (
              <textarea
                id={id}
                value={rejectReason}
                maxLength={REASON_LIMIT}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="e.g. The phone number on the application does not match the ID proof."
                style={{ ...style, resize: 'vertical' }}
              />
            )}
          </Field>
        </Modal>
      )}

      {detailId && <VerificationDialog id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
};
