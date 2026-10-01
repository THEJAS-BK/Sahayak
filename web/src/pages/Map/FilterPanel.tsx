import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, RotateCcw } from 'lucide-react';
import type { EmergencyEvent, PoliceRequest, RequestStatus } from '../../api/types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { SearchInput } from '../../components/ui/SearchInput';
import { elapsedLabel, OPEN_STATUSES, statusLabel, triggerLabel, waitTone } from '../../lib/format';
import { emergencyStatusTone, requestStatusTone, toneText } from '../../lib/tone';
import { controlInteractive } from '../../lib/styles';
import { requestSummary, type PlottedItem, type Selection } from './mapItems';

interface FilterPanelProps {
  open: boolean;
  onToggle: () => void;
  search: string;
  onSearch: (value: string) => void;
  statusFilter: 'All' | RequestStatus;
  onStatus: (value: 'All' | RequestStatus) => void;
  priorityFilter: 'All' | 'URGENT' | 'NORMAL';
  onPriority: (value: 'All' | 'URGENT' | 'NORMAL') => void;
  sosFilter: 'ALL' | 'LOGGED' | 'REVIEWED';
  onSos: (value: 'ALL' | 'LOGGED' | 'REVIEWED') => void;
  fromDate: string;
  onFrom: (value: string) => void;
  toDate: string;
  onTo: (value: string) => void;
  hasFilters: boolean;
  onClear: () => void;
  items: PlottedItem[];
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  busy: boolean;
  unlocated: number;
  onFitAll: () => void;
}

/**
 * Fixed row height. The list paginates instead of scrolling, so this has to be a
 * real number the layout can be measured against — see `useRowBudget` below.
 */
const ROW_HEIGHT = 58;

/**
 * The map's side panel: filters, then the list of what is plotted.
 *
 * A list beside a map is not a duplicate of it. On a map, two records at the
 * same spot are one dot, and the officer cannot read a status, a name or a phone
 * number off a 20px circle — so the pins answer "where", and this answers "which
 * one am I looking at". Every row is also the way to reach a record the cluster
 * swallowed: the row selects it, which opens its marker and popup.
 *
 * Nothing here scrolls. Every scrollable region in a panel that floats over a map
 * draws its bar on top of the tiles, and two stacked bars inside one panel read
 * as a layout fault rather than a choice. So the list paginates to whatever the
 * panel's own height allows, and the filters above it are sized to fit outright.
 * The one region that can still overflow — the list, at up to 200 rows — is
 * reachable by wheel, keyboard and the pager, so hiding the bar costs nothing.
 */
