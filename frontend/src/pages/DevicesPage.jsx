import React, { useState, useEffect } from 'react';
import {
  Server,
  Search,
  PlusCircle,
  Activity,
  ShieldAlert,
  X,
  RefreshCw,
  Info,
} from 'lucide-react';
import { api } from '../api';
import { HealthBadge, ConnectionBadge } from '../components/StatusBadge';
import { deriveOperationalHealth } from '../utils/statusUtils';
import { useToast } from '../context/ToastContext';

export default function DevicesPage({ onNavigate, onSelectDevice, onOpenAddDevice }) {
  const toast = useToast();
  const [devices, setDevices] = useState([]);
  const [metricsMap, setMetricsMap] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadDevices(isManual = false) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDevices();
      setDevices(data);

      // Fetch latest metrics for each device
      const metrics = {};
      await Promise.all(
        data.map(async (dev) => {
          try {
            const m = await api.getLatestMetric(dev.id);
            metrics[dev.id] = m;
          } catch (_) {
            metrics[dev.id] = null;
          }
        })
      );
      setMetricsMap(metrics);
      if (isManual) {
        toast.success('Monitoring data refreshed.');
      }
    } catch (err) {
      const errMsg = err.message || 'Failed to load devices.';
      setError(errMsg);
      if (isManual) {
        toast.error(errMsg);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices(false);
  }, []);

  const filteredDevices = devices.filter(
    (d) =>
      d.device_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.ip_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.device_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-body">
      {/* Header & Actions */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Registered Network Devices</h2>
          <p className="page-subtitle">
            Inventory of routers, switches, and hosts with persistent configuration in PostgreSQL
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button className="btn btn-secondary" onClick={() => loadDevices(true)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={onOpenAddDevice}>
            <PlusCircle size={15} /> Add Device
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-box alert-error">
          <div style={{ flex: 1 }}>
            <strong>Failed to load devices:</strong> {error}
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => loadDevices(true)}>
            Retry
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="card" style={{ padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Search size={17} color="var(--text-secondary)" />
          <input
            type="text"
            className="form-input"
            style={{ border: 'none', background: 'transparent', padding: '0.2rem' }}
            placeholder="Search by device name, IP address, or device type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem' }}
              title="Clear search"
            >
              <X size={16} />
            </button>
          )}
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
            Showing {filteredDevices.length} of {devices.length}
          </span>
        </div>
      </div>

      {/* Devices Grid */}
      {loading && devices.length === 0 ? (
        <div className="state-container">
          <RefreshCw size={28} className="spin state-icon" />
          <div className="state-title">Loading network devices...</div>
          <p className="state-desc">Retrieving registered network nodes and latest telemetry status.</p>
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="card">
          <div className="state-container">
            <Server size={38} className="state-icon" />
            <div className="state-title">{searchTerm ? 'No Matching Devices' : 'No Devices Registered'}</div>
            <p className="state-desc">
              {searchTerm
                ? `No device matches "${searchTerm}". Check the device name or IP address filter.`
                : 'Register your first router, switch, or server with its network address to begin monitoring.'}
            </p>
            {searchTerm ? (
              <button className="btn btn-secondary" onClick={() => setSearchTerm('')}>
                Clear Search
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onOpenAddDevice}>
                <PlusCircle size={15} /> Add First Device
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '1.25rem' }}>
          {filteredDevices.map((dev) => {
            const latestMetric = metricsMap[dev.id];
            const operationalHealth = deriveOperationalHealth(latestMetric);

            return (
              <div key={dev.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                {/* Card Header: Name, ID, Badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--accent-blue-subtle)',
                        color: 'var(--accent-blue-highlight)',
                        border: '1px solid var(--accent-blue-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Server size={19} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        {dev.device_name}
                      </h3>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>ID #{dev.id}</div>
                    </div>
                  </div>
                  <HealthBadge status={operationalHealth} size="sm" />
                </div>

                {/* Device Specifications Table/List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.84rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>IP Address:</span>
                    <code>{dev.ip_address}</code>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Device Type:</span>
                    <span className="badge badge-type badge-sm">{dev.device_type}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Connection State:</span>
                    <ConnectionBadge status={dev.status} size="sm" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Data Source:</span>
                    <span className={`badge ${dev.monitoring_method === 'SIMULATED' ? 'badge-source-simulated' : 'badge-source-snmp'} badge-sm`}>
                      {dev.monitoring_method === 'SIMULATED' ? 'Simulated' : 'SNMP'}
                    </span>
                  </div>
                  {latestMetric && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.35rem', borderTop: '1px solid var(--border-subtle)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Telemetry Snapshot:</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-main)', fontWeight: 500 }}>
                        CPU: {latestMetric.cpu_utilization.toFixed(1)}% • Mem: {latestMetric.memory_usage.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, fontSize: '0.8rem', justifyContent: 'center', padding: '0.42rem 0.5rem' }}
                    onClick={() => {
                      onSelectDevice(dev.id);
                      onNavigate('monitoring');
                    }}
                  >
                    <Activity size={14} color="var(--accent-blue-highlight)" /> Telemetry
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, fontSize: '0.8rem', justifyContent: 'center', padding: '0.42rem 0.5rem' }}
                    onClick={() => {
                      onSelectDevice(dev.id);
                      onNavigate('analysis');
                    }}
                  >
                    <ShieldAlert size={14} color="var(--status-degraded-text)" /> Fault Risk
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Project Note */}
      <div className="academic-callout">
        <Info size={17} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-blue-highlight)' }} />
        <div>
          <strong>Device Registration Standard:</strong> Network addresses are registered explicitly by administrative configuration.
          In accordance with the project specification, automatic subnet discovery is disabled; the system interfaces with virtual simulators
          or physical network agents based on configured IP endpoints.
        </div>
      </div>
    </div>
  );
}
