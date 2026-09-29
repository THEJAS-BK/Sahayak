import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Verification } from './pages/Verification';
import { VerificationDetails } from './pages/VerificationDetails';
import { Requests } from './pages/Requests';
import { RequestDetails } from './pages/RequestDetails';
import { Login } from './pages/Login';
import { Emergencies } from './pages/Emergencies';
import { Volunteers } from './pages/Volunteers';
import { VolunteerDetails } from './pages/VolunteerDetails';
import { Seniors } from './pages/Seniors';
import { SeniorDetails } from './pages/SeniorDetails';
import { AuditLogs } from './pages/AuditLogs';
import { MapPage } from './pages/Map';
import { Monitoring } from './pages/Monitoring';
import { clearSession, getSessionRole, getToken } from './api/client';

const card: React.CSSProperties = {
  padding: '2rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-surface-white)',
  maxWidth: '32rem',
};

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  // This portal is the police console. The API rejects a non-police caller on
  // every route (requireRole('police')), so without this a senior or volunteer
  // who logged in would land on a shell of empty pages and 403s.
  if (getSessionRole() !== 'police') {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={card}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Police access only</h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 1rem 0' }}>
            This portal is for police officers. Sign in with a police account, or clear the session
            and try again.
          </p>
          {/* Without this the officer is stuck: every route is behind the same
              guard, so the only way out was clearing site data by hand. */}
          <button
            type="button"
            onClick={() => {
              clearSession();
              window.location.assign('/login');
            }}
            style={{
              padding: '0.5rem 0.875rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--color-border)',
              background: 'var(--color-primary-navy)',
              color: 'var(--color-text-inverse)',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign in as an officer
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

const NotFound: React.FC = () => (
  <div style={{ padding: '2rem' }}>
    <div style={card}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Page not found</h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 1rem 0' }}>
        That address does not match any screen in the console.
      </p>
      <Link
        to="/"
        style={{ color: 'var(--color-primary-navy)', fontSize: '0.875rem', fontWeight: 600 }}
      >
        ← Back to the dashboard
      </Link>
    </div>
  </div>
);

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="verification" element={<Verification />} />
          <Route
            path="verification/:verificationId"
            element={<VerificationDetails />}
          />
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
  );
}

export default App;
