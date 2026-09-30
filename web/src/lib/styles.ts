/**
 * Shared style objects.
 *
 * The app is written in inline styles, so the token layer has to be usable from
 * a `style={{}}` prop as well as from CSS. These are the objects that used to
 * be re-declared per page — most painfully the form control, which existed in
 * five files at three different paddings and two font sizes, so the same
 * `<select>` was a different size on Requests and on Monitoring.
 */

import type React from 'react';

/** Ink, not a status. A focus ring that reused a state hue is a ring officers learn to ignore. */
export const FOCUS_RING =
  '0 0 0 2px var(--color-raised), 0 0 0 4px var(--color-focus)';

/**
 * The one form control. Inputs, selects and textareas all resolve to this, so a
 * filter row is visually a single instrument.
 */
export const control: React.CSSProperties = {
  padding: '0.4375rem 0.625rem',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--color-rule)',
  background: 'var(--color-raised)',
  color: 'var(--color-ink)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-body)',
  lineHeight: 'var(--text-body--line-height)',
  minHeight: '2rem',
};

/** A 1px separator. Sections are a title and a rule; they are not boxes. */
export const hairline: React.CSSProperties = {
  borderBottom: '1px solid var(--color-rule)',
};

export const hairlineTop: React.CSSProperties = {
  borderTop: '1px solid var(--color-rule)',
};

/** A vertical stack of page sections on one spacing step. */
export const pageStack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

/** Cards and table panels. Deliberately not a shadow-sm + border on everything. */
export const panel: React.CSSProperties = {
  background: 'var(--color-raised)',
  borderRadius: 'var(--radius-panel)',
  boxShadow: 'var(--shadow-raised)',
};

/** Dialog backdrop. Was triplicated as a raw rgba() at three different call sites. */
export const scrim: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(19, 26, 38, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
  zIndex: 100,
};

/** The two hues a filter control needs to look interactive. */
export const controlInteractive: React.CSSProperties = {
  ...control,
  cursor: 'pointer',
  appearance: 'none',
  paddingRight: '1.5rem',
  backgroundImage:
    "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5L6 8l3.5-3.5' fill='none' stroke='%235F6B7A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.5rem center',
};
