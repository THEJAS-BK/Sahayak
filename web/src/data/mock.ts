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

export type RequestStatus =
  | 'PENDING'
  | 'MATCHING'
  | 'DISPATCHED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'UNASSIGNED';

export type RequestPriority = 'NORMAL' | 'URGENT';

export interface RequestVolunteer {
  id: string;
  full_name: string;
  phone_number: string;
  organization?: string;
}

export interface HelpRequest {
  id: string;
  senior: { id: string; full_name: string; phone_number: string };
  category: string;
  description: string;
  priority: RequestPriority;
  source: string;
  status: RequestStatus;
  assigned_volunteer: RequestVolunteer | null;
  created_at: string;
}

export interface TimelineEntry {
  status: RequestStatus;
  at: string;
  note: string;
}

export interface HelpRequestDetail extends HelpRequest {
  timeline: TimelineEntry[];
  dispatched_at?: string;
  accepted_at?: string;
  completed_at?: string;
  cancelled_at?: string;
}

export const mockRequests: HelpRequest[] = [
  {
    id: 'req-1024',
    senior: { id: 'sen-0001', full_name: 'Anitha Devi', phone_number: '+919876500001' },
    category: 'grocery_assistance',
    description: 'Need help buying groceries for the week',
    priority: 'NORMAL',
    source: 'voice_agent',
    status: 'IN_PROGRESS',
    assigned_volunteer: { id: 'vol-0001', full_name: 'Karthik Shetty', phone_number: '+919876500021', organization: 'Udupi Red Cross' },
    created_at: '2026-09-17T18:42:00Z',
  },
  {
    id: 'req-1023',
    senior: { id: 'sen-0002', full_name: 'Lakshmi Shetty', phone_number: '+919876500002' },
    category: 'medical_assistance',
    description: 'Sudden chest pain, needs a ride to KMC Hospital',
    priority: 'URGENT',
    source: 'voice_agent',
    status: 'DISPATCHED',
    assigned_volunteer: null,
    created_at: '2026-09-17T19:02:00Z',
  },
  {
    id: 'req-1022',
    senior: { id: 'sen-0003', full_name: 'Ravi Kumar', phone_number: '+919876500003' },
    category: 'transport_assistance',
    description: 'Need transport to the bank in Udupi',
    priority: 'NORMAL',
    source: 'flutter_app',
    status: 'DISPATCHED',
    assigned_volunteer: null,
    created_at: '2026-09-17T18:20:00Z',
  },
  {
    id: 'req-1021',
    senior: { id: 'sen-0004', full_name: 'Meenakshi Bhat', phone_number: '+919876500004' },
    category: 'medical_assistance',
    description: 'Fever since two days, needs checkup',
    priority: 'URGENT',
    source: 'voice_agent',
    status: 'MATCHING',
    assigned_volunteer: null,
    created_at: '2026-09-17T17:55:00Z',
  },
  {
    id: 'req-1020',
    senior: { id: 'sen-0005', full_name: 'Ganesh Rao', phone_number: '+919876500005' },
    category: 'grocery_assistance',
    description: 'Weekly groceries, medicines from pharmacy',
    priority: 'NORMAL',
    source: 'flutter_app',
    status: 'PENDING',
    assigned_volunteer: null,
    created_at: '2026-09-17T17:30:00Z',
  },
  {
    id: 'req-1010',
    senior: { id: 'sen-0001', full_name: 'Anitha Devi', phone_number: '+919876500001' },
    category: 'medical_assistance',
    description: 'Need a ride to the clinic for a check-up',
    priority: 'URGENT',
    source: 'flutter_app',
    status: 'COMPLETED',
    assigned_volunteer: { id: 'vol-0002', full_name: 'Sunitha Rai', phone_number: '+919876500022' },
    created_at: '2026-09-12T08:15:00Z',
  },
  {
    id: 'req-0981',
    senior: { id: 'sen-0003', full_name: 'Ravi Kumar', phone_number: '+919876500003' },
    category: 'transport_assistance',
    description: 'Ride to the temple for a family function',
    priority: 'NORMAL',
    source: 'flutter_app',
    status: 'COMPLETED',
    assigned_volunteer: { id: 'vol-0003', full_name: 'Prashanth Kamath', phone_number: '+919876500023' },
    created_at: '2026-09-08T07:00:00Z',
  },
  {
    id: 'req-0975',
    senior: { id: 'sen-0004', full_name: 'Meenakshi Bhat', phone_number: '+919876500004' },
    category: 'grocery_assistance',
    description: 'Emergency groceries - no longer needed',
    priority: 'NORMAL',
    source: 'flutter_app',
    status: 'CANCELLED',
    assigned_volunteer: null,
    created_at: '2026-09-05T15:40:00Z',
  },
  {
    id: 'req-0968',
    senior: { id: 'sen-0005', full_name: 'Ganesh Rao', phone_number: '+919876500005' },
    category: 'transport_assistance',
    description: 'Ride to Udupi D.C. office, no volunteer found',
    priority: 'URGENT',
    source: 'voice_agent',
    status: 'UNASSIGNED',
    assigned_volunteer: null,
    created_at: '2026-08-30T14:00:00Z',
  },
];

export const mockRequestDetail: HelpRequestDetail = {
  id: 'req-1023',
  senior: { id: 'sen-0002', full_name: 'Lakshmi Shetty', phone_number: '+919876500002' },
  category: 'medical_assistance',
  description: 'Sudden chest pain, needs a ride to KMC Hospital',
  priority: 'URGENT',
  source: 'voice_agent',
  status: 'DISPATCHED',
  assigned_volunteer: null,
  created_at: '2026-09-17T19:02:00Z',
  dispatched_at: '2026-09-17T19:03:00Z',
  timeline: [
    { status: 'PENDING', at: '2026-09-17T19:02:00Z', note: 'request.created by senior' },
    { status: 'MATCHING', at: '2026-09-17T19:02:00Z', note: 'matching ran synchronously' },
    { status: 'DISPATCHED', at: '2026-09-17T19:03:00Z', note: 'dispatched to 2 volunteers (batch 1)' },
  ],
};
