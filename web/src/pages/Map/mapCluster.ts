import L from 'leaflet';

/**
 * Grid clustering for the operational map.
 *
 * Written here rather than pulled in as a plugin. `leaflet.markercluster` ships
 * no type definitions and its imperative API (`L.MarkerClusterGroup`) does not
 * fit react-leaflet's declarative model without a wrapper that re-implements
 * most of it anyway. What the map needs is one thing — group markers that are
 * within a screenful of each other at the current zoom — and that is a
 * projection, a grid and a dictionary.
 *
 * The grid is measured in *pixels*, not degrees, so a cluster means "these are
 * indistinguishable at this zoom" rather than an arbitrary distance. A degree of
 * longitude is 111 km at the equator and 0 km at the pole; a fixed degree
 * threshold therefore clusters aggressively near the poles and not at all in
 * India. Bucketing in projected pixel space makes the rule the same everywhere.
 */

export interface Clusterable {
  lat: number;
  lng: number;
}

/** Pixels per cluster cell. Roughly the width of a pin, so clusters never look sparse. */
const CELL_PX = 64;

export interface GridCluster<T> {
  /** Representative position: the mean of its members, not the first one. */
  lat: number;
  lng: number;
  members: T[];
  /** Bounding box of the members, used to zoom to a cluster's extent. */
  bounds: L.LatLngBounds;
}

/**
 * Groups `items` into clusters for a given projection.
 *
 * `project`/`unproject` come from the live `L.Map`, so the result tracks the
 * current zoom and, on a moved map, the current view origin.
 */
export function clusterByGrid<T extends Clusterable>(
  items: T[],
  project: (point: L.LatLngExpression) => L.Point,
  unproject: (point: L.PointExpression) => L.LatLng,
  cellPx: number = CELL_PX,
): GridCluster<T>[] {
  if (items.length === 0) return [];

  const cells = new Map<string, { px: number; py: number; members: T[] }>();

  for (const item of items) {
    const point = project([item.lat, item.lng] as L.LatLngTuple);
    // Round rather than floor so the grid is centred on the origin and the
    // bucket boundaries do not sit at fractional pixel positions.
    const key = `${Math.round(point.x / cellPx)}:${Math.round(point.y / cellPx)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.members.push(item);
    } else {
      cells.set(key, { px: point.x, py: point.y, members: [item] });
    }
  }

  const clusters: GridCluster<T>[] = [];

  for (const cell of cells.values()) {
    if (cell.members.length === 1) {
      const only = cell.members[0];
      clusters.push({
        lat: only.lat,
        lng: only.lng,
        members: cell.members,
        bounds: L.latLngBounds([[only.lat, only.lng]]),
      });
      continue;
    }

    // Averaging in projected space and unprojecting once is both cheaper and
    // more correct than averaging latitudes and longitudes directly, which
    // weights a point oddly as it approaches the pole.
    const n = cell.members.length;
    let sx = 0;
    let sy = 0;
    for (const member of cell.members) {
      const point = project([member.lat, member.lng] as L.LatLngTuple);
      sx += point.x;
      sy += point.y;
    }
    const center = unproject(new L.Point(sx / n, sy / n));

    const bounds = L.latLngBounds([]);
    for (const member of cell.members) bounds.extend([member.lat, member.lng]);

    clusters.push({
      lat: center.lat,
      lng: center.lng,
      members: cell.members,
      bounds,
    });
  }

  return clusters;
}

/** Keeps the bucket size in a sane range as the zoom changes. */
export const cellSizeForZoom = (zoom: number): number =>
  zoom >= 15 ? 44 : zoom >= 13 ? 56 : zoom >= 10 ? 72 : 96;
