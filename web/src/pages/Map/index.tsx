import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link } from 'react-router-dom';
import { fetchEmergencyEvents, fetchPoliceRequests } from '../../api/client';
import type { EmergencyEvent, PoliceRequest, RequestStatus } from '../../api/types';
import { Crosshair, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { FilterPanel } from './FilterPanel';
import {
  EMERGENCY_COLOR,
  hasCoords,
  REQUEST_COLOR,
  REVIEWED_COLOR,
  selectionKey,
  toEmergencyItem,
  toRequestItem,
  URGENT_COLOR,
  type PlottedItem,
  type Selection,
} from './mapItems';
import { cellSizeForZoom, clusterByGrid, type GridCluster } from './mapCluster';
import { DEMO_ENABLED, demoItems } from './mapDemo';
import { categoryLabel, dayEnd, elapsedLabel, formatDateTime, priorityLabel, statusLabel, triggerLabel } from '../../lib/format';
import { emergencyStatusTone, priorityTone } from '../../lib/tone';

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

/** How often the map re-reads the two feeds. Matches the Monitoring board. */
const REFRESH_MS = 30_000;

/** Ask the API for everything mappable in one page rather than a trickle. */
const MAX_POINTS = 200;

const panelClass =
  'pointer-events-auto rounded-xl border border-[var(--color-rule)] bg-[var(--color-raised)]/95 shadow-[var(--shadow-raised)] backdrop-blur';

/**
 * Icons are cached per (colour, pulsing, selected) triple.
 *
 * `L.divIcon` allocates a fresh object and, in Leaflet 1.9, a fresh DOM element
 * per instance. Recreating one per marker on every render threw away and
 * re-created dozens of nodes on each poll and on every filter toggle, which is
 * what made the map flicker while data refreshed.
 */
const iconCache = new Map<string, L.DivIcon>();

/**
 * A teardrop pin, drawn as inline SVG rather than CSS.
 *
 * The shape is the point: a round dot says "something is roughly here", and with
 * overlapping records near it an officer cannot tell which dot belongs to which
 * row in the panel. A pin has a point, so the eye can follow it down to the exact
 * spot the record was raised at.
 *
 * SVG rather than a styled `<div>` because the marker markup is injected into
 * Leaflet's pane, and CSS there depends on inheritance that is not guaranteed.
 * The same reasoning is why the colours are literal hex — see `mapItems.ts`.
 */
function markerIcon(color: string, pulse: boolean, selected: boolean): L.DivIcon {
  const key = `${color}:${pulse}:${selected}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const icon = L.divIcon({
    className: '',
    html: `<div class="sahayak-pin${selected ? ' is-selected' : ''}">
      ${pulse ? `<span class="sahayak-marker-pulse" style="background:${color}"></span>` : ''}
      <svg viewBox="0 0 24 34" width="24" height="34" aria-hidden="true">
        <path d="M12 33.5C12 33.5 23 20.2 23 12.2A11 11 0 1 0 1 12.2C1 20.2 12 33.5 12 33.5Z"
          fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"></path>
        <circle cx="12" cy="12" r="4.25" fill="#fff"></circle>
      </svg>
    </div>`,
    // Anchored at the tip, so the point sits on the coordinate rather than the
    // middle of the glyph floating above it.
    iconSize: [24, 34],
    iconAnchor: [12, 33],
    tooltipAnchor: [0, -28],
    popupAnchor: [0, -30],
  });
  iconCache.set(key, icon);
  return icon;
}

/**
 * A cluster: a ring of the record count, coloured by the most urgent member.
 *
 * Colouring by the dominant member instead would let an SOS sharing a cell with a
 * dozen routine requests render the group blue — hiding precisely the record the
 * cluster was covering.
 *
 * Drawn as a ring rather than a filled circle so it reads as a bundle of pins
 * gathered at one point, not as a single very important pin. The count sits in
 * the middle; the hover tooltip carries who is inside, because a bare "12" does
 * not tell an officer whether an SOS is in there.
 */
const clusterCache = new Map<string, L.DivIcon>();

function clusterIcon(count: number, color: string): L.DivIcon {
  const size = count < 10 ? 34 : count < 25 ? 40 : 46;
  const key = `${count}:${color}`;
  const cached = clusterCache.get(key);
  if (cached) return cached;

  const icon = L.divIcon({
    className: '',
    html: `<div class="sahayak-cluster" style="--sahayak-cluster-size:${size}px;--sahayak-cluster-color:${color}">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -(size / 2 + 6)],
  });
  clusterCache.set(key, icon);
  return icon;
}

