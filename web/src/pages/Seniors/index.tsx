import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterChip } from '../../components/ui/FilterChip';
import { Section } from '../../components/ui/Section';
import { SearchInput } from '../../components/ui/SearchInput';
import { SkeletonTable } from '../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { fetchSeniors } from '../../api/client';
import type { PoliceSenior, VerificationDerivedStatus } from '../../api/types';
import { formatDate, shortId } from '../../lib/format';
import { seniorVerificationTone, toneText } from '../../lib/tone';
import { pageStack } from '../../lib/styles';

const PAGE_SIZE = 25;

type StatusView = VerificationDerivedStatus | 'ALL';

const STATUS_VIEWS: Array<{ value: StatusView; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'NONE', label: 'No record' },
];

/** P-06: the senior directory. */
export const Seniors: React.FC = () => {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState<StatusView>('ALL');
  const [seniors, setSeniors] = useState<PoliceSenior[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const result = await fetchSeniors({
          ...(appliedSearch ? { search: appliedSearch } : {}),
          ...(status === 'ALL' ? {} : { status }),
          limit: PAGE_SIZE,
          ...(reset || !cursorRef.current ? {} : { cursor: cursorRef.current }),
        });
        setSeniors((prev) => (reset ? result.seniors : [...prev, ...result.seniors]));
        cursorRef.current = result.next_cursor;
        setCursor(result.next_cursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load seniors');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [appliedSearch, status],
  );

  useEffect(() => {
    cursorRef.current = null;
    setCursor(null);
    void load(true);
  }, [load]);

  return (
    <div style={pageStack}>
      {error && <Alert onRetry={() => void load(seniors.length === 0)}>{error}</Alert>}

      <Card flush>
        {/* The 0.625rem gutter is the dense table cell padding, so the title,
            the filters and the first column of the table share one left edge. */}
        <div style={{ padding: '0.875rem 0.625rem', borderBottom: '1px solid var(--color-rule)' }}>
          <Section
            title="Registered seniors"
            description="Including those still waiting to complete their profile."
            unbordered
            actions={
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {STATUS_VIEWS.map((view) => (
                  <FilterChip
                    key={view.value}
                    group="Verification"
                    label={view.label}
                    active={status === view.value}
                    onClick={() => setStatus(view.value)}
                  />
                ))}
              </div>
            }
          >
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
                label="Search seniors"
                placeholder="Search name, email or phone…"
                width="260px"
              />
              {/* This one is a real server-side search (`?search=`), unlike the
                  other pages, so it can apply on every keystroke. Enter is kept
                  as an explicit apply for muscle memory. */}
              <Button type="submit" size="sm" variant="outline">
                Search
              </Button>
            </form>
          </Section>
        </div>

        {loading && seniors.length === 0 ? (
          <SkeletonTable columns={7} rows={8} />
        ) : (
          <>
            <Table density="dense" stickyHeader>
              <TableCaption>
                Registered senior citizens. Each name links to the senior's profile.
              </TableCaption>
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Phone</TableHeader>
                  <TableHeader>Language</TableHeader>
                  <TableHeader>Verification</TableHeader>
                  <TableHeader align="right">Requests</TableHeader>
                  <TableHeader>Registered</TableHeader>
                  <TableHeader align="right">Ref</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {seniors.map((senior) => (
                  <TableRow key={senior.id}>
                    <TableCell>
                      <Link
                        to={`/seniors/${senior.id}`}
                        style={{ fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                      >
                        {senior.full_name ?? 'Profile incomplete'}
                      </Link>
                      <div style={{ ...toneText.neutral, fontSize: 'var(--text-label)' }}>
                        {senior.email}
                      </div>
                    </TableCell>
                    <TableCell>{senior.phone_number ?? <span style={toneText.neutral}>Not provided</span>}</TableCell>
                    <TableCell style={toneText.neutral}>{senior.preferred_language ?? '—'}</TableCell>
                    <TableCell>
                      <Badge tone={seniorVerificationTone(senior.verification_status)} state dot>
                        {senior.verification_status === 'NONE' ? 'No record' : senior.verification_status}
                      </Badge>
                    </TableCell>
                    <TableCell align="right">
                      <span className="tnum">{senior.request_count}</span>
                    </TableCell>
                    <TableCell style={{ ...toneText.neutral, whiteSpace: 'nowrap' }}>
                      {formatDate(senior.created_at)}
                    </TableCell>
                    <TableCell align="right">
                      <span className="mono" style={toneText.neutral}>
                        {shortId(senior.id)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}

                {seniors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        title="No senior matches this filter"
                        description={
                          appliedSearch
                            ? `Nothing matched “${appliedSearch}”${
                                status === 'ALL' ? '' : ` with verification ${status.toLowerCase()}`
                              }.`
                            : status === 'ALL'
                              ? 'No senior is registered yet.'
                              : `No senior has a verification record of ${status.toLowerCase()}.`
                        }
                        action={
                          appliedSearch || status !== 'ALL' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSearch('');
                                setAppliedSearch('');
                                setStatus('ALL');
                              }}
                            >
                              Clear filters
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
                  onClick={() => void load(false)}
                >
                  {loadingMore ? 'Loading…' : `Load more (${seniors.length} shown)`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};
