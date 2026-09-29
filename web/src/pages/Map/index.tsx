import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Link } from 'react-router-dom';
import { fetchEmergencyEvents, fetchPoliceRequests } from '../../api/client';
import type { EmergencyEvent, PoliceRequest } from '../../api/types';
import { Crosshair, Loader2, MapPin, RefreshCw } from 'lucide-react';

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

/**
 * Request, emergency and senior colours are resolved to literals rather than
 * left as `var(--…)`. The marker markup is injected into Leaflet's pane, and a
 * CSS custom property is only inherited through the DOM tree — the pane is in
 * the document, so it resolves today, but nothing guarantees the injection
 * point keeps inheriting. A hard-coded hex cannot silently fail to a
 * transparent marker.
 */
const REQUEST_COLOR = '#2563eb';
const URGENT_COLOR = '#d97706';
const EMERGENCY_COLOR = '#dc2626';
const REVIEWED_COLOR = '#64748b';

/** How often the map re-reads the two feeds. Matches the Monitoring board. */
const REFRESH_MS = 30_000;

/** Ask the API for everything mappable in one page rather than a trickle. */
const MAX_POINTS = 200;

interface MapPoint {
  lat: number;
  lng: number;
}

/**
 * Narrows the nullable coordinate columns to numbers. Written generically so
 * the predicate intersects the *whole* incoming type rather than collapsing it
 * to just the two fields.
 */
function hasCoords<T extends { latitude: number | null; longitude: number | null }>(
  value: T,
): value is T & { latitude: number; longitude: number } {
  return value.latitude !== null && value.longitude !== null;
}

const toPoint = (value: { latitude: number; longitude: number }): MapPoint => ({
  lat: value.latitude,
  lng: value.longitude,
});

/**
 * Icons are cached per (colour, pulsing) pair.
 *
 * `L.divIcon` allocates a fresh object and, in Leaflet 1.9, a fresh DOM element
 * per instance. Recreating one per marker on every render threw away and
 * re-created dozens of nodes on each poll and on every filter toggle, which is
 * what made the map flicker while data refreshed.
 */
const iconCache = new Map<string, L.DivIcon>();

function markerIcon(color: string, pulse = false): L.DivIcon {
  const key = `${color}:${pulse}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const icon = L.divIcon({
    className: '',
    html: `<div class="sahayak-pin">
      ${pulse ? `<span class="sahayak-marker-pulse" style="background:${color}"></span>` : ''}
      <span class="sahayak-pin-dot" style="background:${color}"></span>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
  iconCache.set(key, icon);
  return icon;
}

interface FitBoundsProps {
  points: MapPoint[];
  /** Bumping this refits to the current points; `-1` means "do not touch". */
  fitNonce: number;
}

/**
 * Leaflet caches the container size at mount, so a flex resize — a sidebar
 * toggle, a window resize, the mobile URL bar appearing — leaves the tile
 * layer drawn to a stale box. Both the observer and the fit run here for the
 * same reason.
 */
function MapBehaviour({ points, fitNonce }: FitBoundsProps) {
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
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [64, 64], maxZoom: 14, animate: true });
  }, [map, points, fitNonce]);

  return null;
}

