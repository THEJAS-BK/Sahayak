import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Verification } from './pages/Verification';
import { Requests } from './pages/Requests';
import { RequestDetails } from './pages/RequestDetails';
import { Login } from './pages/Login';
import { getToken } from './api/client';

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
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