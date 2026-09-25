import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { fetchVerifications, reviewVerification } from '../../api/client';
import type { VerificationSummary, VerificationStatus } from '../../api/types';
import { Search } from 'lucide-react';

const roleLabel = (role: string) => (role === 'senior' ? 'Senior' : role === 'volunteer' ? 'Volunteer' : role);

const statusVariant: Record<VerificationStatus, 'success' | 'warning' | 'error'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'error',
};

const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const Verification: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'All' | 'Senior' | 'Volunteer'>('All');
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
        setError(err instanceof Error ? err.message : 'Failed to load verifications');
        setRecords([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setBusyId(id);
    setError(null);
    try {
      await reviewVerification(id, status);
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status, reviewed_at: new Date().toISOString() } : r)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update verification');
    } finally {
      setBusyId(null);
    }
  };

  const filteredData = records.filter((record) => {
    const matchesTab =
      activeTab === 'All' ||
      (activeTab === 'Senior' && record.role === 'senior') ||
      (activeTab === 'Volunteer' && record.role === 'volunteer');
    const matchesSearch = (record.full_name ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Verification Queue</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Review and approve senior and volunteer registrations.</p>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.375rem', backgroundColor: 'rgba(220,38,38,0.08)', color: 'var(--color-status-error)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <Card>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant={activeTab === 'All' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('All')}
            >
              All
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

          <div style={{ position: 'relative', width: '250px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
          </div>
        </div>

        {loading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Loading verifications…</div>
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
                    <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>{record.id}</span>
                  </TableCell>
                  <TableCell>
                    <span style={{ fontWeight: 500 }}>{record.full_name ?? record.email}</span>
                  </TableCell>
                  <TableCell>{roleLabel(record.role)}</TableCell>
                  <TableCell style={{ color: 'var(--color-text-secondary)' }}>{formatDate(record.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[record.status]}>{record.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {record.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button variant="outline" size="sm" disabled={busyId === record.id} onClick={() => updateStatus(record.id, 'APPROVED')}>Accept</Button>
                        <Button variant="outline" size="sm" disabled={busyId === record.id} style={{ color: 'var(--color-status-error)' }} onClick={() => updateStatus(record.id, 'REJECTED')}>Reject</Button>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredData.length === 0 && (
                <TableRow>
                  <TableCell>
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
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