/**
 * The hover summary for a pin.
 *
 * This is what the officer reads before deciding to click, so it answers the two
 * questions a map pin raises — who, and how urgent — and stops there. The full
 * record, including the photo, stays in the click popup; duplicating it here
 * would mean two places to keep in step.
 */
const pinTooltip = (item: PlottedItem): React.ReactElement => {
  const isRequest = item.kind === 'request';
  const record = item.data as PoliceRequest;
  const event = item.data as EmergencyEvent;

  return (
    <div className="sahayak-tooltip-body">
      <span className="sahayak-tooltip-name">
        {isRequest ? record.senior.full_name ?? record.senior.email : event.senior.full_name ?? event.senior.email}
      </span>
      <span className="sahayak-tooltip-detail">
        {isRequest
          ? `${categoryLabel(record.category)} · ${statusLabel(record.status)}`
          : `SOS · ${triggerLabel(event.trigger_type)}`}
      </span>
      <span className="sahayak-tooltip-detail">
        {elapsedLabel(item.data.created_at) ?? 'just now'}
        {item.urgent ? ' · Urgent' : ''}
      </span>
    </div>
  );
};

/** The hover summary for a cluster: the count, then the most urgent thing in it. */
const clusterTooltip = (members: PlottedItem[]): React.ReactElement => {
  const sosCount = members.filter((m) => m.pulse).length;
  const urgentCount = members.filter((m) => m.urgent).length;

  return (
    <div className="sahayak-tooltip-body">
      <span className="sahayak-tooltip-name">{members.length} records here</span>
      {sosCount > 0 && (
        <span className="sahayak-tooltip-detail">
          {sosCount} SOS awaiting review
        </span>
      )}
      {urgentCount > 0 && (
        <span className="sahayak-tooltip-detail">{urgentCount} urgent request</span>
      )}
      <span className="sahayak-tooltip-detail">Click to zoom in</span>
    </div>
  );
};

/** Most urgent wins: an unreviewed SOS outranks an urgent request outranks the rest. */
const clusterColor = (members: PlottedItem[]): string => {
  if (members.some((m) => m.pulse)) return EMERGENCY_COLOR;
  if (members.some((m) => m.urgent)) return URGENT_COLOR;
  if (members.some((m) => m.kind === 'emergency')) return REVIEWED_COLOR;
  return REQUEST_COLOR;
};

interface MapBehaviourProps {
  points: Array<[number, number]>;
  /** Bumping this refits to the current points; `-1` means "do not touch". */
  fitNonce: number;
}

/**
 * Leaflet caches the container size at mount, so a flex resize — the side panel
 * collapsing, a window resize, the mobile URL bar appearing — leaves the tile
 * layer drawn to a stale box. Both the observer and the fit live here for the
 * same reason.
 */
function MapBehaviour({ points, fitNonce }: MapBehaviourProps) {
  const map = useMap();
  const lastFit = useRef<number>(-1);

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    map.invalidateSize({ animate: false });
    if (fitNonce === lastFit.current) return;
    lastFit.current = fitNonce;
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [72, 72], maxZoom: 15, animate: true });
  }, [map, points, fitNonce]);

  return null;
}

interface MarkerLayerProps {
  items: PlottedItem[];
  selection: Selection | null;
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
  onSelect: (selection: Selection) => void;
}

/**
 * Plots the items, clustered by screen proximity.
 *
 * A `divIcon` has to be rebuilt whenever the zoom changes, because the grid cells
 * are measured in pixels — so this reads the live map rather than a zoom value
 * lifted into the page's state, which would re-render the whole tree on every
 * wheel tick.
 */
