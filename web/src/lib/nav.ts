/**
 * The navigation model, in one place.
 *
 * The sidebar drew its own copy of this and the header drew none, which is why
 * the header sat empty across 60% of its width while all thirteen pages
 * repeated their own title underneath. One list, read by both.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';

export interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  /** React Router matches `/` against every sibling without this. */
  end?: boolean;
  /** Shown in the header under the title. Detail pages inherit their list's. */
  description?: string;
  group?: string;
}

export const menuItems: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: 'Dashboard',
    path: '/',
    end: true,
    description: 'Live operational picture across all jurisdictions',
  },
  {
    icon: ListChecks,
    label: 'Requests',
    path: '/requests',
    description: 'Help requests from seniors, newest first',
  },
  {
    icon: Activity,
    label: 'Monitoring',
    path: '/monitoring',
    description: 'Open requests, refreshed every 15 seconds',
  },
  {
    icon: AlertTriangle,
    label: 'Emergencies',
    path: '/emergencies',
    description: 'SOS events raised by voice and by the app',
  },
  { icon: ShieldCheck, label: 'Verification', path: '/verification', description: 'Registrations waiting on an officer' },
  { icon: Users, label: 'Seniors', path: '/seniors', description: 'Registered senior citizens' },
  { icon: Users, label: 'Volunteers', path: '/volunteers', description: 'Approved volunteers and their availability' },
  { icon: MapIcon, label: 'Map', path: '/map', description: 'Where requests and emergencies are sitting' },
  { icon: ScrollText, label: 'Audit Logs', path: '/audit-logs', description: 'Who changed what, and when' },
];

/** Sections, purely for grouping. Every item is a real, wired screen. */
export const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Operations', items: menuItems.slice(0, 4) },
  { label: 'People', items: menuItems.slice(4, 7) },
  { label: 'Oversight', items: menuItems.slice(7) },
];

/**
 * The title for a pathname, falling back to the closest parent so a detail page
 * is still labelled with the queue it belongs to.
 */
export const titleForPath = (pathname: string): { title: string; description?: string } => {
  const exact = menuItems.find((item) => item.end ? pathname === item.path : pathname === item.path);
  if (exact) return { title: exact.label, description: exact.description };

  const parent = [...menuItems]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => pathname.startsWith(`${item.path}/`));
  if (parent) return { title: parent.label, description: parent.description };

  return { title: 'Sahayak' };
};
