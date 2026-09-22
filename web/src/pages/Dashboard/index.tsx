import React from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { mockDashboardStats, mockLatestRequests, mockRecentActivity } from '../../data/mock';
import { Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export const Dashboard: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Dashboard Overview</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Monitor active requests and recent system activity.</p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
        <Card style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Open Requests</h3>
            <Clock size={20} color="var(--color-status-warning)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{mockDashboardStats.openRequests}</div>
        </Card>

        <Card style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Active Operations</h3>
            <Activity size={20} color="var(--color-text-primary)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{mockDashboardStats.activeOperations}</div>
        </Card>

        <Card style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Completed Today</h3>
            <CheckCircle size={20} color="var(--color-status-success)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{mockDashboardStats.completedToday}</div>
        </Card>

        <Card style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Urgent Requests</h3>
            <AlertCircle size={20} color="var(--color-status-error)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{mockDashboardStats.urgentRequests}</div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Latest Requests Table */}
        <Card>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Latest Open Requests</h2>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>ID</TableHeader>
                <TableHeader>Caller</TableHeader>
                <TableHeader>Location</TableHeader>
                <TableHeader>Priority</TableHeader>
                <TableHeader>Time</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {mockLatestRequests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <span style={{ fontWeight: 500 }}>{req.id}</span>
                  </TableCell>
                  <TableCell>{req.caller}</TableCell>
                  <TableCell>{req.location}</TableCell>
                  <TableCell>
                    <Badge variant={req.priority === 'High' ? 'error' : req.priority === 'Medium' ? 'warning' : 'success'}>
                      {req.priority}
                    </Badge>
                  </TableCell>
                  <TableCell style={{ color: 'var(--color-text-secondary)' }}>{req.time}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Recent Activity Feed */}
        <Card>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Recent Activity</h2>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {mockRecentActivity.map((activity) => (
              <div key={activity.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{
                  marginTop: '0.25rem',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: activity.type === 'alert' ? 'var(--color-status-error)' : 'var(--color-primary-navy)'
                }} />
                <div>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', fontWeight: 500 }}>{activity.title}</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{activity.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
