import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { fetchSeniors } from '../../api/client';
import type { PoliceSenior, VerificationDerivedStatus } from '../../api/types';
import { Search } from 'lucide-react';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium' });

const statusVariant: Record<VerificationDerivedStatus, 'success' | 'warning' | 'error' | 'default'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'error',
  NONE: 'default',
};

const PAGE_SIZE = 25;

/** P-06: the senior directory. */
export const Seniors: React.FC = () => {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState<VerificationDerivedStatus | 'ALL'>('ALL');
  const [seniors, setSeniors] = useState<PoliceSenior[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (reset: boolean) => {
    setError(null);
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const result = await fetchSeniors({
        ...(appliedSearch ? { search: appliedSearch } : {}),
        ...(status === 'ALL' ? {} : { status }),
        limit: PAGE_SIZE,
        ...(reset || !cursor ? {} : { cursor: cursor ?? undefined }),
      });
      setSeniors((prev) => (reset ? result.seniors : [...prev, ...result.seniors]));
      setCursor(result.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load seniors');
      if (reset) setSeniors([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setCursor(null);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, status]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Seniors</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Registered seniors, including those still waiting to complete their profile.
        </p>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.375rem', backgroundColor: 'rgba(220,38,38,0.08)', color: 'var(--color-status-error)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <Card>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {([['ALL', 'All'], ['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['NONE', 'No record']] as const).map(
              ([value, label]) => (
                <FilterChip key={value} active={status === value} label={label} onClick={() => setStatus(value)} />
              ),
            )}
          </div>

          <form
            style={{ position: 'relative', width: '260px' }}
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedSearch(search.trim());
            }}
          >
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input
              type="text"
              placeholder="Search name, email or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.5rem 0.5rem 2.25rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--color-border)',
                outline: 'none',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
              }}
            />
          </form>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Loading seniors…
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Phone</TableHeader>
                  <TableHeader>Language</TableHeader>
                  <TableHeader>Verification</TableHeader>
                  <TableHeader>Requests</TableHeader>
                  <TableHeader>Registered</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {seniors.map((senior) => (
                  <TableRow key={senior.id}>
                    <TableCell>
                      <Link to={`/seniors/${senior.id}`} style={{ color: 'var(--color-primary-navy)', fontWeight: 500 }}>
                        {senior.full_name ?? 'Profile incomplete'}
                      </Link>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                        {senior.email}
                      </div>
                    </TableCell>
                    <TableCell>{senior.phone_number ?? '—'}</TableCell>
                    <TableCell>{senior.preferred_language ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[senior.verification_status]}>
                        {senior.verification_status === 'NONE' ? 'No record' : senior.verification_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{senior.request_count}</TableCell>
                    <TableCell style={{ whiteSpace: 'nowrap' }}>{formatDate(senior.created_at)}</TableCell>
                  </TableRow>
                ))}
                {seniors.length === 0 && (
                  <TableRow>
                    <TableCell>
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                        No seniors found.
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {cursor && (
              <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void load(false)}
                  style={{
                    padding: '0.375rem 0.875rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--color-border)',
                    background: 'none',
                    cursor: loadingMore ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.875rem',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

const FilterChip: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({
  active,
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: '0.375rem 0.75rem',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
      fontFamily: 'inherit',
      fontWeight: 500,
      cursor: 'pointer',
      backgroundColor: active ? 'var(--color-primary-navy)' : 'transparent',
      color: active ? '#FFFFFF' : 'var(--color-text-secondary)',
      border: '1px solid var(--color-border)',
    }}
  >
    {label}
  </button>
);