export const FilterPanel: React.FC<FilterPanelProps> = ({
  open,
  onToggle,
  search,
  onSearch,
  statusFilter,
  onStatus,
  priorityFilter,
  onPriority,
  sosFilter,
  onSos,
  fromDate,
  onFrom,
  toDate,
  onTo,
  hasFilters,
  onClear,
  items,
  selection,
  onSelect,
  busy,
  unlocated,
  onFitAll,
}) => {
  const selectedKey = selection ? `${selection.kind}:${selection.id}` : null;

  // Unreviewed SOS first, then requests, then reviewed SOS. This is the order an
  // officer works the queue in, and the map cannot express it — a red pin and a
  // blue pin are equally one dot.
  const ordered = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.pulse !== b.pulse) return a.pulse ? -1 : 1;
        const aTime = new Date(a.data.created_at).getTime();
        const bTime = new Date(b.data.created_at).getTime();
        return bTime - aTime;
      }),
    [items],
  );

  const { rowBudget, listRef } = useRowBudget(open, ROW_HEIGHT);
  const pageCount = Math.max(1, Math.ceil(ordered.length / rowBudget));
  const [page, setPage] = useState(0);

  // Both adjustments below are "state changed and the old value no longer makes
  // sense", so they are made during render rather than in an effect. An effect
  // would paint one frame of the wrong page first — the reader would see the
  // tail of the queue, or a blank panel, and then be moved without being asked.
  // React re-renders immediately and discards the intermediate output.

  // A filter change or a shorter window can leave the reader past the end.
  const clampedPage = Math.min(page, pageCount - 1);
  if (clampedPage !== page) setPage(clampedPage);

  // Selecting on the map has to bring the row into view. Without a scroll
  // container to scroll, the page moves instead — otherwise clicking a pin opens
  // a popup for a row the panel is not even showing, which is the exact confusion
  // the row list exists to remove. `pageForSelection` is stamped alongside the
  // page so this only fires when the *selection* changes, not on every re-render.
  const selectedIndex = selectedKey
    ? ordered.findIndex((item) => `${item.kind}:${item.data.id}` === selectedKey)
    : -1;
  const pageForSelection = selectedIndex >= 0 ? Math.floor(selectedIndex / rowBudget) : -1;
  const [seenSelection, setSeenSelection] = useState<string | null>(null);
  if (selectedKey !== seenSelection) {
    setSeenSelection(selectedKey);
    if (pageForSelection >= 0) setPage(pageForSelection);
  }

  // `clampedPage`, not `page`: this render's slice must be the page the reader
  // is corrected to, not the stale one being discarded.
  const visible = ordered.slice(clampedPage * rowBudget, clampedPage * rowBudget + rowBudget);
  const firstShown = ordered.length === 0 ? 0 : clampedPage * rowBudget + 1;
  const lastShown = Math.min(ordered.length, (clampedPage + 1) * rowBudget);

  const step = useCallback(
    (delta: number) => setPage((current) => Math.min(Math.max(0, current + delta), pageCount - 1)),
    [pageCount],
  );

  // Left/right page the list. Arrow keys already mean "next/previous" to a
  // screen reader in a listbox, and this list is the only thing the panel
  // holds, so the arrows are better spent here than on nothing.
  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 z-[950] flex p-3 sm:p-4">
      {/* Collapsed: a single control, so the filters are always one click away
          and the map is not permanently narrower than it needs to be. */}
      {!open && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Show map filters"
          aria-expanded={false}
          className="pointer-events-auto flex h-full w-11 flex-col items-center gap-2 rounded-xl border border-[var(--color-rule)] bg-[var(--color-raised)]/95 py-3 shadow-[var(--shadow-raised)] backdrop-blur transition-colors hover:bg-[var(--color-sunken)]"
        >
          <Filter size={16} style={{ color: 'var(--color-ink-muted)' }} />
          <span
            className="tnum text-xs font-semibold"
            style={{ color: 'var(--color-ink-muted)', writingMode: 'vertical-rl' }}
          >
            {items.length} plotted
          </span>
        </button>
      )}

      {open && (
        <aside
          aria-label="Map filters and plotted records"
          className="pointer-events-auto flex h-full w-[21rem] max-w-full flex-col overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-raised)]/95 shadow-[var(--shadow-raised)] backdrop-blur"
        >
          {/* Header. `shrink-0` because this column is `flex-1` below it: without
              it the list would squeeze the header rather than the reverse. */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-rule)] px-4 py-2.5">
            <h2
              className="text-sm font-semibold"
              style={{ color: 'var(--color-ink)', letterSpacing: '-0.01em' }}
            >
              Filters
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onFitAll}
                disabled={items.length === 0}
                className="rounded-md px-1.5 py-1 text-xs font-semibold transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ color: 'var(--color-ink-muted)' }}
              >
                Fit all
              </button>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Hide map filters"
                aria-expanded
                className="rounded-md p-1 transition-colors hover:bg-black/5"
                style={{ color: 'var(--color-ink-muted)' }}
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>

          {/* Filters. Sized to fit: no `overflow`, no `maxHeight`. Two columns
              because the panel is a fixed 21rem and a single column of five
              controls would leave the list nothing. */}
          <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--color-rule)] px-4 py-3">
            <div>
              <SearchInput
                value={search}
                onChange={onSearch}
                label="Search loaded records"
                placeholder="Name, phone, category"
                width="100%"
              />
              <p className="mt-1.5" style={{ ...toneText.neutral, fontSize: 'var(--text-meta)' }}>
                Narrows what has loaded. Status, priority and dates are matched by the server.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Request status">
                {({ id, style }) => (
                  <select
                    id={id}
                    aria-label="Request status"
                    value={statusFilter}
                    onChange={(e) => onStatus(e.target.value as 'All' | RequestStatus)}
                    style={{ ...style, ...controlInteractive, width: '100%' }}
                  >
                    <option value="All">All statuses</option>
                    {OPEN_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label="Priority">
                {({ id, style }) => (
                  <select
                    id={id}
                    aria-label="Priority"
                    value={priorityFilter}
                    onChange={(e) =>
                      onPriority(e.target.value as 'All' | 'URGENT' | 'NORMAL')
                    }
                    style={{ ...style, ...controlInteractive, width: '100%' }}
                  >
                    <option value="All">All</option>
                    <option value="URGENT">Urgent</option>
                    <option value="NORMAL">Normal</option>
                  </select>
                )}
              </Field>

              <Field label="SOS review state">
                {({ id, style }) => (
                  <select
                    id={id}
                    aria-label="SOS review state"
                    value={sosFilter}
                    onChange={(e) => onSos(e.target.value as 'ALL' | 'LOGGED' | 'REVIEWED')}
                    style={{ ...style, ...controlInteractive, width: '100%' }}
                  >
                    <option value="ALL">All SOS</option>
                    <option value="LOGGED">Needs review</option>
                    <option value="REVIEWED">Reviewed</option>
                  </select>
                )}
              </Field>

              <Field label="Raised from">
                {({ id, style }) => (
                  <input
                    id={id}
                    type="date"
                    aria-label="Raised from"
                    value={fromDate}
                    onChange={(e) => onFrom(e.target.value)}
                    /*
                      `paddingRight` matches the browser's own date picker, which
                      is the widest thing in a half-width column. The controls
                      share the `control` padding of `0.625rem` on every other
                      side, so trimming this one edge is what stops the calendar
                      glyph from colliding with the text.
                    */
                    style={{ ...style, width: '100%', paddingRight: '0.25rem' }}
                  />
                )}
              </Field>

              <Field label="Raised to">
                {({ id, style }) => (
                  <input
                    id={id}
                    type="date"
                    aria-label="Raised to"
                    value={toDate}
                    onChange={(e) => onTo(e.target.value)}
                    /*
                      `paddingRight` matches the browser's own date picker, which
                      is the widest thing in a half-width column. The controls
                      share the `control` padding of `0.625rem` on every other
                      side, so trimming this one edge is what stops the calendar
                      glyph from colliding with the text.
                    */
                    style={{ ...style, width: '100%', paddingRight: '0.25rem' }}
                  />
                )}
              </Field>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="tnum" style={{ ...toneText.neutral, fontSize: 'var(--text-meta)' }}>
                {busy ? 'Loading…' : `${items.length} plotted`}
                {unlocated > 0 && ` · ${unlocated} not mappable`}
              </span>
              {hasFilters && (
                <Button variant="ghost" size="sm" icon={<RotateCcw size={12} />} onClick={onClear}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2">
            <h3
              className="text-xs font-semibold"
              style={{ color: 'var(--color-ink-muted)', letterSpacing: '0.02em' }}
            >
              Plotting
            </h3>
            {ordered.length > rowBudget && (
              <span className="tnum text-xs" style={toneText.neutral}>
                {firstShown}–{lastShown} of {ordered.length}
              </span>
            )}
          </div>

          {/*
            The one region that can exceed its box. `min-h-0` is what lets a flex
            child shrink below its content instead of forcing the panel taller,
            and `sahayak-scroll-hidden` drops the bar while leaving wheel, touch
            and keyboard scrolling intact. The fade stands in for the bar as the
            "there is more" cue.
          */}
          <ul
            ref={listRef}
            tabIndex={0}
            aria-label="Plotted records"
            onKeyDown={onListKeyDown}
            className="sahayak-scroll-hidden sahayak-scroll-fade-end min-h-0 flex-1 overflow-y-auto outline-none"
            /*
              `py-1` rather than `pb-1`: the list needs the same top inset the
              header and pager get, or rows sit hard against the two rules above
              and below them while the chrome around them is padded.
            */
            style={{ paddingTop: '0.25rem', paddingBottom: '0.25rem' }}
          >
            {visible.map((item) => (
              <RecordRow
                key={`${item.kind}:${item.data.id}`}
                item={item}
                isSelected={`${item.kind}:${item.data.id}` === selectedKey}
                onSelect={onSelect}
              />
            ))}

{/* Centred text uses the same horizontal padding a row has, so the
                empty state lines up with the records it is standing in for. */}
            {ordered.length === 0 && (
              <li className="px-4 py-8 text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
                  {hasFilters ? 'Nothing matches' : 'Nothing to plot'}
                </p>
                <p className="mt-1 text-xs" style={toneText.neutral}>
                  {hasFilters
                    ? 'No record in range. Clear the filters to see the full picture.'
                    : 'No help request or SOS has coordinates yet.'}
                </p>
              </li>
            )}
          </ul>

          {/* Pager. Present only when the list does not fit, so a short list does
              not carry a control that does nothing. */}
          {pageCount > 1 && (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--color-rule)] px-4 py-2">
              <PagerButton
                onClick={() => step(-1)}
                disabled={clampedPage === 0}
                label="Previous page"
                icon={<ChevronLeft size={14} />}
              >
                Previous
              </PagerButton>
              <span className="tnum text-xs" style={toneText.neutral}>
                Page {clampedPage + 1} of {pageCount}
              </span>
              <PagerButton
                onClick={() => step(1)}
                disabled={clampedPage >= pageCount - 1}
                label="Next page"
                icon={<ChevronRight size={14} />}
              >
                Next
              </PagerButton>
            </div>
          )}
        </aside>
      )}
    </div>
  );
};

