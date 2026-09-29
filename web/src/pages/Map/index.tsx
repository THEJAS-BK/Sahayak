import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '../../components/ui/Card';
import { fetchEmergencyEvents, fetchPoliceRequests } from '../../api/client';
import type { EmergencyEvent, PoliceRequest } from '../../api/types';

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

const createMarkerIcon = (type: 'request' | 'emergency') =>
  L.divIcon({
    className: '',
    html: `<div style="
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${type === 'emergency' ? 'var(--color-status-error)' : '#3B82F6'};
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const requestIcon = createMarkerIcon('request');
const emergencyIcon = createMarkerIcon('emergency');

function FitBounds({
  points,
}: {
  points: Array<[number, number]>;
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    }
  }, [map, points]);

  return null;
}

export const Map: React.FC = () => {
  const [requests, setRequests] = useState<PoliceRequest[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRequests, setShowRequests] = useState(true);
  const [showEmergencies, setShowEmergencies] = useState(true);

  useEffect(() => {
    const loadMapData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [requestResult, emergencyResult] = await Promise.all([
          fetchPoliceRequests({ limit: '200' }),
          fetchEmergencyEvents({ limit: 200 }),
        ]);

        setRequests(requestResult.requests);
        setEmergencies(emergencyResult.events);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load map data');
      } finally {
        setLoading(false);
      }
    };

    void loadMapData();
  }, []);

  const visibleRequests = useMemo(
    () => requests.filter((request) => request.latitude != null && request.longitude != null),
    [requests],
  );

  const visibleEmergencies = useMemo(
    () => emergencies.filter((event) => event.latitude != null && event.longitude != null),
    [emergencies],
  );

  const points = useMemo<Array<[number, number]>>(
  () => [
    ...(showRequests
      ? visibleRequests.map(
          (request) =>
            [request.latitude!, request.longitude!] as [number, number],
        )
      : []),
    ...(showEmergencies
      ? visibleEmergencies.map(
          (event) =>
            [event.latitude!, event.longitude!] as [number, number],
        )
      : []),
  ],
  [showRequests, showEmergencies, visibleRequests, visibleEmergencies],
);

  return (
    <div className="flex flex-col gap-5 h-full">
      <div>
        <h1 className="text-3xl font-bold mb-2">
          Operational Map & GIS Dispatch
        </h1>
        <p className="text-[var(--color-text-secondary)]">
          Geographic view of active requests and emergency events.
        </p>
      </div>

      <Card>
        <div className="px-5 py-4 flex items-center gap-6 flex-wrap border-b border-[var(--color-border)]">
          <strong className="font-semibold text-gray-900">Map Filters</strong>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
              checked={showRequests}
              onChange={(event) => setShowRequests(event.target.checked)}
            />
            <span className="text-sm font-medium text-gray-700">Help Requests</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-gray-300"
              checked={showEmergencies}
              onChange={(event) => setShowEmergencies(event.target.checked)}
            />
            <span className="text-sm font-medium text-gray-700">Emergency Events</span>
          </label>

          <span className="ml-auto text-[var(--color-text-secondary)] text-sm">
            {visibleRequests.length} requests · {visibleEmergencies.length} emergencies
          </span>
        </div>

        {error && (
          <div className="px-4 py-3 bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] text-sm">
            {error}
          </div>
        )}

        <div className="relative h-[620px]">
          {loading ? (
            <div className="grid place-items-center h-full w-full text-gray-500 bg-gray-50">
              Loading map data…
            </div>
          ) : (
            <MapContainer
              center={DEFAULT_CENTER}
              zoom={5}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <FitBounds points={points} />

              {showRequests &&
                visibleRequests.map((request) => (
                  <Marker
                    key={`request-${request.id}`}
                    position={[request.latitude!, request.longitude!]}
                    icon={requestIcon}
                  >
                    <Popup className="rounded-md">
                      <div className="flex flex-col gap-1">
                        <strong className="text-base text-gray-900">Help Request</strong>
                        <div className="text-sm text-gray-600">
                          <span className="font-semibold text-gray-700">Category:</span> {request.category}
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-semibold text-gray-700">Priority:</span> {request.priority}
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-semibold text-gray-700">Status:</span> {request.status}
                        </div>
                        <p className="mt-1 text-sm text-gray-800">{request.description}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}

              {showEmergencies &&
                visibleEmergencies.map((event) => (
                  <Marker
                    key={`emergency-${event.id}`}
                    position={[event.latitude!, event.longitude!]}
                    icon={emergencyIcon}
                  >
                    <Popup className="rounded-md">
                      <div className="flex flex-col gap-1">
                        <strong className="text-base text-gray-900">Emergency Event</strong>
                        <div className="text-sm text-gray-600">
                          <span className="font-semibold text-gray-700">Trigger:</span> {event.trigger_type}
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-semibold text-gray-700">Status:</span> {event.status}
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-semibold text-gray-700">Escalated to 112:</span> {event.escalated_to_112 ? 'Yes' : 'No'}
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-semibold text-gray-700">Senior:</span> {event.senior.full_name ?? 'Unknown'}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>
          )}
        </div>

        <div className="px-5 py-3.5 flex gap-6 items-center border-t border-[var(--color-border)] text-[13px] font-medium text-gray-700 bg-gray-50 rounded-b-lg">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500 border border-white shadow-sm"></span>
            Help Request
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[var(--color-status-error)] border border-white shadow-sm"></span>
            Emergency Event
          </span>
          <span className="ml-auto text-[var(--color-text-secondary)]">
            {loading ? 'Loading…' : 'Live data'}
          </span>
        </div>
      </Card>
    </div>
  );
};