const MarkerLayer: React.FC<MarkerLayerProps> = ({ items, selection, markerRefs, onSelect }) => {
  const map = useMap();
  /**
   * Zoom, mirrored out of the map, because `map.getZoom()` is not a reactive
   * value: reading it during render would not re-render the subtree when it
   * changes, and the clustering would keep using the cell size of the zoom the
   * officer was at before they zoomed.
   *
   * Deliberately zoom only, not the map centre. The projection below pins its
   * origin at (0, 0), which makes the cell a function of the coordinate and the
   * zoom alone — so panning the map does not silently re-bucket every marker
   * and a cluster does not split apart just because the officer scrolled past
   * it. Zooming is the only thing that should change the grouping.
   */
  const [zoom, setZoom] = useState(5);
  const selectedKey = selectionKey(selection);

  useEffect(() => {
    const sync = () => setZoom(map.getZoom());
    sync();
    map.on('zoomend', sync);
    return () => {
      map.off('zoomend', sync);
    };
  }, [map]);

  const clusters = useMemo(() => {
    const project = (point: L.LatLngExpression) => map.project(point, zoom);
    const unproject = (point: L.PointExpression) => map.unproject(point, zoom);
    return clusterByGrid(items, project, unproject, cellSizeForZoom(zoom));
  }, [items, map, zoom]);

  const zoomTo = useCallback(
    (cluster: GridCluster<PlottedItem>) => {
      if (cluster.members.length === 1) {
        map.setView([cluster.lat, cluster.lng], Math.max(map.getZoom(), 16), { animate: true });
        return;
      }
      map.fitBounds(cluster.bounds, { padding: [90, 90], maxZoom: 17, animate: true });
    },
    [map],
  );

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.members.length > 1) {
          const count = cluster.members.length;
          return (
            <Marker
              key={`cluster-${cluster.lat.toFixed(4)}-${cluster.lng.toFixed(4)}-${count}`}
              position={[cluster.lat, cluster.lng]}
              icon={clusterIcon(count, clusterColor(cluster.members))}
              alt={`${count} records here. Select to zoom in.`}
              eventHandlers={{ click: () => zoomTo(cluster) }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                {clusterTooltip(cluster.members)}
              </Tooltip>
            </Marker>
          );
        }

        const item = cluster.members[0];
        const key = `${item.kind}:${item.data.id}`;
        const isSelected = selectedKey === key;

        return (
          <Marker
            key={key}
            position={[item.lat, item.lng]}
            icon={markerIcon(item.color, item.pulse, isSelected)}
            alt={item.alt}
            zIndexOffset={isSelected ? 1000 : 0}
            ref={(instance: L.Marker | null) => {
              if (instance) markerRefs.current.set(key, instance);
              else markerRefs.current.delete(key);
            }}
            eventHandlers={{ click: () => onSelect({ kind: item.kind, id: item.data.id, at: Date.now() }) }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={1}>
              {pinTooltip(item)}
            </Tooltip>
            <Popup autoPan={false}>
              {item.kind === 'request' ? (
                <RequestPopup request={item.data as PoliceRequest} />
              ) : (
                <EmergencyPopup
                  event={item.data as EmergencyEvent}
                  onFocus={(id) => onSelect({ kind: 'request', id, at: Date.now() })}
                />
              )}
            </Popup>
          </Marker>
        );
      })}
    </>
  );
};

/**
 * Re-centres the map on whatever the side panel selected, and opens its popup.
 *
 * Lives inside `MapContainer` because it needs the map instance, which the panel
 * — a sibling in the DOM tree — cannot reach.
 */
const FocusController: React.FC<{
  items: PlottedItem[];
  selection: Selection | null;
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}> = ({ items, selection, markerRefs }) => {
  const map = useMap();

  useEffect(() => {
    if (!selection) return;
    const item = items.find((i) => i.kind === selection.kind && i.data.id === selection.id);
    if (!item) return;

    map.flyTo([item.lat, item.lng], Math.max(map.getZoom(), 15), {
      animate: true,
      duration: 0.4,
    });
    markerRefs.current.get(`${selection.kind}:${selection.id}`)?.openPopup();
  }, [selection, items, map, markerRefs]);

  return null;
};

const popupShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  minWidth: '15rem',
  maxWidth: '17rem',
};

