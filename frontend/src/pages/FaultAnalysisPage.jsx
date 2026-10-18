import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Brain,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  RefreshCw,
  Server,
  Info,
  Activity,
  Layers,
  Clock,
  Gauge,
} from 'lucide-react';
import { api } from '../api';
import { HealthBadge, ConnectionBadge, RiskBadge } from '../components/StatusBadge';
import { deriveOperationalHealth } from '../utils/statusUtils';
import { useToast } from '../context/ToastContext';

export default function FaultAnalysisPage({ selectedDeviceId, onSelectDevice }) {
  const toast = useToast();
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(selectedDeviceId || '');
  const [analysis, setAnalysis] = useState(null);
  const [latestMetric, setLatestMetric] = useState(null);
  const [recentHistory, setRecentHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize devices list
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

  // Synchronize when prop changes externally
  useEffect(() => {
    if (selectedDeviceId) {
      setDeviceId(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  // Load analysis, latest metric, and recent telemetry history
  async function loadAnalysisData(isManual = false) {
    if (!deviceId) return;
    setLoading(true);
    setError(null);
    try {
      const [analysisRes, latestMetricRes, recentHistoryRes] = await Promise.allSettled([
        api.getDeviceFaultAnalysis(deviceId, 100),
        api.getLatestMetric(deviceId),
        api.getDeviceMetrics(deviceId, 8),
      ]);

      if (analysisRes.status === 'fulfilled') {
        setAnalysis(analysisRes.value);
      } else {
        setAnalysis(null);
        throw new Error(analysisRes.reason?.message || 'Failed to execute fault analysis pipeline.');
      }

      setLatestMetric(latestMetricRes.status === 'fulfilled' ? latestMetricRes.value : null);
      setRecentHistory(recentHistoryRes.status === 'fulfilled' ? recentHistoryRes.value : []);

      if (isManual) {
        const targetDev = devices.find((d) => d.id === Number(deviceId));
        const targetName = targetDev?.device_name || `Device #${deviceId}`;
        toast.success(`Fault analysis completed for ${targetName}.`);
      }
    } catch (err) {
      const errMsg = err.message || 'Failed to execute fault analysis.';
      setError(errMsg);
      if (isManual) {
        toast.error(errMsg);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalysisData(false);
  }, [deviceId]);

  const activeDevice = devices.find((d) => d.id === Number(deviceId));
  const currentHealth = deriveOperationalHealth(latestMetric);

  return (
    <div className="page-body">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Predictive Fault Analysis & Diagnostics</h2>
          <p className="page-subtitle">
            Unsupervised machine learning anomaly detection combined with operational domain rules
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

          <button className="btn btn-secondary" onClick={() => loadAnalysisData(true)} disabled={loading || !deviceId}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Run Analysis
          </button>
        </div>
      </div>

      {/* Target Device Context Strip */}
      {activeDevice && (
        <div className="card" style={{ padding: '0.75rem 1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.84rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Evaluated Target:</span>
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
              <span style={{ color: 'var(--text-secondary)' }}>Data Feed:</span>
              <span className={`badge ${activeDevice.monitoring_method === 'SIMULATED' ? 'badge-source-simulated' : 'badge-source-snmp'} badge-sm`}>
                {activeDevice.monitoring_method === 'SIMULATED' ? 'Simulated Telemetry' : 'REST / SNMP Ingest'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Health:</span>
                <HealthBadge status={currentHealth} size="sm" />
              </div>
              {analysis && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Risk:</span>
                  <RiskBadge level={analysis.risk_level} size="sm" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="alert-box alert-error">
          <AlertOctagon size={18} />
          <div style={{ flex: 1 }}>
            <strong>Analysis Pipeline Error:</strong> {error}
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => loadAnalysisData(true)}>
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="card">
          <div className="state-container">
            <RefreshCw size={32} className="spin state-icon" />
            <div className="state-title">Executing Fault Analysis Pipeline...</div>
            <p className="state-desc">
              Extracting time-series features from PostgreSQL and fitting Scikit-learn Isolation Forest on historical telemetry.
            </p>
          </div>
        </div>
      )}

      {/* Empty / Unanalyzed State */}
      {!loading && !analysis && (
        <div className="card">
          <div className="state-container">
            <ShieldAlert size={36} className="state-icon" />
            <div className="state-title">No Analysis Results Available</div>
            <p className="state-desc">
              Select a network device and click "Run Analysis" to compute anomaly scores and fault-risk estimations.
            </p>
          </div>
        </div>
      )}

      {/* Analysis Presentation */}
      {!loading && analysis && (
        <>
          {/* Analysis Capability Clarification Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '0.85rem',
            }}
          >
            <div style={{ backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '0.85rem 1.1rem', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                <Activity size={15} color="var(--status-degraded-text)" />
                <span>1. Rule-Based Threshold Check</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.77rem', lineHeight: 1.4 }}>
                Evaluates latest readings against network engineering thresholds (CPU $\ge 75\%/90\%$, Memory $\ge 75\%/88\%$, Packet Loss $\ge 1\%/5\%$, Interface Errors).
              </p>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '0.85rem 1.1rem', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                <Brain size={15} color="var(--accent-blue-highlight)" />
                <span>2. ML Anomaly Detection (Isolation Forest)</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.77rem', lineHeight: 1.4 }}>
                Unsupervised model isolates multivariate outliers and sudden rates of change (`cpu_change`, `latency_trend_ratio`) without requiring labeled failure datasets.
              </p>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '0.85rem 1.1rem', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                <Gauge size={15} color="var(--accent-blue-highlight)" />
                <span>3. Operational Fault-Risk Index</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.77rem', lineHeight: 1.4 }}>
                Blends 50% ML anomaly score with 50% domain stress score to compute an interpretable 0–100 index. Not a deterministic failure countdown.
              </p>
            </div>
          </div>

          {/* Insufficient History Warning (if < 5 readings) */}
          {analysis.readings_analyzed < 5 && (
            <div className="alert-box alert-warning">
              <AlertTriangle size={18} />
              <div>
                <strong>Limited Telemetry History ({analysis.readings_analyzed} readings):</strong> The Isolation Forest model requires at least 5 readings to construct reliable feature distributions. Current analysis relies on the Domain Threshold Engine until additional telemetry is recorded.
              </div>
            </div>
          )}

          {/* Top Analysis Indicators Grid */}
          <div className="stats-grid">
            {/* Fault Risk Score Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-label">Fault-Risk Score</span>
                <RiskBadge level={analysis.risk_level} size="sm" />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', margin: '0.65rem 0' }}>
                <span
                  style={{
                    fontSize: '2.4rem',
                    fontWeight: 800,
                    lineHeight: 1,
                    color:
                      analysis.fault_risk_score >= 70
                        ? 'var(--status-critical-text)'
                        : analysis.fault_risk_score >= 40
                        ? 'var(--status-degraded-text)'
                        : 'var(--status-healthy-text)',
                  }}
                >
                  {Math.round(analysis.fault_risk_score)}
                </span>
                <span style={{ color: 'var(--text-dim)', fontSize: '1rem', fontWeight: 500 }}>/ 100</span>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, analysis.fault_risk_score))}%`,
                    height: '100%',
                    backgroundColor:
                      analysis.fault_risk_score >= 70
                        ? 'var(--status-critical-text)'
                        : analysis.fault_risk_score >= 40
                        ? 'var(--status-degraded-text)'
                        : 'var(--status-healthy-text)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)', marginTop: '0.45rem' }}>
                Operational Risk Index (0 = Nominal, 100 = Imminent Failure)
              </div>
            </div>

            {/* Anomaly Detection Status Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-label">ML Anomaly Detection</span>
                <Brain size={17} color="var(--accent-blue-highlight)" />
              </div>
              <div style={{ margin: '0.65rem 0' }}>
                {analysis.is_anomaly ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--status-critical-text)' }}>
                    <AlertOctagon size={24} />
                    <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>Anomaly Flagged</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--status-healthy-text)' }}>
                    <CheckCircle2 size={24} />
                    <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>Normal Pattern</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Decision Anomaly Score: <strong style={{ color: 'var(--text-main)' }}>{analysis.anomaly_score}</strong>
              </div>
            </div>

            {/* Pipeline Diagnostics Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-label">Analysis Pipeline</span>
                <Layers size={17} color="var(--accent-blue-highlight)" />
              </div>
              <div style={{ margin: '0.5rem 0' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {analysis.algorithm_used}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  History Evaluated: <strong style={{ color: 'var(--text-main)' }}>{analysis.readings_analyzed} readings</strong>
                </div>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                Evaluated: {analysis.latest_reading_timestamp ? new Date(analysis.latest_reading_timestamp).toLocaleTimeString() : 'N/A'}
              </div>
            </div>
          </div>

          {/* Diagnostic Explanation Banner */}
          <div
            className="card"
            style={{
              borderLeft: `4px solid ${
                analysis.fault_risk_score >= 70
                  ? 'var(--status-critical-text)'
                  : analysis.fault_risk_score >= 40
                  ? 'var(--status-degraded-text)'
                  : 'var(--status-healthy-text)'
              }`,
            }}
          >
            <h4 style={{ fontSize: '0.94rem', fontWeight: 600, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-main)' }}>
              <Info size={17} color="var(--accent-blue-highlight)" /> Diagnostic Explanation
            </h4>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {analysis.summary_explanation}
            </p>
          </div>

          {/* Contributing Metrics Breakdown Table */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <Activity size={17} color="var(--status-degraded-text)" />
                  <span>Threshold Violations & Contributing Factors</span>
                </div>
                <div className="card-subtitle">
                  Specific telemetry metrics that triggered operational rules or drove outlier scoring
                </div>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                {analysis.contributing_metrics.length} factor(s) identified
              </span>
            </div>

            {analysis.contributing_metrics.length === 0 ? (
              <div style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={30} color="var(--status-healthy-text)" style={{ marginBottom: '0.5rem' }} />
                <p style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.92rem' }}>All Monitored Parameters Nominal</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
                  No threshold penalties or severe rates of change were observed for this evaluation window.
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Metric Variable</th>
                      <th>Observed Value</th>
                      <th>Threshold Classification</th>
                      <th>Diagnostic Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.contributing_metrics.map((c, idx) => (
                      <tr key={idx}>
                        <td>
                          <strong>{c.metric}</strong>
                        </td>
                        <td>
                          <code>{c.value}</code>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              c.severity === 'CRITICAL'
                                ? 'badge-critical'
                                : c.severity === 'WARNING'
                                ? 'badge-degraded'
                                : 'badge-healthy'
                            } badge-sm`}
                          >
                            {c.severity}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{c.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Latest Available Telemetry Snapshot */}
          {latestMetric && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    <Activity size={17} color="var(--accent-blue-highlight)" />
                    <span>Latest Available Telemetry Snapshot</span>
                  </div>
                  <div className="card-subtitle">
                    Most recent raw telemetry reading from PostgreSQL used as the primary observation point
                  </div>
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                  Recorded: {new Date(latestMetric.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>CPU Utilization</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                    {latestMetric.cpu_utilization.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>Threshold: 75% / 90%</div>
                </div>

                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Memory Usage</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                    {latestMetric.memory_usage.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>Threshold: 75% / 88%</div>
                </div>

                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Latency Delay</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                    {latestMetric.latency.toFixed(1)} ms
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>Threshold: 40ms / 100ms</div>
                </div>

                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Packet Loss</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: latestMetric.packet_loss > 0 ? 'var(--status-critical-text)' : 'var(--text-main)', marginTop: '0.15rem' }}>
                    {latestMetric.packet_loss.toFixed(2)}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>{latestMetric.interface_errors} Interface Errors</div>
                </div>
              </div>
            </div>
          )}

          {/* Short Recent-History View */}
          {recentHistory.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    <Clock size={17} color="var(--accent-blue-highlight)" />
                    <span>Recent Telemetry History Context</span>
                  </div>
                  <div className="card-subtitle">
                    Past {recentHistory.length} readings leading up to this analysis point (illustrating temporal trend)
                  </div>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  Chronological Telemetry Stream
                </span>
              </div>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>CPU Load</th>
                      <th>Memory</th>
                      <th>Latency</th>
                      <th>Loss</th>
                      <th>Errors</th>
                      <th>Health State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentHistory.map((r, i) => {
                      const h = deriveOperationalHealth(r);
                      const isLatest = i === 0;

                      return (
                        <tr key={r.id} style={{ backgroundColor: isLatest ? 'var(--accent-blue-subtle)' : 'transparent' }}>
                          <td>
                            <code style={{ fontSize: '0.78rem' }}>
                              {new Date(r.timestamp).toLocaleTimeString()}
                            </code>
                            {isLatest && (
                              <span className="badge badge-type badge-sm" style={{ marginLeft: '0.5rem' }}>
                                Analyzed
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontWeight: r.cpu_utilization >= 75 ? 700 : 500, color: r.cpu_utilization >= 90 ? 'var(--status-critical-text)' : r.cpu_utilization >= 75 ? 'var(--status-degraded-text)' : 'inherit' }}>
                              {r.cpu_utilization.toFixed(1)}%
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: r.memory_usage >= 75 ? 700 : 500, color: r.memory_usage >= 88 ? 'var(--status-critical-text)' : r.memory_usage >= 75 ? 'var(--status-degraded-text)' : 'inherit' }}>
                              {r.memory_usage.toFixed(1)}%
                            </span>
                          </td>
                          <td>{r.latency.toFixed(1)} ms</td>
                          <td>
                            <span style={{ color: r.packet_loss > 0 ? 'var(--status-critical-text)' : 'inherit' }}>
                              {r.packet_loss.toFixed(2)}%
                            </span>
                          </td>
                          <td>{r.interface_errors}</td>
                          <td>
                            <HealthBadge status={h} size="sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Academic & Engineering Methodology Callout */}
          <div className="academic-callout">
            <Info size={17} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-blue-highlight)' }} />
            <div>
              <strong>Academic Methodology & Disclaimer:</strong> {analysis.disclaimer}
              <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                • <strong>Why Unsupervised ML?</strong> Labelled failure records are rarely available on campus or lab networks. Isolation Forest isolates abnormal points without prior failure training.
                <br />
                • <strong>Prediction Boundary:</strong> This analysis detects early degradation signatures and statistical outliers; it does not constitute a deterministic countdown to physical hardware burnout.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
