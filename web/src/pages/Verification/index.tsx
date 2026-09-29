import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { fetchVerifications, reviewVerification } from '../../api/client';
import type {
  VerificationSummary,
  VerificationStatus,
} from '../../api/types';

const roleLabel = (role: string) =>
  role === 'senior'
    ? 'Senior'
    : role === 'volunteer'
      ? 'Volunteer'
      : role;

const statusVariant: Record<
  VerificationStatus,
  'success' | 'warning' | 'error'
> = {
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

  const [searchQuery, setSearchQuery] = useState('');
  const [records, setRecords] = useState<VerificationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchVerifications()
      .then((result) => setRecords(result.verifications))
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load verifications',
        );
        setRecords([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (
    id: string,
    status: 'APPROVED' | 'REJECTED',
  ) => {
    setBusyId(id);
    setError(null);

    try {
      await reviewVerification(id, status);

      setRecords((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status,
                reviewed_at: new Date().toISOString(),
              }
            : r,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update verification',
      );
    } finally {
      setBusyId(null);
    }
  };

  const filteredData = records.filter((record) => {
    const matchesTab =
      activeTab === 'All' ||
      (activeTab === 'Senior' && record.role === 'senior') ||
      (activeTab === 'Volunteer' && record.role === 'volunteer');

    const matchesSearch = (record.full_name ?? '')
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    return matchesTab && matchesSearch;
  });

  const pending = records.filter((v) => v.status === 'PENDING').length;
  const approved = records.filter((v) => v.status === 'APPROVED').length;
  const rejected = records.filter((v) => v.status === 'REJECTED').length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 700,
            margin: 0,
          }}
        >
          Identity Verifications
        </h1>

        <p
          style={{
            color: 'var(--color-text-secondary)',
            margin: '0.4rem 0 0',
          }}
        >
          Review senior citizen registrations and volunteer character
          verifications.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            backgroundColor: 'rgba(220,38,38,0.08)',
            color: 'var(--color-status-error)',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Verification Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
        }}
      >
        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            Pending
          </div>

          <div
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              marginTop: '0.35rem',
            }}
          >
            {pending}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            Approved
          </div>

          <div
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              marginTop: '0.35rem',
            }}
          >
            {approved}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            Rejected / Returned
          </div>

          <div
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              marginTop: '0.35rem',
            }}
          >
            {rejected}
          </div>
        </Card>
      </div>

      {/* Verification List */}
      <Card>
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
          <input
            type="text"
            placeholder="Search by applicant name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: '220px',
              padding: '0.55rem 0.75rem',
              border: '1px solid var(--color-border)',
              borderRadius: '0.375rem',
              fontFamily: 'inherit',
            }}
          />

          <Button
            variant={activeTab === 'All' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('All')}
          >
            All Types
          </Button>

          <Button
            variant={activeTab === 'Senior' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('Senior')}
          >
            Seniors
          </Button>

          <Button
            variant={activeTab === 'Volunteer' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('Volunteer')}
          >
            Volunteers
          </Button>
        </div>

        {loading && (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--color-text-secondary)',
            }}
          >
            Loading verifications…
          </div>
        )}

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

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === record.id}
                          style={{
                            color: 'var(--color-status-error)',
                          }}
                          onClick={() =>
                            updateStatus(record.id, 'REJECTED')
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span
                        style={{
                          color: 'var(--color-text-secondary)',
                          fontSize: '0.875rem',
                        }}
                      >
                        —
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {filteredData.length === 0 && (
                <TableRow>
                  <TableCell>
                    <div
                      style={{
                        padding: '2rem',
                        textAlign: 'center',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      No records found.
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