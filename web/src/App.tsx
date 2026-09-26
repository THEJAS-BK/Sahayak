import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Verification } from './pages/Verification';
import { Requests } from './pages/Requests';
import { RequestDetails } from './pages/RequestDetails';
import { Login } from './pages/Login';
import { getSessionRole, getToken } from './api/client';

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  // This portal is the police console. The API rejects a non-police caller on
  // every route (requireRole('police')), so without this a senior or volunteer
  // who logged in would land on a shell of empty pages and 403s.
  if (getSessionRole() !== 'police') {
    return (
      <div style={{ padding: '2rem', maxWidth: '32rem' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Police access only</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          This portal is for police officers. Sign in with a police account, or clear the
          session and try again.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

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
          <Route path="requests" element={<Requests />} />
          <Route path="requests/:requestId" element={<RequestDetails />} />
          <Route path="*" element={<div style={{ padding: '2rem' }}>Page not found or under construction.</div>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;