const panelClass =
  'pointer-events-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-white)]/95 shadow-[var(--shadow-md)] backdrop-blur';

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
        ? 'bg-[var(--color-primary-navy)] text-[var(--color-text-inverse)]'
        : 'text-[var(--color-text-secondary)] hover:bg-black/5'
    }`}
  >
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
      style={{ backgroundColor: active ? color : '#cbd5e1' }}
    />
    <span className="whitespace-nowrap">{label}</span>
    <span className={active ? 'tabular-nums text-white/60' : 'tabular-nums text-[var(--color-text-secondary)]'}>
      {count}
    </span>
  </button>
);

const popupLabel: React.CSSProperties = {
  color: 'var(--color-text-secondary)',
  fontSize: '0.6875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
};

const PopupRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
    <span style={popupLabel}>{label}</span>
    <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, textAlign: 'right' }}>{children}</span>
  </div>
);

const popupLink: React.CSSProperties = {
  color: 'var(--color-primary-navy)',
  fontSize: '0.8125rem',
  fontWeight: 600,
  textDecoration: 'underline',
};

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

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [requestResult, emergencyResult] = await Promise.all([
        fetchPoliceRequests({ limit: String(MAX_POINTS) }),
        fetchEmergencyEvents({ limit: MAX_POINTS }),
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

  useEffect(() => {
    void load(false);
    const timer = setInterval(() => void load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const locatedRequests = useMemo(() => requests.filter(hasCoords), [requests]);
  const locatedEmergencies = useMemo(() => emergencies.filter(hasCoords), [emergencies]);

  // Records without coordinates are not silently dropped: an SOS that cannot be
  // plotted is exactly the one an officer needs to know about, so the count is
  // surfaced next to the legend rather than hidden.
  const unlocated =
    requests.length - locatedRequests.length + (emergencies.length - locatedEmergencies.length);

  const points = useMemo<MapPoint[]>(
    () => [
      ...(showRequests ? locatedRequests.map(toPoint) : []),
      ...(showEmergencies ? locatedEmergencies.map(toPoint) : []),
    ],
    [showRequests, showEmergencies, locatedRequests, locatedEmergencies],
  );

  // New points only widen the view when the officer has not taken manual
  // control, so a refresh that arrives mid-pan does not yank the camera back.
  const pointsRef = useRef<MapPoint[]>([]);
  useEffect(() => {
    const grew = points.length > pointsRef.current.length;
    pointsRef.current = points;
    if (grew) setFitNonce((n) => n + 1);
  }, [points]);

  const activeEmergencies = useMemo(
    () => locatedEmergencies.filter((e) => e.status === 'LOGGED'),
    [locatedEmergencies],
  );

  const fitAll = useCallback(() => {
    setFitNonce((n) => n + 1);
  }, []);

  const urgentCount = useMemo(
    () => locatedRequests.filter((r) => r.priority === 'urgent').length,
    [locatedRequests],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--color-surface-workspace)]">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={5}
        minZoom={3}
        maxZoom={18}
        zoomControl={false}
        className="sahayak-map h-full w-full"
        style={{ position: 'absolute', inset: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ZoomControl position="bottomright" />
        <MapBehaviour points={points} fitNonce={fitNonce} />

        {showRequests &&
          locatedRequests.map((request) => (
            <Marker
              key={`request-${request.id}`}
              position={[request.latitude, request.longitude]}
              icon={markerIcon(request.priority === 'urgent' ? URGENT_COLOR : REQUEST_COLOR)}
              alt={`Help request: ${request.category}`}
            >
              <Popup>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <strong style={{ fontSize: '0.875rem' }}>Help request</strong>
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: '#fff',
                        borderRadius: '0.25rem',
                        padding: '0.125rem 0.375rem',
                        backgroundColor: request.priority === 'urgent' ? URGENT_COLOR : REQUEST_COLOR,
                      }}
                    >
                      {request.priority}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.4 }}>{request.description}</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                    <PopupRow label="Category">{request.category.replace(/_/g, ' ')}</PopupRow>
                    <PopupRow label="Status">{request.status.replace(/_/g, ' ')}</PopupRow>
                    <PopupRow label="Senior">{request.senior.full_name ?? request.senior.email ?? 'Unknown'}</PopupRow>
                    <PopupRow label="Raised">
                      {new Date(request.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </PopupRow>
                  </div>

                  <Link to={`/requests/${request.id}`} style={popupLink}>
                    Open request →
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}

        {showEmergencies &&
          locatedEmergencies.map((event) => (
            <Marker
              key={`emergency-${event.id}`}
              position={[event.latitude, event.longitude]}
              icon={markerIcon(event.status === 'LOGGED' ? EMERGENCY_COLOR : REVIEWED_COLOR, event.status === 'LOGGED')}
              alt={`Emergency: ${event.trigger_type}`}
            >
              <Popup>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <strong style={{ fontSize: '0.875rem' }}>Emergency SOS</strong>
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: '#fff',
                        borderRadius: '0.25rem',
                        padding: '0.125rem 0.375rem',
                        backgroundColor: event.status === 'LOGGED' ? EMERGENCY_COLOR : REVIEWED_COLOR,
                      }}
                    >
                      {event.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                    <PopupRow label="Trigger">{event.trigger_type.replace(/_/g, ' ')}</PopupRow>
                    <PopupRow label="Senior">{event.senior.full_name ?? event.senior.email}</PopupRow>
                    <PopupRow label="Contact">{event.senior.phone_number ?? 'Not provided'}</PopupRow>
                    <PopupRow label="Escalated to 112">{event.escalated_to_112 ? 'Yes' : 'No'}</PopupRow>
                    <PopupRow label="Raised">
                      {new Date(event.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </PopupRow>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Link to={`/seniors/${event.senior_id}`} style={popupLink}>
                      Open senior →
                    </Link>
                    {event.help_request_id && (
                      <Link to={`/requests/${event.help_request_id}`} style={popupLink}>
                        Open request →
                      </Link>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>

      {error && (
        <div
          role="alert"
          className="absolute left-1/2 top-4 z-[1000] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--color-status-error)]/30 bg-[var(--color-status-error-bg)] px-4 py-2.5 text-sm font-medium text-[var(--color-status-error)] shadow-[var(--shadow-md)]"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load(true)}
            className="rounded-md border border-current px-2 py-0.5 text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-[900] flex flex-col justify-between p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className={`${panelClass} px-4 py-3`}>
            <h1 className="flex items-center gap-2 text-sm font-bold leading-tight text-[var(--color-text-primary)] sm:text-base">
              <MapPin size={16} className="text-[var(--color-text-secondary)]" />
              Operational Map
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-text-secondary)]">
              <span className="tabular-nums">{locatedRequests.length} requests plotted</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {activeEmergencies.length} SOS awaiting review
              </span>
              {unlocated > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-[var(--color-status-warning)]" title="Records with no coordinates are not shown as markers.">
                    {unlocated} not mappable
                  </span>
                </>
              )}
            </div>
          </div>

          <div className={`${panelClass} flex flex-col items-end gap-2 p-2`}>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <ToggleChip
                active={showRequests}
                color={REQUEST_COLOR}
                count={locatedRequests.length}
                label="Requests"
                onClick={() => setShowRequests((value) => !value)}
              />
              <ToggleChip
                active={showEmergencies}
                color={EMERGENCY_COLOR}
                count={locatedEmergencies.length}
                label="Emergencies"
                onClick={() => setShowEmergencies((value) => !value)}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={fitAll}
                disabled={points.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-black/5 hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Crosshair size={13} />
                Fit all
              </button>
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                aria-label="Refresh map data"
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-black/5 hover:text-[var(--color-text-primary)] disabled:opacity-50"
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ backgroundColor: REQUEST_COLOR }} />
              Help request
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ backgroundColor: URGENT_COLOR }} />
              Urgent ({urgentCount})
            </span>
            <span className="flex items-center gap-2">
              <span
                className="sahayak-marker-pulse h-3 w-3 rounded-full ring-2 ring-white"
                style={{ backgroundColor: EMERGENCY_COLOR, animationDuration: '2s' }}
              />
              SOS, awaiting review
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ backgroundColor: REVIEWED_COLOR }} />
              SOS, reviewed
            </span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 z-[950] grid place-items-center bg-[var(--color-surface-workspace)]">
          <span className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading map data…
          </span>
        </div>
      )}

      {!loading && points.length === 0 && !error && (
        <div className="pointer-events-none absolute inset-0 z-[900] grid place-items-center">
          <div className={`${panelClass} max-w-sm px-5 py-4 text-center`}>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Nothing to plot</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              No help request or SOS event has coordinates yet. They appear here as soon as one
              does.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
