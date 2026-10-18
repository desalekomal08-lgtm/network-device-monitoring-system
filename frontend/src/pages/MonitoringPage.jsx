import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  AlertTriangle,
  RefreshCw,
  Server,
  TrendingUp,
  Clock,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api } from '../api';
import { HealthBadge, ConnectionBadge } from '../components/StatusBadge';
import { deriveOperationalHealth } from '../utils/statusUtils';
import { useToast } from '../context/ToastContext';

export default function MonitoringPage({ selectedDeviceId, onSelectDevice }) {
  const toast = useToast();
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(selectedDeviceId || '');
  const [metrics, setMetrics] = useState([]);
  const [latestMetric, setLatestMetric] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load available devices
  useEffect(() => {
    async function initDevices() {
      try {
        const devList = await api.getDevices();
        setDevices(devList);
        if (devList.length > 0 && !deviceId) {
          setDeviceId(devList[0].id);
        }
      } catch (err) {
        setError('Could not fetch devices list.');
      }
    }
    initDevices();
  }, []);

  // Sync if prop changes externally
  useEffect(() => {
    if (selectedDeviceId) {
      setDeviceId(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  // Load telemetry metrics for selected device
  async function loadMetrics(isManual = false) {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    try {
      const [histData, latestData] = await Promise.allSettled([
        api.getDeviceMetrics(deviceId, 40),
        api.getLatestMetric(deviceId),
      ]);

      if (histData.status === 'fulfilled') {
        // Recharts displays chronologically left-to-right (oldest -> newest)
        const sorted = [...histData.value].reverse();
        setMetrics(sorted);
      } else {
        setMetrics([]);
      }

      if (latestData.status === 'fulfilled') {
        setLatestMetric(latestData.value);
      } else {
        setLatestMetric(null);
      }

      if (isManual) {
        toast.success('Monitoring data refreshed.');
      }
    } catch (err) {
      const errMsg = err.message || 'Failed to fetch telemetry metrics.';
      setError(errMsg);
      if (isManual) {
        toast.error(errMsg);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMetrics(false);
  }, [deviceId]);

  const activeDevice = devices.find((d) => d.id === Number(deviceId));
  const currentHealth = deriveOperationalHealth(latestMetric);

  // Chart data format
  const chartData = metrics.map((m) => ({
    time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    cpu: Number(m.cpu_utilization.toFixed(1)),
    memory: Number(m.memory_usage.toFixed(1)),
    latency: Number(m.latency.toFixed(1)),
    packet_loss: Number(m.packet_loss.toFixed(2)),
    bandwidth: Number(m.bandwidth.toFixed(1)),
  }));

  return (
    <div className="page-body">
      {/* Header & Device Selection */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Live Telemetry & Metrics</h2>
          <p className="page-subtitle">
            Time-series performance metrics and telemetry streams logged to PostgreSQL
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server size={17} color="var(--text-secondary)" />
            <select
              className="form-select"
              style={{ width: '230px' }}
              value={deviceId}
              onChange={(e) => {
                const newId = Number(e.target.value);
                setDeviceId(newId);
                onSelectDevice(newId);
              }}
              disabled={devices.length === 0}
            >
              {devices.length === 0 && <option value="">No devices registered</option>}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.device_name} ({d.ip_address})
                </option>
              ))}
            </select>
          </div>

          <button className="btn btn-secondary" onClick={() => loadMetrics(true)} disabled={loading || !deviceId}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Active Device Context Strip */}
      {activeDevice && (
        <div className="card" style={{ padding: '0.75rem 1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Target Node:</span>
              <strong style={{ color: 'var(--text-main)' }}>{activeDevice.device_name}</strong>
              <span style={{ color: 'var(--text-dim)' }}>•</span>
              <span style={{ color: 'var(--text-secondary)' }}>Address:</span>
              <code>{activeDevice.ip_address}</code>
              <span style={{ color: 'var(--text-dim)' }}>•</span>
              <span style={{ color: 'var(--text-secondary)' }}>Type:</span>
              <span className="badge badge-type badge-sm">{activeDevice.device_type}</span>
              <span style={{ color: 'var(--text-dim)' }}>•</span>
              <span style={{ color: 'var(--text-secondary)' }}>Link:</span>
              <ConnectionBadge status={activeDevice.status} size="sm" />
              <span style={{ color: 'var(--text-dim)' }}>•</span>
              <span style={{ color: 'var(--text-secondary)' }}>Source:</span>
              <span className={`badge ${activeDevice.monitoring_method === 'SIMULATED' ? 'badge-source-simulated' : 'badge-source-snmp'} badge-sm`}>
                {activeDevice.monitoring_method === 'SIMULATED' ? 'Simulated Telemetry' : 'REST / SNMP Ingest'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Operational Health:</span>
              <HealthBadge status={currentHealth} size="sm" />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="alert-box alert-error">
          <AlertTriangle size={18} />
          <div style={{ flex: 1 }}>
            <strong>Telemetry Error:</strong> {error}
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => loadMetrics(true)}>
            Retry
          </button>
        </div>
      )}

      {/* Real-Time Metric Snapshot Cards */}
      {latestMetric ? (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: 'var(--accent-blue-subtle)', color: 'var(--accent-blue-highlight)', border: '1px solid var(--accent-blue-border)' }}>
              <Cpu size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-label">CPU Utilization</div>
              <div className="stat-value">{latestMetric.cpu_utilization.toFixed(1)}%</div>
              <div className="stat-subtext">Processor core load</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: 'var(--status-healthy-bg)', color: 'var(--status-healthy-text)', border: '1px solid var(--status-healthy-border)' }}>
              <HardDrive size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-label">Memory Usage</div>
              <div className="stat-value">{latestMetric.memory_usage.toFixed(1)}%</div>
              <div className="stat-subtext">Active buffer allocation</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: 'var(--status-degraded-bg)', color: 'var(--status-degraded-text)', border: '1px solid var(--status-degraded-border)' }}>
              <Wifi size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-label">Round-Trip Latency</div>
              <div className="stat-value">{latestMetric.latency.toFixed(1)} ms</div>
              <div className="stat-subtext">Network transit time</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: latestMetric.packet_loss > 0 ? 'var(--status-critical-bg)' : 'var(--status-unknown-bg)', color: latestMetric.packet_loss > 0 ? 'var(--status-critical-text)' : 'var(--text-secondary)', border: `1px solid ${latestMetric.packet_loss > 0 ? 'var(--status-critical-border)' : 'var(--status-unknown-border)'}` }}>
              <AlertTriangle size={22} />
            </div>
            <div className="stat-content">
              <div className="stat-label">Packet Loss & Errors</div>
              <div className="stat-value" style={{ color: latestMetric.packet_loss > 0 ? 'var(--status-critical-text)' : 'var(--text-main)' }}>
                {latestMetric.packet_loss.toFixed(2)}%
              </div>
              <div className="stat-subtext">{latestMetric.interface_errors} Interface Errors</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="state-container">
            <Activity size={36} className="state-icon" />
            <div className="state-title">No Telemetry Recorded Yet</div>
            <p className="state-desc">
              {activeDevice
                ? `Device "${activeDevice.device_name}" does not have monitoring records in PostgreSQL yet. Submit telemetry readings or run the simulator.`
                : 'Select or register a device to inspect live telemetry.'}
            </p>
          </div>
        </div>
      )}

      {/* Historical Time-Series Charts */}
      {chartData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
          {/* CPU & Memory Trend */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <TrendingUp size={17} color="var(--accent-blue-highlight)" />
                <span>CPU & Memory Utilization (%)</span>
              </div>
              <span className="card-subtitle">Last {chartData.length} records</span>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3A50" />
                  <XAxis dataKey="time" stroke="#647B96" fontSize={11} tickLine={false} />
                  <YAxis stroke="#647B96" fontSize={11} domain={[0, 100]} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#172438',
                      borderColor: '#2A3A50',
                      borderRadius: '6px',
                      color: '#E8EEF7',
                      fontSize: '12px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Line type="monotone" dataKey="cpu" name="CPU (%)" stroke="#60A5FA" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="memory" name="Memory (%)" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Latency & Packet Loss Trend */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Wifi size={17} color="var(--status-degraded-text)" />
                <span>Latency (ms) & Packet Loss (%)</span>
              </div>
              <span className="card-subtitle">Last {chartData.length} records</span>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A3A50" />
                  <XAxis dataKey="time" stroke="#647B96" fontSize={11} tickLine={false} />
                  <YAxis stroke="#647B96" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#172438',
                      borderColor: '#2A3A50',
                      borderRadius: '6px',
                      color: '#E8EEF7',
                      fontSize: '12px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Line type="monotone" dataKey="latency" name="Latency (ms)" stroke="#FBBF24" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="packet_loss" name="Loss (%)" stroke="#F87171" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Historical Telemetry Logs Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <Clock size={17} color="var(--accent-blue-highlight)" />
              <span>Historical Telemetry Log</span>
            </div>
            <div className="card-subtitle">
              Persistent time-series records from PostgreSQL (Newest first)
            </div>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
            Showing {metrics.length} recorded entries
          </span>
        </div>

        {metrics.length === 0 ? (
          <div className="state-container">
            <Clock size={36} className="state-icon" />
            <div className="state-title">No Historical Records Found</div>
            <p className="state-desc">
              Monitoring records posted by virtual simulators or network agents will be tabulated here chronologically.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>CPU Usage</th>
                  <th>Memory Usage</th>
                  <th>Bandwidth</th>
                  <th>Latency</th>
                  <th>Packet Loss</th>
                  <th>Errors</th>
                  <th>Operational Health</th>
                </tr>
              </thead>
              <tbody>
                {[...metrics].reverse().map((r) => {
                  const health = deriveOperationalHealth(r);
                  return (
                    <tr key={r.id}>
                      <td>
                        <code style={{ fontSize: '0.78rem' }}>
                          {new Date(r.timestamp).toLocaleString()}
                        </code>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{r.cpu_utilization.toFixed(1)}%</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{r.memory_usage.toFixed(1)}%</span>
                      </td>
                      <td>{r.bandwidth.toFixed(1)} Mbps</td>
                      <td>{r.latency.toFixed(1)} ms</td>
                      <td>
                        <span style={{ color: r.packet_loss > 0 ? 'var(--status-critical-text)' : 'inherit' }}>
                          {r.packet_loss.toFixed(2)}%
                        </span>
                      </td>
                      <td>
                        <span style={{ color: r.interface_errors > 0 ? 'var(--status-degraded-text)' : 'inherit' }}>
                          {r.interface_errors}
                        </span>
                      </td>
                      <td>
                        <HealthBadge status={health} size="sm" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Engineering Callout */}
      <div className="academic-callout">
        <Info size={17} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-blue-highlight)' }} />
        <div>
          <strong>Monitoring Data Pipeline:</strong> Metrics are collected via scheduled polling or simulated telemetry feeds, validated against Pydantic schemas, and stored with UTC timestamps in PostgreSQL. These records form the raw feature input for subsequent statistical rollups and ML anomaly classification.
        </div>
      </div>
    </div>
  );
}
