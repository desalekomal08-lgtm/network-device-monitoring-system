import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Server,
  Waypoints,
  Activity,
  ShieldAlert,
  Network,
} from 'lucide-react';
import { api } from './api';
import OverviewPage from './pages/OverviewPage';
import DevicesPage from './pages/DevicesPage';
import NetworkMapPage from './pages/NetworkMapPage';
import MonitoringPage from './pages/MonitoringPage';
import FaultAnalysisPage from './pages/FaultAnalysisPage';
import AddDeviceModal from './components/AddDeviceModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [serverHealth, setServerHealth] = useState({ online: false, dbStatus: 'checking...' });

  async function checkServerHealth() {
    try {
      const data = await api.getHealth();
      setServerHealth({
        online: data.status === 'online',
        dbStatus: data.database || 'connected',
      });
    } catch (_) {
      setServerHealth({
        online: false,
        dbStatus: 'disconnected',
      });
    }
  }

  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(checkServerHealth, 20000); // Poll every 20s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Network size={20} />
          </div>
          <div>
            <div className="brand-title">NetMonitor</div>
            <div className="brand-subtitle">Predictive Fault Analysis</div>
          </div>
        </div>

        <ul className="nav-links">
          <li
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <LayoutDashboard size={18} /> Overview
          </li>
          <li
            className={`nav-item ${activeTab === 'devices' ? 'active' : ''}`}
            onClick={() => setActiveTab('devices')}
          >
            <Server size={18} /> Devices
          </li>
          <li
            className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
          >
            <Waypoints size={18} /> Network Map
          </li>
          <li
            className={`nav-item ${activeTab === 'monitoring' ? 'active' : ''}`}
            onClick={() => setActiveTab('monitoring')}
          >
            <Activity size={18} /> Monitoring
          </li>
          <li
            className={`nav-item ${activeTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveTab('analysis')}
          >
            <ShieldAlert size={18} /> Fault Analysis
          </li>
        </ul>

        {/* Backend & DB Health Indicator */}
        <div className="server-status-pill">
          <span className={`status-dot ${serverHealth.online ? 'online' : 'offline'}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: serverHealth.online ? 'var(--status-healthy-text)' : 'var(--status-critical-text)' }}>
              {serverHealth.online ? 'Backend Online' : 'Backend Offline'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              PostgreSQL: {serverHealth.dbStatus}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'overview' && (
          <OverviewPage
            onNavigate={setActiveTab}
            onSelectDevice={setSelectedDeviceId}
            onOpenAddDevice={() => setIsAddModalOpen(true)}
          />
        )}

        {activeTab === 'devices' && (
          <DevicesPage
            onNavigate={setActiveTab}
            onSelectDevice={setSelectedDeviceId}
            onOpenAddDevice={() => setIsAddModalOpen(true)}
          />
        )}

        {activeTab === 'map' && (
          <NetworkMapPage
            onNavigate={setActiveTab}
            onSelectDevice={setSelectedDeviceId}
            onOpenAddDevice={() => setIsAddModalOpen(true)}
          />
        )}

        {activeTab === 'monitoring' && (
          <MonitoringPage
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
          />
        )}

        {activeTab === 'analysis' && (
          <FaultAnalysisPage
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
          />
        )}
      </main>

      {/* Global Add Device Modal */}
      <AddDeviceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onDeviceAdded={(newDev) => {
          setSelectedDeviceId(newDev.id);
          // Trigger refresh by re-navigating
          if (activeTab === 'devices' || activeTab === 'overview') {
            setActiveTab('devices');
          }
        }}
      />
    </div>
  );
}
