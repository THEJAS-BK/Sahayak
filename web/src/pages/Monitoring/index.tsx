import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { fetchPoliceRequests } from '../../api/client';
import type { PoliceRequest, RequestStatus } from '../../api/types';
import { Activity } from 'lucide-react';

const statusBadgeVariant: Record<RequestStatus, 'success' | 'warning' | 'error' | 'default'> = {
  COMPLETED: 'success',
  ACCEPTED: 'default',
  IN_PROGRESS: 'default',
  PENDING: 'warning',
  MATCHING: 'warning',
  DISPATCHED: 'warning',
  CANCELLED: 'error',
  UNASSIGNED: 'error',
};

const categoryLabels: Record<string, string> = {
  grocery_assistance: 'Grocery Assistance',
  medical_assistance: 'Medical Assistance',
  transport_assistance: 'Transport Assistance',
};

export const Monitoring: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'All' | RequestStatus>('All');
  const [priorityFilter, setPriorityFilter] = useState<'All' | 'URGENT' | 'NORMAL'>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [assignedFilter, setAssignedFilter] = useState<'All' | 'Assigned' | 'Unassigned'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    const loadData = () => {
      fetchPoliceRequests({ limit: '200' })
        .then((result) => setRequests(result.requests))
        .catch((err: unknown) => {
          if (!requests.length) {
            setError(err instanceof Error ? err.message : 'Failed to load requests');
          }
        })
        .finally(() => setLoading(false));
    };

    loadData();
    const intervalId = setInterval(loadData, 15000); // Poll every 15s
    return () => clearInterval(intervalId);
  }, [requests.length]);

  // Derived statistics based on exact requirements
  const pendingRequests = requests.filter(r => r.status === 'PENDING' || r.status === 'MATCHING');
  const operationalRequests = requests.filter(r => r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS');
  const unassignedRequests = requests.filter(r => r.status === 'DISPATCHED' || r.status === 'UNASSIGNED');

  const openRequests = [...pendingRequests, ...operationalRequests, ...unassignedRequests];
  const categories = useMemo(() => Array.from(new Set(openRequests.map(r => r.category))), [openRequests]);

  // Filtering for the latest open requests table
  const filteredRequests = openRequests.filter(req => {
    if (statusFilter !== 'All' && req.status !== statusFilter) return false;
    if (priorityFilter !== 'All' && req.priority !== (priorityFilter === 'URGENT' ? 'urgent' : 'normal')) return false;
    if (categoryFilter !== 'All' && req.category !== categoryFilter) return false;

    if (assignedFilter !== 'All') {
      const isAssigned = req.assigned_volunteer !== null;
      if (assignedFilter === 'Assigned' && !isAssigned) return false;
      if (assignedFilter === 'Unassigned' && isAssigned) return false;
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const seniorName = (req.senior.full_name ?? req.senior.email ?? '').toLowerCase();
      const volName = (req.assigned_volunteer?.full_name ?? '').toLowerCase();
      if (!seniorName.includes(q) && !volName.includes(q)) return false;
    }

    if (fromDate !== '') {
      if (new Date(req.created_at) < new Date(fromDate)) return false;
    }

    if (toDate !== '') {
      if (new Date(req.created_at) > new Date(toDate)) return false;
    }

    return true;
  });

  // Chart data setup (clean CSS-based stacked bar)
  const total = openRequests.length || 1;
  const pendingPct = (pendingRequests.length / total) * 100;
  const operationalPct = (operationalRequests.length / total) * 100;
  const unassignedPct = (unassignedRequests.length / total) * 100;

  return (
    <div className="flex flex-col gap-6 h-full pb-8">
      <div>
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2 text-gray-900">
          <Activity className="text-blue-600" size={32} /> Live Monitoring
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          Real-time operational overview of active assistance requests.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] rounded-md text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Card className="p-6 flex flex-col justify-center items-center text-center">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Current Open</span>
          <span className="text-4xl font-extrabold text-gray-900 mt-3">{openRequests.length}</span>
        </Card>
        <Card className="p-6 flex flex-col justify-center items-center text-center">
          <span className="text-xs font-bold text-yellow-600 uppercase tracking-wider">Pending</span>
          <span className="text-4xl font-extrabold text-gray-900 mt-3">{pendingRequests.length}</span>
        </Card>
        <Card className="p-6 flex flex-col justify-center items-center text-center">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Operational</span>
          <span className="text-4xl font-extrabold text-gray-900 mt-3">{operationalRequests.length}</span>
        </Card>
        <Card className="p-6 flex flex-col justify-center items-center text-center">
          <span className="text-xs font-bold text-[var(--color-status-error)] uppercase tracking-wider">Unassigned</span>
          <span className="text-4xl font-extrabold text-gray-900 mt-3">{unassignedRequests.length}</span>
        </Card>
      </div>

      {/* Operational Chart */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-5">Operational Status Distribution</h3>
        {openRequests.length === 0 ? (
          <div className="h-10 w-full bg-gray-100 rounded-full flex items-center justify-center text-xs text-gray-500">
            No active operations
          </div>
        ) : (
          <div className="w-full h-10 flex rounded-full overflow-hidden bg-gray-100 shadow-inner">
            <div style={{ width: `${pendingPct}%` }} className="bg-yellow-400 transition-all duration-700 ease-in-out hover:opacity-90" title={`Pending: ${pendingRequests.length}`} />
            <div style={{ width: `${operationalPct}%` }} className="bg-blue-500 transition-all duration-700 ease-in-out hover:opacity-90" title={`Operational: ${operationalRequests.length}`} />
            <div style={{ width: `${unassignedPct}%` }} className="bg-[var(--color-status-error)] transition-all duration-700 ease-in-out hover:opacity-90" title={`Unassigned: ${unassignedRequests.length}`} />
          </div>
        )}
        <div className="flex justify-start items-center mt-4 gap-6 text-xs text-gray-600 font-semibold uppercase tracking-wide">
          <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-400"/> Pending</span>
          <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"/> Operational</span>
          <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[var(--color-status-error)]"/> Unassigned</span>
        </div>
      </Card>

      {/* Latest Open Requests Table */}
      <Card>
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between flex-wrap gap-4 bg-gray-50/50">
          <h3 className="text-base font-semibold text-gray-900">Latest Open Requests</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Search senior/volunteer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            />
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="From Date"
            />
            <input
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="To Date"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | RequestStatus)}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="MATCHING">MATCHING</option>
              <option value="DISPATCHED">DISPATCHED</option>
              <option value="ACCEPTED">ACCEPTED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="UNASSIGNED">UNASSIGNED</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'All' | 'URGENT' | 'NORMAL')}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Priorities</option>
              <option value="URGENT">URGENT</option>
              <option value="NORMAL">NORMAL</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{categoryLabels[c] ?? c}</option>
              ))}
            </select>
            <select
              value={assignedFilter}
              onChange={(e) => setAssignedFilter(e.target.value as 'All' | 'Assigned' | 'Unassigned')}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">Any Assignment</option>
              <option value="Assigned">Assigned</option>
              <option value="Unassigned">Unassigned</option>
            </select>
          </div>
        </div>

        {loading && openRequests.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm font-medium">Fetching real-time operations...</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>ID</TableHeader>
                <TableHeader>Senior</TableHeader>
                <TableHeader>Category</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Priority</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRequests.map((req) => (
                <TableRow
                  key={req.id}
                  onClick={() => navigate(`/requests/${req.id}`)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <TableCell>
                    <span className="font-medium text-[var(--color-text-secondary)]">{req.id.slice(0, 8)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-gray-900">{req.senior.full_name ?? req.senior.email ?? 'Unknown'}</span>
                  </TableCell>
                  <TableCell className="text-gray-600 font-medium">
                    {categoryLabels[req.category] ?? req.category}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant[req.status]}>{req.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={req.priority === 'urgent' ? 'error' : 'default'}>
                      {req.priority.toUpperCase()}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {filteredRequests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <div className="p-10 text-center text-gray-500 text-sm">
                      No open requests match the current filters.
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
