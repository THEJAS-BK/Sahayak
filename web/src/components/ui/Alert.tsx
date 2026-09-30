import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { toneStyles, type Tone } from '../../lib/tone';

interface AlertProps {
  children: React.ReactNode;
  tone?: Tone;
  /**
   * Rendered under the message: what to do about it. A banner that only says
   * "Failed to fetch" leaves the officer to work out whether to retry, wait, or
   * reload the browser.
   */
  hint?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  /**
   * `note` is for a standing caveat that is not a failure — the base-coordinates
   * warning, for instance. It should reach a screen reader but must not be
   * announced assertively, or a page that mounts with one shoves every other
   * announcement off the queue.
   */
  role?: 'alert' | 'status' | 'note';
  /** Forces the live-region politeness; defaults from the tone. */
  live?: 'polite' | 'assertive' | 'off';
}

const ICONS: Record<Tone, React.ReactNode> = {
  neutral: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  error: <AlertTriangle size={16} />,
};

/**
 * The one banner. Eleven of the thirteen pages had a hand-rolled error strip and
 * only Monitoring offered a Retry, so a failed load was a dead end that needed a
 * browser refresh. `onRetry` is therefore the thing to reach for first.
 */
export const Alert: React.FC<AlertProps> = ({
  children,
  tone = 'error',
  hint,
  onRetry,
  onDismiss,
  role = tone === 'error' ? 'alert' : 'status',
  live,
}) => {
  const colors = toneStyles[tone];
  return (
    <div
      // `note` is not a valid ARIA role, so it degrades to a plain container
      // that is still announced politely via aria-live.
      role={role === 'note' ? undefined : role}
      aria-live={live ?? (role === 'note' ? 'polite' : undefined)}
      aria-atomic={role === 'alert' || undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.625rem',
        padding: '0.75rem 0.875rem',
        borderRadius: 'var(--radius-control)',
        background: colors.background,
        borderLeft: `3px solid ${colors.color}`,
        color: colors.color,
        fontSize: 'var(--text-body)',
        lineHeight: 'var(--text-body--line-height)',
      }}
    >
      <span aria-hidden="true" style={{ marginTop: '0.125rem', flexShrink: 0 }}>
        {ICONS[tone]}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--color-ink)' }}>{children}</div>
        {hint && (
          <div style={{ marginTop: '0.25rem', fontSize: 'var(--text-meta)', color: colors.color }}>
            {hint}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-control)',
              border: `1px solid ${colors.color}`,
              background: 'none',
              color: colors.color,
              fontFamily: 'inherit',
              fontSize: 'var(--text-meta)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
              display: 'inline-flex',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: colors.color,
              padding: '0.125rem',
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
