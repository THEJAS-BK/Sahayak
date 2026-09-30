import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { Layout } from './components/layout/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
// Login stays eager: it is where an unauthenticated officer lands, so making it
// wait on a chunk request adds a round trip to the one screen that has nothing
// to show beforehand. Everything else is split, which keeps Leaflet off the
// critical path — it is the largest dependency and only the map route needs it.
import { Login } from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Verification = lazy(() => import('./pages/Verification').then((m) => ({ default: m.Verification })));
const Requests = lazy(() => import('./pages/Requests').then((m) => ({ default: m.Requests })));
const RequestDetails = lazy(() =>
  import('./pages/RequestDetails').then((m) => ({ default: m.RequestDetails })),
);
const Emergencies = lazy(() => import('./pages/Emergencies').then((m) => ({ default: m.Emergencies })));
const Volunteers = lazy(() => import('./pages/Volunteers').then((m) => ({ default: m.Volunteers })));
const VolunteerDetails = lazy(() =>
  import('./pages/VolunteerDetails').then((m) => ({ default: m.VolunteerDetails })),
);
const Seniors = lazy(() => import('./pages/Seniors').then((m) => ({ default: m.Seniors })));
const SeniorDetails = lazy(() =>
  import('./pages/SeniorDetails').then((m) => ({ default: m.SeniorDetails })),
);
const AuditLogs = lazy(() => import('./pages/AuditLogs').then((m) => ({ default: m.AuditLogs })));
const MapPage = lazy(() => import('./pages/Map').then((m) => ({ default: m.MapPage })));
const Monitoring = lazy(() => import('./pages/Monitoring').then((m) => ({ default: m.Monitoring })));
import { clearSession, getSessionRole, getToken } from './api/client';
import { OverviewProvider } from './lib/useOverview';
import { Button } from './components/ui/Button';

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  // This portal is the police console. The API rejects a non-police caller on
  // every route (requireRole('police')), so without this a senior or volunteer
  // who logged in would land on a shell of empty pages and 403s.
  if (getSessionRole() !== 'police') {
    return (
      <div className="auth-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div
          style={{
            maxWidth: '32rem',
            background: 'var(--color-raised)',
            borderRadius: 'var(--radius-panel)',
            boxShadow: 'var(--shadow-raised)',
            padding: '2rem',
          }}
        >
          <h1 style={{ fontSize: 'var(--text-display)', fontWeight: 700, margin: 0 }}>Police access only</h1>
          <p
            style={{
              color: 'var(--color-ink-muted)',
              margin: '0.5rem 0 1.25rem 0',
              fontSize: 'var(--text-body)',
              lineHeight: 1.5,
            }}
          >
            This portal is for police officers. Sign in with a police account, or clear the session
            and try again.
          </p>
          {/* Without this the officer is stuck: every route is behind the same
              guard, so the only way out was clearing site data by hand. */}
          <Button
            onClick={() => {
              clearSession();
              window.location.assign('/login');
            }}
          >
            Sign in as an officer
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

const NotFound: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
    <div style={{ textAlign: 'center', maxWidth: '34ch' }}>
      <h1 style={{ fontSize: 'var(--text-display)', fontWeight: 700, margin: 0 }}>Page not found</h1>
      <p
        style={{
          color: 'var(--color-ink-muted)',
          margin: '0.5rem 0 1.25rem',
          fontSize: 'var(--text-body)',
          lineHeight: 1.5,
        }}
      >
        That address does not match any screen in the console.
      </p>
      <Link to="/">
        <Button variant="outline">Back to the dashboard</Button>
      </Link>
    </div>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <OverviewProvider>
                  {/* Mount-time chunk fetches for the shell and the index
                      route have no boundary yet, so this one stands alone. */}
                  <Suspense fallback={null}>
                    <Layout />
                  </Suspense>
                </OverviewProvider>
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="verification" element={<Verification />} />
            <Route path="requests" element={<Requests />} />
            <Route path="requests/:requestId" element={<RequestDetails />} />
            <Route path="monitoring" element={<Monitoring />} />
            <Route path="emergencies" element={<Emergencies />} />
            <Route path="volunteers" element={<Volunteers />} />
            <Route path="volunteers/:volunteerId" element={<VolunteerDetails />} />
            <Route path="seniors" element={<Seniors />} />
            <Route path="seniors/:seniorId" element={<SeniorDetails />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="map" element={<MapPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