/**
 * How many rows fit in the list, from the height the panel actually has.
 *
 * A hardcoded page size cannot work here: the panel is `h-full` of a map page,
 * so its height is whatever is left of the viewport, and that changes with the
 * header, the window, and whether the filter block wraps to a second line. So
 * the list is measured instead of guessed, and re-measured when the panel
 * resizes — which is also what makes the row count correct on a laptop and on a
 * wall display alike.
 *
 * `flex-1` + `min-h-0` on the list is what makes the measurement meaningful: the
 * flex layout resolves its height first, and this only reads it afterwards.
 */
function useRowBudget(open: boolean, rowHeight: number) {
  const listRef = useRef<HTMLUListElement>(null);
  const [rowBudget, setRowBudget] = useState(4);

  useEffect(() => {
    const element = listRef.current;
    // Collapsed, the list is unmounted and has no height to read.
    if (!open || !element) return;

    const measure = () => {
      const rows = Math.floor(element.clientHeight / rowHeight);
      setRowBudget(Math.max(1, rows));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, rowHeight]);

  return { rowBudget, listRef };
}

interface RecordRowProps {
  item: PlottedItem;
  isSelected: boolean;
  onSelect: (selection: Selection) => void;
}

/**
 * One plotted record. Fixed height, because the pager above budgets rows by a
 * fixed height — a row that wrapped to three lines would push the page count
 * out of step with the list and the pager would step past the end.
 */
const RecordRow: React.FC<RecordRowProps> = ({ item, isSelected, onSelect }) => {
  const record = item.data as PoliceRequest;
  const event = item.data as EmergencyEvent;
  const isRequest = item.kind === 'request';
  const age = elapsedLabel(item.data.created_at);

  const summary = isRequest
    ? requestSummary(record)
    : `SOS · ${triggerLabel(event.trigger_type)}`;

  const statusLabelText = isRequest ? statusLabel(record.status) : event.status === 'LOGGED' ? 'Needs review' : 'Reviewed';

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect({ kind: item.kind, id: item.data.id, at: Date.now() })}
        aria-current={isSelected ? 'true' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          width: '100%',
          height: ROW_HEIGHT,
          /*
            A record row fills the list's width, so it has to carry the whole
            inline inset itself: `1rem` puts its content on the same line as the
            `px-4` header, "Plotting" label and pager. At `0.5rem` — and again
            when the list's own `px-2` was traded for vertical padding only — the
            names sat 4px left of the heading that titles them.
          */
          padding: '0 1rem',
          borderRadius: 'var(--radius-control)',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
        className={
          isSelected
            ? 'bg-[var(--color-sunken)] shadow-[inset_3px_0_0_var(--color-navy)]'
            : 'hover:bg-black/[0.04]'
        }
      >
        {/*
          A solid dot with the pulse as a ring behind it, rather than the pulse
          on the dot itself. The animation scales to 2.6× and fades out, so
          applied to a 10px dot it would dissolve the only thing identifying the
          record's kind — the pin in the map gets this right for the same reason.
        */}
        <span
          className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          {item.pulse && (
            <span
              className="sahayak-marker-pulse absolute inset-0 rounded-full"
              style={{ background: item.color }}
            />
          )}
          <span
            className="relative h-2 w-2 rounded-full"
            style={{ background: item.color, boxShadow: 'inset 0 0 0 1.5px #fff' }}
          />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className="truncate text-sm font-semibold"
              style={{ color: 'var(--color-ink)' }}
            >
              {isRequest ? record.senior.full_name ?? record.senior.email : event.senior.full_name ?? event.senior.email}
            </span>
            <span className="tnum shrink-0 text-xs" style={{ color: waitColor(item) }}>
              {age ?? '—'}
            </span>
          </span>

          <span className="flex items-center gap-1.5 overflow-hidden">
            <span className="shrink-0 text-xs" style={toneText.neutral}>
              {summary}
            </span>
            {item.urgent && <Badge tone="error">Urgent</Badge>}
            {isRequest && record.has_photo && (
              <span className="shrink-0 text-xs" style={toneText.neutral}>
                Photo
              </span>
            )}
          </span>
        </span>

        <Badge
          tone={isRequest ? requestStatusTone(record.status) : emergencyStatusTone(event.status)}
          dot
        >
          {statusLabelText}
        </Badge>
      </button>
    </li>
  );
};

/**
 * How long ago, tinted by the escalation ladder. A request still open past two
 * hours reads as urgent in the list the same way it does in the Monitoring
 * board, so the two never disagree about the same record.
 */
function waitColor(item: PlottedItem): string {
  if (item.kind === 'emergency') return 'var(--color-ink-muted)';
  const record = item.data as PoliceRequest;
  if (record.status === 'COMPLETED' || record.status === 'CANCELLED') return 'var(--color-ink-muted)';
  const tone = waitTone(record.created_at);
  if (tone === 'neutral') return 'var(--color-ink-muted)';
  return tone === 'error' ? 'var(--color-error-ink)' : 'var(--color-warning-ink)';
}

interface PagerButtonProps {
  onClick: () => void;
  disabled: boolean;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const PagerButton: React.FC<PagerButtonProps> = ({ onClick, disabled, label, icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs font-semibold transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
    style={{ color: 'var(--color-ink-muted)' }}
  >
    {icon}
    {children}
  </button>
);