import React, { useState, useEffect } from 'react';
import {
  Server,
  Activity,
  ShieldAlert,
  RefreshCw,
  PlusCircle,
  ArrowRight,
  Database,
  AlertOctagon,
  Info,
} from 'lucide-react';
import { api } from '../api';
import { HealthBadge, ConnectionBadge, RiskBadge } from '../components/StatusBadge';
import { deriveOperationalHealth } from '../utils/statusUtils';
import { useToast } from '../context/ToastContext';

export default function OverviewPage({ onNavigate, onSelectDevice, onOpenAddDevice }) {
  const toast = useToast();
  const [devices, setDevices] = useState([]);
  const [deviceStats, setDeviceStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadOverviewData(isManual = false) {
    setLoading(true);
    setError(null);
    try {
      const devList = await api.getDevices();
      setDevices(devList);

      // Fetch latest metrics and fault analysis concurrently for each device
      const statsMap = {};
      await Promise.all(
        devList.map(async (dev) => {
          try {
            const [latestMetric, analysis] = await Promise.allSettled([
              api.getLatestMetric(dev.id),
              api.getDeviceFaultAnalysis(dev.id, 50),
            ]);
            statsMap[dev.id] = {
              metric: latestMetric.status === 'fulfilled' ? latestMetric.value : null,
              analysis: analysis.status === 'fulfilled' ? analysis.value : null,
            };
          } catch (_) {
            statsMap[dev.id] = { metric: null, analysis: null };
          }
        })
      );
      setDeviceStats(statsMap);
      if (isManual) {
        toast.success('Monitoring data refreshed.');
      }
    } catch (err) {
      const errMsg = err.message || 'Failed to load network overview.';
      setError(errMsg);
      if (isManual) {
        toast.error(errMsg);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverviewData(false);
  }, []);

  const totalDevices = devices.length;
  const activeConnections = devices.filter((d) => d.status === 'ACTIVE').length;

  let healthyCount = 0;
  let degradedCount = 0;
  let criticalCount = 0;
  let unknownCount = 0;
  let highRiskCount = 0;

  devices.forEach((dev) => {
    const stat = deviceStats[dev.id];
    const health = stat ? deriveOperationalHealth(stat.metric) : 'Unknown';
    if (health === 'Healthy') healthyCount++;
    else if (health === 'Degraded') degradedCount++;
    else if (health === 'Critical') criticalCount++;
    else unknownCount++;

    if (stat?.analysis?.risk_level === 'HIGH_RISK') {
      highRiskCount++;
    }
  });

  return (
    <div className="page-body">
      {/* Header & Quick Action */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Network System Overview</h2>
          <p className="page-subtitle">
            Infrastructure telemetry monitoring & predictive fault risk across registered network nodes
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button className="btn btn-secondary" onClick={() => loadOverviewData(true)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={onOpenAddDevice}>
            <PlusCircle size={15} /> Add Device
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-box alert-error">
          <AlertOctagon size={18} />
          <div style={{ flex: 1 }}>
            <strong>Error loading network status:</strong> {error}
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => loadOverviewData(true)}>
            Retry
          </button>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'var(--accent-blue-subtle)', color: 'var(--accent-blue-highlight)', border: '1px solid var(--accent-blue-border)' }}>
            <Server size={22} />
          </div>
          <div className="stat-content">
            <div className="stat-label">Registered Devices</div>
            <div className="stat-value">{totalDevices}</div>
            <div className="stat-subtext">{activeConnections} Active Polling Links</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'var(--status-healthy-bg)', color: 'var(--status-healthy-text)', border: '1px solid var(--status-healthy-border)' }}>
            <Activity size={22} />
          </div>
          <div className="stat-content">
            <div className="stat-label">Device Health</div>
            <div className="stat-value" style={{ color: criticalCount > 0 ? 'var(--status-critical-text)' : degradedCount > 0 ? 'var(--status-degraded-text)' : 'var(--status-healthy-text)' }}>
              {healthyCount} / {totalDevices || 0}
            </div>
            <div className="stat-subtext">
              {degradedCount} Degraded • {criticalCount} Critical{unknownCount > 0 ? ` • ${unknownCount} Unknown` : ''}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: highRiskCount > 0 ? 'var(--status-critical-bg)' : 'var(--status-unknown-bg)', color: highRiskCount > 0 ? 'var(--status-critical-text)' : 'var(--text-secondary)', border: `1px solid ${highRiskCount > 0 ? 'var(--status-critical-border)' : 'var(--status-unknown-border)'}` }}>
            <ShieldAlert size={22} />
          </div>
          <div className="stat-content">
            <div className="stat-label">Fault Risk Alerts</div>
            <div className="stat-value" style={{ color: highRiskCount > 0 ? 'var(--status-critical-text)' : 'var(--text-main)' }}>
              {highRiskCount}
            </div>
            <div className="stat-subtext">Isolation Forest Anomaly Flags</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'var(--accent-blue-subtle)', color: 'var(--accent-blue-highlight)', border: '1px solid var(--accent-blue-border)' }}>
            <Database size={22} />
          </div>
          <div className="stat-content">
            <div className="stat-label">Data Engine</div>
            <div className="stat-value" style={{ fontSize: '1.25rem' }}>PostgreSQL</div>
            <div className="stat-subtext">Persistent Telemetry Records</div>
          </div>
        </div>
      </div>

      {/* Fleet Table Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <Server size={18} color="var(--accent-blue-highlight)" />
              <span>Monitored Device Fleet</span>
            </div>
            <div className="card-subtitle">
              Configured devices, live telemetry readings, and ML fault risk estimations
            </div>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
            {devices.length} registered {devices.length === 1 ? 'node' : 'nodes'}
          </span>
        </div>

        {loading && devices.length === 0 ? (
          <div className="state-container">
            <RefreshCw size={28} className="spin state-icon" />
            <div className="state-title">Loading network devices...</div>
            <p className="state-desc">Querying device registry and telemetry status from PostgreSQL backend.</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="state-container">
            <Server size={40} className="state-icon" />
            <div className="state-title">No Network Devices Registered</div>
            <p className="state-desc">
              Register a router or switch with its network address to begin collecting telemetry and running predictive fault analysis.
            </p>
            <button className="btn btn-primary" onClick={onOpenAddDevice}>
              <PlusCircle size={15} /> Add First Device
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>IP Address</th>
                  <th>Type</th>
                  <th>Monitoring Link</th>
                  <th>Data Source</th>
                  <th>Latest CPU</th>
                  <th>Latest Memory</th>
                  <th>Operational Health</th>
                  <th>Fault Risk</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((dev) => {
                  const stat = deviceStats[dev.id] || {};
                  const m = stat.metric;
                  const a = stat.analysis;
                  const healthStatus = deriveOperationalHealth(m);

                  return (
                    <tr key={dev.id}>
                      <td>
                        <strong>{dev.device_name}</strong>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>ID #{dev.id}</div>
                      </td>
                      <td><code>{dev.ip_address}</code></td>
                      <td>
                        <span className="badge badge-type">{dev.device_type}</span>
                      </td>
                      <td>
                        <ConnectionBadge status={dev.status} size="sm" />
                      </td>
                      <td>
                        <span className={`badge ${dev.monitoring_method === 'SIMULATED' ? 'badge-source-simulated' : 'badge-source-snmp'}`}>
                          {dev.monitoring_method === 'SIMULATED' ? 'Simulated Stream' : 'REST / SNMP Ingest'}
                        </span>
                      </td>
                      <td>
                        {m ? (
                          <span style={{ fontWeight: 600 }}>{m.cpu_utilization.toFixed(1)}%</span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>--</span>
                        )}
                      </td>
                      <td>
                        {m ? (
                          <span style={{ fontWeight: 600 }}>{m.memory_usage.toFixed(1)}%</span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>--</span>
                        )}
                      </td>
                      <td>
                        <HealthBadge status={healthStatus} size="sm" />
                      </td>
                      <td>
                        {a ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <RiskBadge level={a.risk_level} size="sm" />
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {Math.round(a.fault_risk_score)}/100
                            </span>
                          </div>
                        ) : (
                          <span className="badge badge-unknown badge-sm">Pending</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                          onClick={() => {
                            onSelectDevice(dev.id);
                            onNavigate('monitoring');
                          }}
                        >
                          View <ArrowRight size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Technical Academic Callout */}
      <div className="academic-callout">
        <Info size={18} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-blue-highlight)' }} />
        <div>
          <strong>Architecture Note:</strong> Devices stream performance telemetry into a relational PostgreSQL database.
          An unsupervised Scikit-learn Isolation Forest model coupled with domain threshold heuristics evaluates multivariate metric history
          to compute an operational fault-risk index (0–100) before physical threshold degradation causes device outages.
        </div>
      </div>
    </div>
  );
}
