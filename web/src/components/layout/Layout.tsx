import React, { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SkeletonTable } from '../ui/Skeleton';

/**
 * Routes that own the entire content pane instead of the centred column.
 * `immersive` routes additionally drop the app header, because the map is the
 * page — keeping a bar above it only shrinks the area an officer can pan
 * across, and the map's own title panel already labels it.
 */
const IMMERSIVE_PATHS = new Set(['/map']);

export const Layout: React.FC = () => {
  const { pathname } = useLocation();
  const immersive = IMMERSIVE_PATHS.has(pathname);

  return (
    <div className="app-shell" style={{ display: 'flex', width: '100%', overflow: 'hidden' }}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>

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
          id="main"
          // Focusable so the skip link relocates the keyboard cursor and not
          // just the scroll position. -1 keeps it out of the tab order.
          tabIndex={-1}
          style={{
            flex: 1,
            minHeight: 0,
            // Scales with the pane rather than eating a fixed 2rem on a laptop.
            padding: immersive ? 0 : 'clamp(1rem, 2.2vw, 2rem)',
            overflowY: immersive ? 'hidden' : 'auto',
            // Without this the map's Leaflet controls (z-index 1000) paint over
            // the header strip: both are siblings in the same stacking context,
            // and Leaflet wins on raw z-index.
            position: immersive ? 'relative' : 'static',
            zIndex: immersive ? 0 : 'auto',
            isolation: immersive ? 'isolate' : 'auto',
          }}
        >
          {/* The boundary sits inside the shell, not around it in App, so a
              route chunk arriving does not blank the sidebar and header the
              officer is navigating with. */}
          <Suspense
            fallback={
              immersive ? null : (
                <div role="status" aria-live="polite" style={{ paddingTop: '1rem' }}>
                  <span className="sr-only">Loading this screen…</span>
                  <SkeletonTable columns={5} rows={6} />
                </div>
              )
            }
          >
            {immersive ? (
              <Outlet />
            ) : (
              <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '3rem' }}>
                <Outlet />
              </div>
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
};
