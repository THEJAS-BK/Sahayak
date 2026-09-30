import React, { useId } from 'react';
import { control } from '../../lib/styles';

interface FieldProps {
  label: string;
  children: (props: { id: string; style: React.CSSProperties }) => React.ReactNode;
  hint?: string;
  /** Visually hides the label when the control has an icon or a placeholder that
   * already says what it is. The hint still gets associated. */
  hideLabel?: boolean;
}

/**
 * A label and a control that are actually connected.
 *
 * Five filter toolbars across the app had selects and inputs with an
 * `aria-label` but no visible label, at three different sizes. This is the one
 * pairing, and the id is generated so a caller cannot forget to match them.
 */
export const Field: React.FC<FieldProps> = ({ label, children, hint, hideLabel = false }) => {
  const id = useId();
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label
        htmlFor={id}
        className={hideLabel ? 'sr-only' : undefined}
        style={{
          fontSize: 'var(--text-meta)',
          fontWeight: 500,
          color: 'var(--color-ink-muted)',
        }}
      >
        {label}
      </label>
      {children({ id, style: control })}
      {hint && (
        <span style={{ fontSize: 'var(--text-label)', color: 'var(--color-ink-muted)' }}>{hint}</span>
      )}
    </div>
  );
};
