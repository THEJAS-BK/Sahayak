export const REQUEST_STATUS = [
  'PENDING',
  'MATCHING',
  'DISPATCHED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'UNASSIGNED',
] as const

export type RequestStatus = (typeof REQUEST_STATUS)[number]

/** Single source of truth (BR-03, BR-04). Terminal states are immutable. */
const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING: ['MATCHING', 'CANCELLED'],
  MATCHING: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['ACCEPTED', 'CANCELLED', 'UNASSIGNED'],
  ACCEPTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  UNASSIGNED: [],
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export const ACTIVE_STATUSES: RequestStatus[] = ['PENDING', 'MATCHING', 'DISPATCHED', 'ACCEPTED', 'IN_PROGRESS']

/** Statuses in which the senior may view / Q-08 may expose the volunteer. */
export const ASSIGNMENT_STATUSES: RequestStatus[] = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED']