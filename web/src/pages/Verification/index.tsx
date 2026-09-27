import React, { useState } from 'react';
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
import { mockVerifications } from '../../data/mock';

export const Verification: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'All' | 'Senior' | 'Volunteer'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredData = mockVerifications.filter((record) => {
    const matchesTab = activeTab === 'All' || record.role === activeTab;
    const matchesSearch = record.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    return matchesTab && matchesSearch;
  });

  const pending = mockVerifications.filter((v) => v.status === 'PENDING').length;
  const approved = mockVerifications.filter((v) => v.status === 'APPROVED').length;
  const rejected = mockVerifications.filter((v) => v.status === 'REJECTED').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0 }}>
          Identity Verifications
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: '0.4rem 0 0' }}>
          Review senior citizen registrations and volunteer character verifications.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
        }}
      >
        <Card style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            Pending Review
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.35rem' }}>
            {pending}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            Approved
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.35rem' }}>
            {approved}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            Rejected / Returned
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.35rem' }}>
            {rejected}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            Total Submissions
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.35rem' }}>
            {mockVerifications.length}
          </div>
        </Card>
      </div>

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

          <Button variant="outline" size="sm">
            Export Log
          </Button>
        </div>

        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>ID</TableHeader>
              <TableHeader>Applicant</TableHeader>
              <TableHeader>Role</TableHeader>
              <TableHeader>Submitted</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Action</TableHeader>
            </TableRow>
          </TableHead>

          <TableBody>
            {filteredData.map((record) => (
              <TableRow key={record.id}>
                <TableCell>
                  <span style={{ fontWeight: 600 }}>{record.id}</span>
                </TableCell>

                <TableCell>
                  <span style={{ fontWeight: 500 }}>{record.name}</span>
                </TableCell>

                <TableCell>{record.role}</TableCell>

                <TableCell style={{ color: 'var(--color-text-secondary)' }}>
                  {record.submittedAt}
                </TableCell>

                <TableCell>
                  <Badge
                    variant={
                      record.status === 'APPROVED'
                        ? 'success'
                        : record.status === 'REJECTED'
                        ? 'error'
                        : 'warning'
                    }
                  >
                    {record.status}
                  </Badge>
                </TableCell>

                <TableCell>
                  <Button variant="outline" size="sm">
                    {record.status === 'PENDING' ? 'Review Dossier' : 'View Dossier'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};