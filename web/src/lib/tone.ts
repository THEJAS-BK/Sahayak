/**
 * The state model.
 *
 * Hue means lifecycle state and nothing else, so the four tones are the only
 * colours any component is allowed to reach for. Keeping the mapping in one file
 * is what stops the drift the codebase had: four copies of the status-to-badge
 * map, seven hand-rolled `rgba(220,38,38,0.08)` error banners sitting next to
 * three that used the token, and `priorityLabel` bypassed in two more places.
 */

import type { RequestStatus, VerificationStatus } from '../api/types';
import type React from 'react';

export type Tone = 'neutral' | 'success' | 'warning' | 'error';

interface ToneStyle {
  /** The tint to sit on. */
  background: string;
  /** The ink to read. Each pairing clears WCAG AA against its own tint. */
  color: string;
  /** A hairline for cases where the tint is too quiet to carry a boundary alone. */
  border: string;
}

export const toneStyles: Record<Tone, ToneStyle> = {
  neutral: {
    background: 'var(--color-neutral-tint)',
    color: 'var(--color-neutral-ink)',
    border: 'var(--color-rule)',
  },
  success: {
    background: 'var(--color-success-tint)',
    color: 'var(--color-success-ink)',
    border: 'var(--color-success-tint)',
  },
  warning: {
    background: 'var(--color-warning-tint)',
    color: 'var(--color-warning-ink)',
    border: 'var(--color-warning-tint)',
  },
  error: {
    background: 'var(--color-error-tint)',
    color: 'var(--color-error-ink)',
    border: 'var(--color-error-tint)',
  },
};

/** Swatch colour for legends, stacked bars and dot markers. */
export const toneSwatch: Record<Tone, string> = {
  neutral: 'var(--color-neutral-ink)',
  success: 'var(--color-success-ink)',
  warning: 'var(--color-warning-ink)',
  error: 'var(--color-error-ink)',
};

/**
 * Where a request sits decides what an officer should feel about it.
 *
 * COMPLETED is the only success: ACCEPTED and IN_PROGRESS are the healthy
 * middle of the lifecycle, not a win, and colouring them as a win would leave
 * nothing to escalate to. UNASSIGNED is grouped with CANCELLED as the two ways
 * a request ends with nobody helping.
 */
export const requestStatusTone = (status: RequestStatus): Tone => {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'PENDING':
    case 'MATCHING':
    case 'DISPATCHED':
      return 'warning';
    case 'CANCELLED':
    case 'UNASSIGNED':
      return 'error';
    case 'ACCEPTED':
    case 'IN_PROGRESS':
    default:
      return 'neutral';
  }
};

export const verificationStatusTone = (status: VerificationStatus): Tone => {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'error';
    case 'PENDING':
    default:
      return 'warning';
  }
};

/**
 * `NONE` means the senior has no verification record at all, which is a gap in
 * the process rather than a decision about the person — so it stays neutral
 * instead of borrowing the warning tint that "PENDING" uses.
 */
export const seniorVerificationTone = (status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE'): Tone =>
  status === 'NONE' ? 'neutral' : verificationStatusTone(status);

/**
 * LOGGED means an SOS is sitting unread, so it takes the same red as any other
 * unattended emergency. REVIEWED is not "resolved" — only that an officer saw it
 * — so it does not get the success tint, which would imply the situation closed.
 */
export const emergencyStatusTone = (status: 'LOGGED' | 'REVIEWED'): Tone =>
  status === 'LOGGED' ? 'error' : 'neutral';

/** Urgent is the only priority that earns colour. Normal is the absence of news. */
export const priorityTone = (priority: 'normal' | 'urgent'): Tone =>
  priority === 'urgent' ? 'error' : 'neutral';

export const yesNoTone = (value: boolean): Tone => (value ? 'success' : 'neutral');

/** The style for a bare `<span>` that needs a tone but no pill. */
export const toneText: Record<Tone, React.CSSProperties> = {
  neutral: { color: 'var(--color-ink-muted)' },
  success: { color: 'var(--color-success-ink)' },
  warning: { color: 'var(--color-warning-ink)' },
  error: { color: 'var(--color-error-ink)' },
};
