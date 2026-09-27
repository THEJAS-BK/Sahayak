import React from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { mockDashboardStats, mockLatestRequests } from '../../data/mock';
import { Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export const Dashboard: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}
    >
      {/* Header */}
      <div>
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 700,
            margin: 0,
          }}
        >
          Overall Situation
        </h1>

        <p
          style={{
            color: 'var(--color-text-secondary)',
            margin: '0.4rem 0 0',
          }}
        >
          Live operational picture across all jurisdictions
        </p>
      </div>

      {/* Live Status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '-3rem',
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '0.4rem 0.75rem',
            borderRadius: '999px',
            background: '#ecfdf5',
            color: '#047857',
          }}
        >
          ● LIVE • UPDATED 10:48 AM
        </span>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
        }}
      >
        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Open Requests
            </span>
            <Clock size={18} />
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.4rem' }}>
            {mockDashboardStats.openRequests}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Active Operations
            </span>
            <Activity size={18} />
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.4rem' }}>
            {mockDashboardStats.activeOperations}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Completed Today
            </span>
            <CheckCircle size={18} />
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.4rem' }}>
            {mockDashboardStats.completedToday}
          </div>
        </Card>

        <Card style={{ padding: '1rem 1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Urgent Requests
            </span>
            <AlertCircle size={18} />
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.4rem' }}>
            {mockDashboardStats.urgentRequests}
          </div>
        </Card>
      </div>

      {/* Latest Requests */}
      <Card>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '1rem',
              fontWeight: 600,
            }}
          >
            Latest Open Requests
          </h2>

          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-primary-navy)',
              fontWeight: 600,
            }}
          >
            View all requests →
          </span>
        </div>

        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Request</TableHeader>
              <TableHeader>Caller</TableHeader>
              <TableHeader>Location</TableHeader>
              <TableHeader>Received</TableHeader>
              <TableHeader>Priority</TableHeader>
              <TableHeader>Action</TableHeader>
            </TableRow>
          </TableHead>

          <TableBody>
            {mockLatestRequests.map((req) => (
              <TableRow key={req.id}>
                <TableCell>
                  <span style={{ fontWeight: 600 }}>{req.id}</span>
                </TableCell>

                <TableCell>{req.caller}</TableCell>

                <TableCell>{req.location}</TableCell>

                <TableCell
                  style={{
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {req.time}
                </TableCell>

                <TableCell>
                  <Badge
                    variant={
                      req.priority === 'High'
                        ? 'error'
                        : req.priority === 'Medium'
                        ? 'warning'
                        : 'success'
                    }
                  >
                    {req.priority}
                  </Badge>
                </TableCell>

                <TableCell>
                  <button
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-primary-navy)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    View
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};