const popupRule: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  borderTop: '1px solid var(--color-rule)',
  paddingTop: '0.5rem',
};

const popupLabel: React.CSSProperties = {
  color: 'var(--color-ink-muted)',
  fontSize: 'var(--text-label)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
};

const popupLink: React.CSSProperties = {
  color: 'var(--color-navy)',
  fontSize: 'var(--text-body)',
  fontWeight: 600,
  textDecoration: 'underline',
};

const PopupRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', fontSize: 'var(--text-body)' }}>
    <span style={popupLabel}>{label}</span>
    <span style={{ color: 'var(--color-ink)', fontWeight: 500, textAlign: 'right' }}>{children}</span>
  </div>
);

const RequestPopup: React.FC<{ request: PoliceRequest }> = ({ request }) => (
  <div style={popupShell}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
      <strong style={{ fontSize: 'var(--text-body)' }}>Help request</strong>
      <Badge tone={priorityTone(request.priority)} state>
        {priorityLabel(request.priority)}
      </Badge>
    </div>

    <p style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.4 }}>{request.description}</p>

    {request.image_url && (
      <img
        src={request.image_url}
        alt={`Photo attached to this ${categoryLabel(request.category).toLowerCase()} request`}
        loading="lazy"
        style={{
          width: '100%',
          height: '7.5rem',
          objectFit: 'cover',
          borderRadius: 'var(--radius-control)',
          background: 'var(--color-sunken)',
          display: 'block',
        }}
      />
    )}

    <div style={popupRule}>
      <PopupRow label="Category">{categoryLabel(request.category)}</PopupRow>
      <PopupRow label="Status">{statusLabel(request.status)}</PopupRow>
      <PopupRow label="Senior">{request.senior.full_name ?? request.senior.email ?? 'Unknown'}</PopupRow>
      <PopupRow label="Raised">{formatDateTime(request.created_at)}</PopupRow>
    </div>

    <Link to={`/requests/${request.id}`} style={popupLink}>
      Open request →
    </Link>
  </div>
);

