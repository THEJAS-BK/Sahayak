import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { fetchAssignableVolunteers } from '../../api/client';
import type { AssignableVolunteer } from '../../api/types';
import { Search } from 'lucide-react';

type AvailabilityFilter = 'all' | 'true' | 'false';

/**
 * P-04, list only.
 *
 * There is no distance column on purpose. `base_*` is whatever the volunteer
 * typed at registration — often just a locality — and `current_*` only exists
 * once live position updates ship, so sorting by it would be false precision.
 * `can_assign` from the server is the column that matters.
 */
export const Volunteers: React.FC = () => {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [volunteers, setVolunteers] = useState<AssignableVolunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAssignableVolunteers({
      ...(appliedSearch ? { search: appliedSearch } : {}),
      ...(availability === 'all' ? {} : { available: availability }),
    })
      .then((result) => setVolunteers(result.volunteers))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load volunteers');
        setVolunteers([]);
      })
      .finally(() => setLoading(false));
  }, [appliedSearch, availability]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Volunteers</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Registered volunteers and whether they can take a job right now.
        </p>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.375rem', backgroundColor: 'rgba(220,38,38,0.08)', color: 'var(--color-status-error)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <Card>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {([['all', 'All'], ['true', 'Available'], ['false', 'Unavailable']] as const).map(
              ([value, label]) => (
                <ButtonFilter
                  key={value}
                  active={availability === value}
                  label={label}
                  onClick={() => setAvailability(value)}
                />
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
              placeholder="Search name or organisation..."
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
            Loading volunteers…
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Organisation</TableHeader>
                <TableHeader>Skills</TableHeader>
                <TableHeader>Phone</TableHeader>
                <TableHeader>Verified</TableHeader>
                <TableHeader>Availability</TableHeader>
                <TableHeader>Can take a job</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {volunteers.map((volunteer) => (
                <TableRow key={volunteer.id}>
                  <TableCell>
                    <Link to={`/volunteers/${volunteer.id}`} style={{ color: 'var(--color-primary-navy)', fontWeight: 500 }}>
                      {volunteer.full_name ?? volunteer.email}
                    </Link>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                      {volunteer.email}
                    </div>
                  </TableCell>
                  <TableCell>{volunteer.organization ?? '—'}</TableCell>
                  <TableCell>
                    {volunteer.skills.length > 0 ? volunteer.skills.join(', ') : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                    )}
                  </TableCell>
                  <TableCell>{volunteer.phone_number ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={volunteer.is_verified ? 'success' : 'warning'}>
                      {volunteer.is_verified ? 'Approved' : 'Pending'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={volunteer.is_available ? 'success' : 'default'}>
                      {volunteer.is_available ? 'On duty' : 'Off duty'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {volunteer.can_assign ? (
                      <Badge variant="success">Yes</Badge>
                    ) : volunteer.has_active_assignment ? (
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                        On a job
                      </span>
                    ) : !volunteer.is_verified ? (
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                        Not approved
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                        Off duty
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {volunteers.length === 0 && (
                <TableRow>
                  <TableCell>
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      No volunteers found.
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

const ButtonFilter: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({
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
