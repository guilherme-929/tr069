import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Models from './pages/Models';
import Firmware from './pages/Firmware';
import Provisioning from './pages/Provisioning';
import Clients from './pages/Clients';
import Logs from './pages/Logs';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import SystemConfig from './pages/SystemConfig';
import Provisions from './pages/Provisions';
import Layout from './components/Layout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="devices" element={<Devices />} />
        <Route path="models" element={<Models />} />
        <Route path="firmware" element={<Firmware />} />
        <Route path="provisioning" element={<Provisioning />} />
        <Route path="clients" element={<Clients />} />
        <Route path="logs" element={<Logs />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="settings" element={<Settings />} />
        <Route path="system-config" element={<SystemConfig />} />
        <Route path="provisions" element={<Provisions />} />
      </Route>
    </Routes>
  );
}
