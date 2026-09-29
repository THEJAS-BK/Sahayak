import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

/**
 * Routes that own the entire content pane instead of the centred 1200px column.
 * `immersive` routes additionally drop the app header, because the map is the
 * page — keeping a 72px bar above it only shrinks the area an officer can pan
 * across, and the map's own title panel already labels it.
 */
const IMMERSIVE_PATHS = new Set(['/map']);

export const Layout: React.FC = () => {
  const { pathname } = useLocation();
  const immersive = IMMERSIVE_PATHS.has(pathname);

  return (
    <div
      className="app-shell"
      style={{
        display: 'flex',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <Sidebar />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {!immersive && <Header />}
        <main
          style={{
            flex: 1,
            minHeight: 0,
            padding: immersive ? 0 : '2rem',
            overflowY: immersive ? 'hidden' : 'auto',
            // Without this the map's Leaflet controls (z-index 1000) paint over
            // the header strip: both are siblings in the same stacking context,
            // and Leaflet wins on raw z-index.
            position: immersive ? 'relative' : 'static',
            zIndex: immersive ? 0 : 'auto',
            isolation: immersive ? 'isolate' : 'auto',
          }}
        >
          {immersive ? (
            <Outlet />
          ) : (
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
