import React, { useCallback, useEffect, useState } from 'react';
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
import { fetchAssignableVolunteers } from '../../api/client';
import type { AssignableVolunteer } from '../../api/types';
import { toneText } from '../../lib/tone';
import { pageStack } from '../../lib/styles';

type AvailabilityFilter = 'all' | 'true' | 'false';

const AVAILABILITY_VIEWS: Array<{ value: AvailabilityFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'true', label: 'Available' },
  { value: 'false', label: 'Unavailable' },
];

/**
 * P-04, list only.
 *
 * There is no distance column on purpose. `base_*` is whatever the volunteer
 * typed at registration — often just a locality — and `current_*` only exists
 * once live position updates ship, so sorting by it would be false precision.
 * `can_assign` from the server is the column that matters.
 */

/** The server's `can_assign` verdict, explained rather than left as a plain No. */
function availabilityReason(v: AssignableVolunteer): string {
  if (v.can_assign) return 'Ready';
  if (!v.is_verified) return 'Not approved';
  if (v.has_active_assignment) return 'On a job';
  if (!v.is_available) return 'Off duty';
  return 'Not available';
}

export const Volunteers: React.FC = () => {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [volunteers, setVolunteers] = useState<AssignableVolunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAssignableVolunteers({
        ...(appliedSearch ? { search: appliedSearch } : {}),
        ...(availability === 'all' ? {} : { available: availability }),
      });
      setVolunteers(result.volunteers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load volunteers');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, availability]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={pageStack}>
      {error && <Alert onRetry={() => void load()}>{error}</Alert>}

      <Card flush>
        {/* The 0.625rem gutter is the dense table cell padding, so the title,
            the filters and the first column of the table share one left edge. */}
        <div style={{ padding: '0.875rem 0.625rem', borderBottom: '1px solid var(--color-rule)' }}>
          <Section
            title="Registered volunteers"
            description="Whether each one can take a job right now. Ordered by readiness by the API."
            unbordered
            actions={
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {AVAILABILITY_VIEWS.map((view) => (
                  <FilterChip
                    key={view.value}
                    group="Availability"
                    label={view.label}
                    active={availability === view.value}
                    onClick={() => setAvailability(view.value)}
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
                label="Search volunteers"
                placeholder="Search name or organisation…"
                width="260px"
              />
              <Button type="submit" size="sm" variant="outline">
                Search
              </Button>
            </form>
          </Section>
        </div>

        {loading && volunteers.length === 0 ? (
          <SkeletonTable columns={7} rows={8} />
        ) : (
          <Table density="dense" stickyHeader>
            <TableCaption>
              Registered volunteers and their current availability. Each name links to the
              volunteer's record.
            </TableCaption>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Organisation</TableHeader>
                <TableHeader>Skills</TableHeader>
                <TableHeader>Phone</TableHeader>
                <TableHeader>Approval</TableHeader>
                <TableHeader>Duty</TableHeader>
                <TableHeader>Can take a job</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {volunteers.map((volunteer) => (
                <TableRow key={volunteer.id}>
                  <TableCell>
                    <Link
                      to={`/volunteers/${volunteer.id}`}
                      style={{ fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                    >
                      {volunteer.full_name ?? volunteer.email}
                    </Link>
                    <div style={{ ...toneText.neutral, fontSize: 'var(--text-meta)' }}>
                      {volunteer.email}
                    </div>
                  </TableCell>
                  <TableCell style={toneText.neutral}>{volunteer.organization ?? '—'}</TableCell>
                  <TableCell style={toneText.neutral}>
                    {volunteer.skills.length > 0 ? volunteer.skills.join(', ') : '—'}
                  </TableCell>
                  <TableCell>
                    {volunteer.phone_number ?? <span style={toneText.neutral}>Not provided</span>}
                  </TableCell>
                  <TableCell>
                    <Badge tone={volunteer.is_verified ? 'success' : 'warning'} dot>
                      {volunteer.is_verified ? 'Approved' : 'Pending'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge tone={volunteer.is_available ? 'success' : 'neutral'} dot>
                      {volunteer.is_available ? 'On duty' : 'Off duty'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {/* The last column is the server's P-05 verdict. It is spelled
                        out as a reason rather than a bare "No", because the
                        assign dialog needs the same distinction and the two must
                        not disagree. */}
                    {volunteer.can_assign ? (
                      <Badge tone="success" dot>
                        Ready
                      </Badge>
                    ) : (
                      <span style={toneText.neutral}>{availabilityReason(volunteer)}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {volunteers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      title="No volunteer matches this filter"
                      description={
                        appliedSearch
                          ? `Nothing matched “${appliedSearch}”.`
                          : availability === 'true'
                            ? 'No volunteer is currently on duty and free.'
                            : 'No volunteer is registered yet.'
                      }
                      action={
                        appliedSearch || availability !== 'all' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSearch('');
                              setAppliedSearch('');
                              setAvailability('all');
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
        )}
      </Card>
    </div>
  );
};
