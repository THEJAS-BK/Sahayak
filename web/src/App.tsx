import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Verification } from './pages/Verification';
import { Requests } from './pages/Requests';
import { RequestDetails } from './pages/RequestDetails';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/verification" element={<Verification />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/requests/:requestId" element={<RequestDetails />} />
          <Route path="*" element={<div style={{ padding: '2rem' }}>Page not found or under construction.</div>} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;