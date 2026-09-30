import React from 'react';
import { toneStyles, type Tone } from '../../lib/tone';

interface BadgeProps {
  children: React.ReactNode;
  tone?: Tone;
  /**
   * A leading dot. Status is currently encoded by colour alone, which fails
   * anyone who cannot separate the four tints — the dot is the redundant cue.
   */
  dot?: boolean;
  /**
   * Uppercase, and reserved for state. The old Badge uppercased everything,
   * which made a category name shout as loudly as an SOS. This is opt-in and
   * only set where the thing really is a state.
   */
  state?: boolean;
  title?: string;
}

/**
 * A state pill. Four tones, no more, because hue means lifecycle and there are
 * only four answers to "how is this going".
 */
export const Badge: React.FC<BadgeProps> = ({
  children,
  tone = 'neutral',
  dot = false,
  state = false,
  title,
}) => {
  const colors = toneStyles[tone];
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dot ? '0.375rem' : 0,
        background: colors.background,
        color: colors.color,
        border: `1px solid ${colors.border}`,
        padding: dot ? '0.125rem 0.5rem 0.125rem 0.375rem' : '0.1875rem 0.5rem',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-meta)',
        fontWeight: 600,
        letterSpacing: state ? '0.04em' : 0,
        textTransform: state ? 'uppercase' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: '0.375rem',
            height: '0.375rem',
            borderRadius: '50%',
            background: colors.color,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
};
