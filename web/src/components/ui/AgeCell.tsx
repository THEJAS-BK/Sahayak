import React from 'react';
import { elapsedLabel, isOpenStatus, waitTone } from '../../lib/format';
import { toneText } from '../../lib/tone';
import type { RequestStatus } from '../../api/types';

interface AgeCellProps {
  createdAt: string | null | undefined;
  status: RequestStatus;
  /**
   * The time the surrounding data was fetched. Required.
   *
   * Taken from the fetch rather than read from `Date.now()` at render, so the
   * age is tied to the freshness of the row it describes: a board that polls
   * every 15 seconds should not also claim an age 15 seconds more optimistic
   * than the data behind it. There is no fallback, because a fallback would
   * quietly reintroduce exactly that drift on whichever caller forgot to pass
   * one.
   */
  now: number;
  /** The absolute timestamp, for the tooltip. */
  showAbsolute?: boolean;
}

/**
 * How long this person has been waiting.
 *
 * The single most-asked question on a help request, and it was previously a
 * formatted timestamp in a column indistinguishable from the ID next to it. It
 * leads instead, and escalates by age: under half an hour is routine, half an
 * hour is worth a look, two hours is not.
 *
 * A completed or cancelled request is not waiting for anything, so it never
 * escalates — the colour on a finished job would be a lie.
 */
export const AgeCell: React.FC<AgeCellProps> = ({
  createdAt,
  status,
  now,
  showAbsolute = true,
}) => {
  const elapsed = elapsedLabel(createdAt, now);
  if (!elapsed) return <span style={{ color: 'var(--color-ink-muted)' }}>—</span>;

  const tone = isOpenStatus(status) ? waitTone(createdAt, now) : 'neutral';

  return (
    <span
      className="tnum"
      title={showAbsolute && createdAt ? new Date(createdAt).toLocaleString() : undefined}
      style={{ whiteSpace: 'nowrap', fontWeight: tone === 'neutral' ? 400 : 600, ...toneText[tone] }}
    >
      {elapsed}
    </span>
  );
};
