export interface DashboardStats {
  openRequests: number;
  activeOperations: number;
  completedToday: number;
  urgentRequests: number;
}

export interface Activity {
  id: string;
  title: string;
  timestamp: string;
  type: 'request' | 'system' | 'alert';
}

export interface OpenRequest {
  id: string;
  caller: string;
  location: string;
  priority: 'High' | 'Medium' | 'Low';
  time: string;
}

export interface VerificationRecord {
  id: string;
  name: string;
  role: 'Senior' | 'Volunteer';
  submittedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export const mockDashboardStats: DashboardStats = {
  openRequests: 24,
  activeOperations: 8,
  completedToday: 142,
  urgentRequests: 3,
};

export const mockRecentActivity: Activity[] = [
  { id: '1', title: 'New volunteer registration: Rahul Sharma', timestamp: '5 mins ago', type: 'system' },
  { id: '2', title: 'Emergency alert resolved: Connaught Place', timestamp: '12 mins ago', type: 'alert' },
  { id: '3', title: 'Medication request completed', timestamp: '1 hour ago', type: 'request' },
  { id: '4', title: 'Senior profile update approved', timestamp: '2 hours ago', type: 'system' },
];

export const mockLatestRequests: OpenRequest[] = [
  { id: 'REQ-1024', caller: 'Anita Desai', location: 'Greater Kailash', priority: 'High', time: '10:45 AM' },
  { id: 'REQ-1025', caller: 'Ramesh Singh', location: 'Vasant Vihar', priority: 'Medium', time: '11:15 AM' },
  { id: 'REQ-1026', caller: 'Kamala Rao', location: 'Defense Colony', priority: 'Low', time: '12:00 PM' },
];

export const mockVerifications: VerificationRecord[] = [
  { id: 'V-001', name: 'Vikram Patel', role: 'Volunteer', submittedAt: '2026-09-22 09:30 AM', status: 'PENDING' },
  { id: 'V-002', name: 'Sunita Mehra', role: 'Senior', submittedAt: '2026-09-22 10:15 AM', status: 'PENDING' },
  { id: 'V-003', name: 'Amit Kumar', role: 'Volunteer', submittedAt: '2026-09-21 02:45 PM', status: 'APPROVED' },
  { id: 'V-004', name: 'Meena Gupta', role: 'Senior', submittedAt: '2026-09-21 11:20 AM', status: 'REJECTED' },
  { id: 'V-005', name: 'Rajiv Chawla', role: 'Volunteer', submittedAt: '2026-09-20 04:10 PM', status: 'APPROVED' },
];
