import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { mockVerifications } from '../../data/mock';
import { Search } from 'lucide-react';

export const Verification: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'All' | 'Senior' | 'Volunteer'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredData = mockVerifications.filter((record) => {
    const matchesTab = activeTab === 'All' || record.role === activeTab;
    const matchesSearch = record.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Verification Queue</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Review and approve senior and volunteer registrations.</p>
      </div>

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
                  <span style={{ fontWeight: 500 }}>{record.name}</span>
                </TableCell>
                <TableCell>{record.role}</TableCell>
                <TableCell style={{ color: 'var(--color-text-secondary)' }}>{record.submittedAt}</TableCell>
                <TableCell>
                  <Badge variant={record.status === 'APPROVED' ? 'success' : record.status === 'REJECTED' ? 'error' : 'warning'}>
                    {record.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm">Review</Button>
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
      </Card>
    </div>
  );
};