const EmergencyPopup: React.FC<{
  event: EmergencyEvent;
  onFocus: (requestId: string) => void;
}> = ({ event, onFocus }) => (
  <div style={popupShell}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
      <strong style={{ fontSize: 'var(--text-body)' }}>Emergency SOS</strong>
      <Badge tone={emergencyStatusTone(event.status)} state dot>
        {event.status === 'LOGGED' ? 'Needs review' : 'Reviewed'}
      </Badge>
    </div>

    <div style={popupRule}>
      <PopupRow label="Trigger">{triggerLabel(event.trigger_type)}</PopupRow>
      <PopupRow label="Senior">{event.senior.full_name ?? event.senior.email}</PopupRow>
      <PopupRow label="Contact">{event.senior.phone_number ?? 'Not provided'}</PopupRow>
      <PopupRow label="Escalated to 112">{event.escalated_to_112 ? 'Yes' : 'No'}</PopupRow>
      <PopupRow label="Raised">{formatDateTime(event.created_at)}</PopupRow>
    </div>

    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <Link to={`/seniors/${event.senior_id}`} style={popupLink}>
        Open senior →
      </Link>
      {event.help_request_id && (
        // Centres the linked request on the map rather than navigating away, so
        // an officer can see the SOS and its request together. Navigating would
        // leave the map entirely and lose the spatial context.
        <button
          type="button"
          onClick={() => onFocus(event.help_request_id!)}
          style={{ ...popupLink, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          Show its request →
        </button>
      )}
    </div>
  </div>
);

const ToggleChip: React.FC<{
  active: boolean;
  color: string;
  count: number;
  label: string;
  onClick: () => void;
}> = ({ active, color, count, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? 'bg-[var(--color-navy)] text-[var(--color-ink-inverse)]'
        : 'text-[var(--color-ink-muted)] hover:bg-black/5'
    }`}
  >
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
      style={{ backgroundColor: active ? color : '#cbd5e1' }}
    />
    <span className="whitespace-nowrap">{label}</span>
    <span className={active ? 'tabular-nums text-white/60' : 'tabular-nums text-[var(--color-ink-muted)]'}>
      {count}
    </span>
  </button>
);

const LegendSwatch: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="flex items-center gap-2">
    {/*
      A miniature of the real marker. The legend used to be a plain 12px circle,
      which is not the shape on the map — so the legend taught a shape the officer
      would then not find. Same teardrop, scaled down.
    */}
    <svg viewBox="0 0 24 34" width="12" height="17" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M12 33.5C12 33.5 23 20.2 23 12.2A11 11 0 1 0 1 12.2C1 20.2 12 33.5 12 33.5Z"
        fill={color}
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="4.25" fill="#fff" />
    </svg>
    {label}
  </span>
);

export const MapPage: React.FC = () => {
  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRequests, setShowRequests] = useState(true);
  const [showEmergencies, setShowEmergencies] = useState(true);
  const [fitNonce, setFitNonce] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);

  /*
   * Server-side filters.
   *
   * `GET /police/requests` and `GET /police/emergency-events` both accept these
   * and match in SQL. Narrowing the loaded page in the browser instead would let
   * a filter report "nothing here" while matching records exist beyond the
   * 200-row cap — the exact failure the Monitoring board's filters avoid.
   *
   * Held in a ref so the 30-second poll reads current values without tearing
   * down and reissuing the interval on every keystroke.
   */
  const [statusFilter, setStatusFilter] = useState<'All' | RequestStatus>('All');
  const [priorityFilter, setPriorityFilter] = useState<'All' | 'URGENT' | 'NORMAL'>('All');
  const [sosFilter, setSosFilter] = useState<'ALL' | 'LOGGED' | 'REVIEWED'>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  /** Local only: neither list endpoint takes a search term. */
  const [search, setSearch] = useState('');

  const filtersRef = useRef({ statusFilter, priorityFilter, sosFilter, fromDate, toDate });
  useEffect(() => {
    filtersRef.current = { statusFilter, priorityFilter, sosFilter, fromDate, toDate };
  }, [statusFilter, priorityFilter, sosFilter, fromDate, toDate]);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const {
      statusFilter: status,
      priorityFilter: priority,
      sosFilter: sos,
      fromDate: from,
      toDate: toRaw,
    } = filtersRef.current;
    // `dayEnd` stretches a date-only `to` to the last millisecond of the day.
    // Without it a request raised at 14:00 on the chosen day is excluded by a
    // `to` that `new Date()` reads as local midnight.
    const to = dayEnd(toRaw);

    try {
      const [requestResult, emergencyResult] = await Promise.all([
        fetchPoliceRequests({
          ...(status !== 'All' ? { status } : {}),
          ...(priority !== 'All' ? { priority: priority === 'URGENT' ? 'urgent' : 'normal' } : {}),
          ...(from ? { from: new Date(from).toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
          limit: String(MAX_POINTS),
        }),
        fetchEmergencyEvents({
          ...(sos !== 'ALL' ? { status: sos } : {}),
          ...(from ? { from: new Date(from).toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
          limit: MAX_POINTS,
        }),
      ]);
      setRequests(requestResult.requests);
      setEmergencies(emergencyResult.events);
      setUpdatedAt(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load map data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // A filter change re-issues the load once. The interval is only rebuilt when
  // the filters change, not on every poll.
  useEffect(() => {
    void load(false);
    const timer = setInterval(() => void load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, statusFilter, priorityFilter, sosFilter, fromDate, toDate]);

  /*
   * Search is the one filter that stays on the client, because neither list
   * endpoint takes a term. The panel says it searches what has loaded, so an
   * empty result is not read as "this person has no requests".
   */
  const term = search.trim().toLowerCase();
  const matching = useMemo(() => {
    if (term === '') return { requests, emergencies };
    const hits = (...fields: Array<string | null | undefined>) =>
      fields.some((field) => (field ?? '').toLowerCase().includes(term));
    return {
      requests: requests.filter((r) =>
        hits(r.senior.full_name, r.senior.email, r.category, r.description),
      ),
      emergencies: emergencies.filter((e) =>
        hits(e.senior.full_name, e.senior.email, e.senior.phone_number, e.trigger_type),
      ),
    };
  }, [term, requests, emergencies]);

const liveItems = useMemo<PlottedItem[]>(
    () => [
      ...(showRequests ? matching.requests.filter(hasCoords).map(toRequestItem) : []),
      ...(showEmergencies ? matching.emergencies.filter(hasCoords).map(toEmergencyItem) : []),
    ],
    [showRequests, showEmergencies, matching],
  );

  /*
   * Demo records stand in only when the feed has nothing located to show, and
   * only in a dev build (see `mapDemo.ts`).
   *
   * Falling back rather than always appending matters: appending would put a
   * fabricated SOS on the map of a dev instance that has real traffic, where
   * nothing marks it as fake. Falling back means demo data appears only on the
   * empty canvas it exists for, and disappears the moment a real record lands.
   * `usingDemo` is surfaced in the header for the same reason.
   */
  const usingDemo = DEMO_ENABLED && liveItems.length === 0;
  const items = usingDemo ? demoItems : liveItems;

  const unlocated = usingDemo
    ? 0
    : requests.length - requests.filter(hasCoords).length +
      (emergencies.length - emergencies.filter(hasCoords).length);

  const points = useMemo<Array<[number, number]>>(() => items.map((i) => [i.lat, i.lng]), [items]);

  /*
   * New points only widen the view when the officer has not taken manual
   * control, so a refresh arriving mid-pan does not yank the camera back.
   */
  const pointsRef = useRef<Array<[number, number]>>([]);
  useEffect(() => {
    const grew = points.length > pointsRef.current.length;
    pointsRef.current = points;
    if (grew) setFitNonce((n) => n + 1);
  }, [points]);

  const urgentCount = useMemo(() => items.filter((i) => i.urgent).length, [items]);
  const openSosCount = useMemo(() => items.filter((i) => i.pulse).length, [items]);

  const hasFilters =
    statusFilter !== 'All' ||
    priorityFilter !== 'All' ||
    sosFilter !== 'ALL' ||
    fromDate !== '' ||
    toDate !== '' ||
    term !== '';

  const clearFilters = () => {
    setStatusFilter('All');
    setPriorityFilter('All');
    setSosFilter('ALL');
    setFromDate('');
    setToDate('');
    setSearch('');
  };

  const markerRefs = useRef(new Map<string, L.Marker>());

  // A filter that removes the selected record must not leave the panel showing
  // something that is no longer plotted.
  useEffect(() => {
    if (!selection) return;
    if (!items.some((i) => i.kind === selection.kind && i.data.id === selection.id)) {
      setSelection(null);
    }
  }, [items, selection]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--color-canvas)]">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={5}
        minZoom={3}
        maxZoom={18}
        zoomControl={false}
        className="sahayak-map h-full w-full"
        style={{ position: 'absolute', inset: 0 }}
      >
        {/*
          OpenStreetMap's standard raster tiles, which is what this map already
          used. OSM's published usage policy caps heavy use and asks for an
          identifying Referer, so a deployment at real scale wants its own tile
          source behind this same URL rather than a heavier layer bolted on here.
        */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          subdomains={['a', 'b', 'c']}
          maxZoom={19}
        />

        <ZoomControl position="bottomright" />
        <MapBehaviour points={points} fitNonce={fitNonce} />
        <MarkerLayer
          items={items}
          selection={selection}
          markerRefs={markerRefs}
          onSelect={setSelection}
        />
        <FocusController items={items} selection={selection} markerRefs={markerRefs} />
      </MapContainer>

      {error && (
        // Absolutely positioned over the tiles: the officer must not lose their
        // pan and zoom to read that a refresh failed.
        <div className="absolute left-1/2 top-4 z-[1050] w-[min(30rem,calc(100%-2rem))] -translate-x-1/2">
          <Alert onRetry={() => void load(true)}>{error}</Alert>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-[900] flex flex-col justify-between p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`${panelClass} px-4 py-3`}>
            <h1 className="flex items-center gap-2 text-sm font-bold leading-tight text-[var(--color-ink)] sm:text-base">
              <MapPin size={16} className="text-[var(--color-ink-muted)]" />
              Operational Map
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-ink-muted)]">
              <span className="tabular-nums">{items.length} records plotted</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{openSosCount} SOS awaiting review</span>
              {unlocated > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className="font-medium text-[var(--color-warning-ink)]"
                    title="Records with no coordinates are not shown as markers."
                  >
                    {unlocated} not mappable
                  </span>
                </>
              )}
            </div>

            {/* Never let a fabricated record read as a real dispatch. */}
            {usingDemo && (
              <p className="mt-2 rounded-md bg-[var(--color-warning-tint)] px-2 py-1 text-xs font-medium text-[var(--color-warning-ink)]">
                Demo records — nothing is loaded from the API
              </p>
            )}
          </div>

          <div className={`${panelClass} flex flex-col items-end gap-2 p-2`}>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <ToggleChip
                active={showRequests}
                color={REQUEST_COLOR}
                count={matching.requests.length}
                label="Requests"
                onClick={() => setShowRequests((value) => !value)}
              />
              <ToggleChip
                active={showEmergencies}
                color={EMERGENCY_COLOR}
                count={matching.emergencies.length}
                label="Emergencies"
                onClick={() => setShowEmergencies((value) => !value)}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFitNonce((n) => n + 1)}
                disabled={points.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-rule)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-black/5 hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Crosshair size={13} />
                Fit all
              </button>
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                aria-label="Refresh map data"
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-rule)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-black/5 hover:text-[var(--color-ink)] disabled:opacity-50"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
                {updatedAt
                  ? `Updated ${new Date(updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
                  : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        <div className={`${panelClass} self-start px-4 py-2.5`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-[var(--color-ink-muted)]">
            <LegendSwatch color={REQUEST_COLOR} label="Help request" />
            <LegendSwatch color={URGENT_COLOR} label={`Urgent (${urgentCount})`} />
            <LegendSwatch color={EMERGENCY_COLOR} label="SOS, awaiting review" />
            <LegendSwatch color={REVIEWED_COLOR} label="SOS, reviewed" />
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="sahayak-cluster"
                style={
                  {
                    '--sahayak-cluster-size': '1.25rem',
                    '--sahayak-cluster-color': 'var(--color-navy)',
                  } as React.CSSProperties
                }
              >
                n
              </span>
              Cluster — takes the colour of its most urgent record
            </span>
          </div>
        </div>
      </div>

      {loading && (
        /*
          `z-[1000]`, not `z-[950]`: the filter panel is also at 950 and is
          rendered *after* this overlay, so an equal z-index left the panel
          floating on top of the loading curtain instead of behind it.
        */
        <div className="absolute inset-0 z-[1000] grid place-items-center bg-[var(--color-canvas)]">
          <span className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
            <Loader2 size={16} className="animate-spin" />
            Loading map data…
          </span>
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="pointer-events-none absolute inset-0 z-[900] grid place-items-center">
          <div className={`${panelClass} max-w-sm px-5 py-4 text-center`}>
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              {/*
                A search term that matched nothing while demo records are
                standing in reads as "this person does not exist". In a dev
                build the honest answer is that the list is not the API.
              */}
              {hasFilters
                ? usingDemo
                  ? 'Nothing matches — demo records only'
                  : 'Nothing matches these filters'
                : 'Nothing to plot'}
            </p>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              {hasFilters
                ? usingDemo
                  ? 'These two records are placeholders, so nothing here can match. Clear the filters to see them.'
                  : 'No request or SOS event in range. Clear the filters to see the full picture.'
                : 'No help request or SOS event has coordinates yet. They appear here as soon as one does.'}
            </p>
            {hasFilters && (
              <div className="mt-3 flex justify-center">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <FilterPanel
        open={panelOpen}
        onToggle={() => setPanelOpen((value) => !value)}
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatus={setStatusFilter}
        priorityFilter={priorityFilter}
        onPriority={setPriorityFilter}
        sosFilter={sosFilter}
        onSos={setSosFilter}
        fromDate={fromDate}
        onFrom={setFromDate}
        toDate={toDate}
        onTo={setToDate}
        hasFilters={hasFilters}
        onClear={clearFilters}
        items={items}
        selection={selection}
        onSelect={setSelection}
        busy={loading || refreshing}
        unlocated={unlocated}
        onFitAll={() => setFitNonce((n) => n + 1)}
      />
    </div>
  );
};
