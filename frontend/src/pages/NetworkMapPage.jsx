import React, { useState, useEffect } from 'react';
import {
  Waypoints,
  Activity,
  ShieldAlert,
  RefreshCw,
  PlusCircle,
  Info,
  AlertOctagon,
} from 'lucide-react';
import { api } from '../api';
import { HealthBadge, ConnectionBadge, RiskBadge } from '../components/StatusBadge';
import { deriveOperationalHealth } from '../utils/statusUtils';
import { useToast } from '../context/ToastContext';

export default function NetworkMapPage({ onNavigate, onSelectDevice, onOpenAddDevice }) {
  const toast = useToast();
  const [devices, setDevices] = useState([]);
  const [deviceStats, setDeviceStats] = useState({});
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadMapData(isManual = false) {
    setLoading(true);
    setError(null);
    try {
      const devList = await api.getDevices();
      setDevices(devList);

      const stats = {};
      await Promise.all(
        devList.map(async (dev) => {
          try {
            const [latestMetric, analysis] = await Promise.allSettled([
              api.getLatestMetric(dev.id),
              api.getDeviceFaultAnalysis(dev.id, 50),
            ]);
            stats[dev.id] = {
              metric: latestMetric.status === 'fulfilled' ? latestMetric.value : null,
              analysis: analysis.status === 'fulfilled' ? analysis.value : null,
            };
          } catch (_) {
            stats[dev.id] = { metric: null, analysis: null };
          }
        })
      );
      setDeviceStats(stats);

      // Auto-select first registered device if none selected
      if (devList.length > 0 && !selectedNodeId) {
        setSelectedNodeId(`dev-${devList[0].id}`);
      }

      if (isManual) {
        toast.success('Network topology updated.');
      }
    } catch (err) {
      const errMsg = err.message || 'Failed to load network topology data.';
      setError(errMsg);
      if (isManual) {
        toast.error(errMsg);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMapData(false);
  }, []);

  // Build the topology model from registered devices + illustrative segments
  const routers = devices.filter((d) => d.device_type === 'Router');
  const switches = devices.filter((d) => d.device_type === 'Switch');
  const endpoints = devices.filter((d) => d.device_type !== 'Router' && d.device_type !== 'Switch');

  const nodes = [];
  const links = [];

  // Canvas bounds: 860 x 460
  // Tier 1: Core / Gateway Routers (Y = 80)
  if (routers.length > 0) {
    routers.forEach((dev, idx) => {
      const total = routers.length;
      const x = total === 1 ? 430 : 250 + (idx * 360) / (total - 1);
      nodes.push({
        id: `dev-${dev.id}`,
        deviceId: dev.id,
        isDemo: false,
        name: dev.device_name,
        type: dev.device_type,
        ip: dev.ip_address,
        rawDevice: dev,
        x,
        y: 80,
        tier: 1,
      });
    });
  } else if (devices.length > 0) {
    // If registered devices exist but no router, treat first device as root
    const first = devices[0];
    nodes.push({
      id: `dev-${first.id}`,
      deviceId: first.id,
      isDemo: false,
      name: first.device_name,
      type: first.device_type,
      ip: first.ip_address,
      rawDevice: first,
      x: 430,
      y: 80,
      tier: 1,
    });
  }

  // Tier 2: Distribution / Access Switches (Y = 220)
  if (switches.length > 0) {
    switches.forEach((dev, idx) => {
      const total = switches.length;
      const x = total === 1 ? 430 : 220 + (idx * 420) / (total - 1);
      nodes.push({
        id: `dev-${dev.id}`,
        deviceId: dev.id,
        isDemo: false,
        name: dev.device_name,
        type: dev.device_type,
        ip: dev.ip_address,
        rawDevice: dev,
        x,
        y: 220,
        tier: 2,
      });
    });
  } else if (devices.length > 0) {
    // Illustrative distribution switch to complete logical topology
    nodes.push({
      id: 'demo-sw-1',
      deviceId: null,
      isDemo: true,
      name: 'Distribution-Switch-1',
      type: 'Switch',
      ip: '192.168.1.254 (Illustrative)',
      rawDevice: null,
      x: 430,
      y: 220,
      tier: 2,
    });
  }

  // Tier 3: Access Nodes, Servers, Endpoints (Y = 370)
  if (endpoints.length > 0) {
    endpoints.forEach((dev, idx) => {
      const total = endpoints.length;
      const x = total === 1 ? 430 : 200 + (idx * 460) / (total - 1);
      nodes.push({
        id: `dev-${dev.id}`,
        deviceId: dev.id,
        isDemo: false,
        name: dev.device_name,
        type: dev.device_type,
        ip: dev.ip_address,
        rawDevice: dev,
        x,
        y: 370,
        tier: 3,
      });
    });
  } else if (devices.length > 0) {
    // Illustrative downstream endpoints
    nodes.push({
      id: 'demo-srv-1',
      deviceId: null,
      isDemo: true,
      name: 'Core-Server-01',
      type: 'Server',
      ip: '192.168.1.100 (Illustrative)',
      rawDevice: null,
      x: 300,
      y: 370,
      tier: 3,
    });
    nodes.push({
      id: 'demo-host-2',
      deviceId: null,
      isDemo: true,
      name: 'App-Host-02',
      type: 'Server',
      ip: '192.168.1.101 (Illustrative)',
      rawDevice: null,
      x: 560,
      y: 370,
      tier: 3,
    });
  }

  // Generate logical links between tiers
  const tier1Nodes = nodes.filter((n) => n.tier === 1);
  const tier2Nodes = nodes.filter((n) => n.tier === 2);
  const tier3Nodes = nodes.filter((n) => n.tier === 3);

  tier1Nodes.forEach((t1) => {
    tier2Nodes.forEach((t2) => {
      links.push({
        id: `link-${t1.id}-${t2.id}`,
        source: t1,
        target: t2,
        isIllustrative: t1.isDemo || t2.isDemo,
      });
    });
  });

  tier2Nodes.forEach((t2) => {
    tier3Nodes.forEach((t3) => {
      links.push({
        id: `link-${t2.id}-${t3.id}`,
        source: t2,
        target: t3,
        isIllustrative: t2.isDemo || t3.isDemo,
      });
    });
  });

  // Lookup selected node details
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null;
  const selectedDevStats = selectedNode?.deviceId ? deviceStats[selectedNode.deviceId] : null;
  const selectedMetric = selectedDevStats?.metric || null;
  const selectedAnalysis = selectedDevStats?.analysis || null;
  const selectedHealth = selectedNode?.isDemo
    ? 'Unknown'
    : deriveOperationalHealth(selectedMetric);

  return (
    <div className="page-body">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Logical Network Map</h2>
          <p className="page-subtitle">
            Tier-based topology visualization with live operational health overlay
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button className="btn btn-secondary" onClick={() => loadMapData(true)} disabled={loading}>
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
            <strong>Topology Error:</strong> {error}
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => loadMapData(true)}>
            Retry
          </button>
        </div>
      )}

      {/* Main Map Content */}
      {loading && devices.length === 0 ? (
        <div className="card">
          <div className="state-container">
            <RefreshCw size={32} className="spin state-icon" />
            <div className="state-title">Loading network topology...</div>
            <p className="state-desc">Mapping registered network nodes and collecting real-time health metrics.</p>
          </div>
        </div>
      ) : devices.length === 0 ? (
        <div className="card">
          <div className="state-container">
            <Waypoints size={40} className="state-icon" />
            <div className="state-title">No Topology Data Available</div>
            <p className="state-desc">
              No network devices are registered yet. Register a router, switch, or server with its network address to render the network map.
            </p>
            <button className="btn btn-primary" onClick={onOpenAddDevice}>
              <PlusCircle size={15} /> Add First Device
            </button>
          </div>
        </div>
      ) : (
        <div className="topology-layout">
          {/* SVG Canvas Panel */}
          <div className="topology-canvas-panel">
            {/* Top Toolbar / Mode Banner */}
            <div style={{ padding: '0.75rem 1.1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <Waypoints size={16} color="var(--accent-blue-highlight)" />
                <span>
                  <strong>Interactive Topology:</strong> Click any node to inspect telemetry and fault risk
                </span>
              </div>
              <span className="badge badge-source-simulated badge-sm">
                Logical Hierarchy
              </span>
            </div>

            {/* SVG Visual Canvas */}
            <div className="topology-svg-container">
              <svg viewBox="0 0 860 460" className="topology-svg">
                {/* Background Tier Boundary Guides */}
                <g opacity="0.5">
                  <line x1="40" y1="150" x2="820" y2="150" stroke="#2A3A50" strokeDasharray="3 3" />
                  <text x="50" y="142" fill="#647B96" fontSize="10" fontWeight="600">TIER 1 — CORE ROUTING</text>

                  <line x1="40" y1="295" x2="820" y2="295" stroke="#2A3A50" strokeDasharray="3 3" />
                  <text x="50" y="287" fill="#647B96" fontSize="10" fontWeight="600">TIER 2 — DISTRIBUTION SWITCHING</text>
                  <text x="50" y="435" fill="#647B96" fontSize="10" fontWeight="600">TIER 3 — ACCESS & APPLICATION NODES</text>
                </g>

                {/* Connection Links */}
                <g>
                  {links.map((link) => {
                    const sourceStat = link.source.deviceId ? deviceStats[link.source.deviceId] : null;
                    const targetStat = link.target.deviceId ? deviceStats[link.target.deviceId] : null;
                    const sHealth = link.source.isDemo ? 'Unknown' : deriveOperationalHealth(sourceStat?.metric);
                    const tHealth = link.target.isDemo ? 'Unknown' : deriveOperationalHealth(targetStat?.metric);

                    let strokeColor = '#2A3A50';
                    if (sHealth === 'Critical' || tHealth === 'Critical') {
                      strokeColor = 'rgba(248, 113, 113, 0.7)';
                    } else if (sHealth === 'Degraded' || tHealth === 'Degraded') {
                      strokeColor = 'rgba(251, 191, 36, 0.65)';
                    } else if (sHealth === 'Healthy' && tHealth === 'Healthy') {
                      strokeColor = 'rgba(16, 185, 129, 0.55)';
                    } else if (!link.isIllustrative) {
                      strokeColor = 'rgba(96, 165, 250, 0.45)';
                    }

                    return (
                      <line
                        key={link.id}
                        x1={link.source.x}
                        y1={link.source.y}
                        x2={link.target.x}
                        y2={link.target.y}
                        stroke={strokeColor}
                        strokeWidth={link.isIllustrative ? 1.5 : 2}
                        strokeDasharray={link.isIllustrative ? '4 4' : 'none'}
                      />
                    );
                  })}
                </g>

                {/* Nodes */}
                <g>
                  {nodes.map((node) => {
                    const isSelected = selectedNodeId === node.id;
                    const devStat = node.deviceId ? deviceStats[node.deviceId] : null;
                    const nodeHealth = node.isDemo ? 'Unknown' : deriveOperationalHealth(devStat?.metric);

                    let statusColor = 'var(--status-unknown-text)'; // Unknown / Demo
                    if (nodeHealth === 'Healthy') statusColor = 'var(--status-healthy-text)';
                    else if (nodeHealth === 'Degraded') statusColor = 'var(--status-degraded-text)';
                    else if (nodeHealth === 'Critical') statusColor = 'var(--status-critical-text)';

                    return (
                      <g
                        key={node.id}
                        className="topology-node"
                        onClick={() => {
                          setSelectedNodeId(node.id);
                          toast.info(`Selected node: ${node.name}`, 2000);
                        }}
                        tabIndex={0}
                        style={{ outline: 'none' }}
                      >
                        {/* Selection Halo */}
                        {isSelected && (
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={32}
                            fill="none"
                            stroke="var(--accent-blue)"
                            strokeWidth={2}
                            strokeDasharray="4 3"
                            opacity={0.85}
                          />
                        )}

                        {/* Node Container Circle */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={23}
                          fill="#111C2E"
                          stroke={node.isDemo ? 'var(--border-subtle)' : statusColor}
                          strokeWidth={isSelected ? 2.5 : 1.8}
                          strokeDasharray={node.isDemo ? '3 3' : 'none'}
                        />

                        {/* SVG Geometric Type Icon */}
                        {node.type === 'Router' ? (
                          // Router icon: circular central hub with arrows
                          <g transform={`translate(${node.x - 9}, ${node.y - 9})`} stroke={statusColor} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="4" width="16" height="10" rx="2" />
                            <circle cx="5.5" cy="9" r="1" fill={statusColor} />
                            <circle cx="9" cy="9" r="1" fill={statusColor} />
                            <circle cx="12.5" cy="9" r="1" fill={statusColor} />
                          </g>
                        ) : node.type === 'Switch' ? (
                          // Switch icon: multi-layer stack
                          <g transform={`translate(${node.x - 9}, ${node.y - 9})`} stroke={node.isDemo ? 'var(--text-secondary)' : statusColor} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="9 2 1 6 9 10 17 6 9 2" />
                            <polyline points="1 11 9 15 17 11" />
                          </g>
                        ) : (
                          // Server / Host icon: server box with disk slots
                          <g transform={`translate(${node.x - 9}, ${node.y - 9})`} stroke={node.isDemo ? 'var(--text-secondary)' : statusColor} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="2" width="14" height="6" rx="1.5" />
                            <rect x="2" y="10" width="14" height="6" rx="1.5" />
                            <line x1="5" y1="5" x2="5.01" y2="5" />
                            <line x1="5" y1="13" x2="5.01" y2="13" />
                          </g>
                        )}

                        {/* Health Status Indicator Dot */}
                        <circle
                          cx={node.x + 16}
                          cy={node.y - 15}
                          r={4.5}
                          fill={statusColor}
                          stroke="#111C2E"
                          strokeWidth={1.5}
                        />

                        {/* Node Label Text */}
                        <text
                          x={node.x}
                          y={node.y + 36}
                          textAnchor="middle"
                          fill="var(--text-main)"
                          fontSize="11"
                          fontWeight={isSelected ? '700' : '600'}
                          style={{ pointerEvents: 'none' }}
                        >
                          {node.name}
                        </text>

                        <text
                          x={node.x}
                          y={node.y + 49}
                          textAnchor="middle"
                          fill="var(--text-dim)"
                          fontSize="9.5"
                          fontFamily="ui-monospace, monospace"
                          style={{ pointerEvents: 'none' }}
                        >
                          {node.ip}
                        </text>

                        {node.isDemo && (
                          <text
                            x={node.x}
                            y={node.y + 61}
                            textAnchor="middle"
                            fill="#64748b"
                            fontSize="8.5"
                            style={{ pointerEvents: 'none' }}
                          >
                            (Illustrative Segment)
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>

            {/* Compact Legend Bar */}
            <div className="topology-legend-bar">
              <div className="topology-legend-items">
                <span style={{ fontWeight: 600, color: 'var(--text-main)', marginRight: '0.25rem' }}>Legend:</span>
                <div className="topology-legend-item">
                  <span className="topology-legend-dot" style={{ backgroundColor: 'var(--status-healthy-text)' }} />
                  <span>Healthy</span>
                </div>
                <div className="topology-legend-item">
                  <span className="topology-legend-dot" style={{ backgroundColor: 'var(--status-degraded-text)' }} />
                  <span>Degraded</span>
                </div>
                <div className="topology-legend-item">
                  <span className="topology-legend-dot" style={{ backgroundColor: 'var(--status-critical-text)' }} />
                  <span>Critical</span>
                </div>
                <div className="topology-legend-item">
                  <span className="topology-legend-dot" style={{ backgroundColor: 'var(--status-unknown-text)' }} />
                  <span>Unknown / Demo</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: 'var(--text-dim)' }}>
                  <span style={{ borderBottom: '2px solid rgba(16, 185, 129, 0.7)', width: '16px', display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
                  Registered Link
                </span>
                <span style={{ color: 'var(--text-dim)' }}>
                  <span style={{ borderBottom: '2px dashed var(--border-muted)', width: '16px', display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
                  Illustrative Link
                </span>
              </div>
            </div>
          </div>

          {/* Node Inspector Side Panel */}
          <div className="topology-inspector-panel">
            {selectedNode ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                      Selected Topology Node
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                      {selectedNode.name}
                    </h3>
                  </div>
                  <HealthBadge status={selectedHealth} size="sm" />
                </div>

                {/* Node Metadata List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.84rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Device Type:</span>
                    <span className="badge badge-type badge-sm">{selectedNode.type}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>IP Address:</span>
                    <code>{selectedNode.ip}</code>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Classification:</span>
                    <span className={`badge ${selectedNode.isDemo ? 'badge-unknown' : 'badge-connection-active'} badge-sm`}>
                      {selectedNode.isDemo ? 'Illustrative Segment' : 'Registered Device'}
                    </span>
                  </div>

                  {!selectedNode.isDemo && selectedNode.rawDevice && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Link State:</span>
                        <ConnectionBadge status={selectedNode.rawDevice.status} size="sm" />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Data Source:</span>
                        <span className={`badge ${selectedNode.rawDevice.monitoring_method === 'SIMULATED' ? 'badge-source-simulated' : 'badge-source-snmp'} badge-sm`}>
                          {selectedNode.rawDevice.monitoring_method}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Telemetry Metrics Breakdown */}
                {selectedNode.isDemo ? (
                  <div
                    style={{
                      padding: '0.85rem',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      border: '1px dashed var(--border-subtle)',
                    }}
                  >
                    <Info size={15} style={{ color: 'var(--accent-blue-highlight)', marginBottom: '0.35rem' }} />
                    <p>
                      This is an <strong>illustrative reference node</strong> demonstrating network hierarchy. Register an actual device to stream telemetry into this tier.
                    </p>
                    <button
                      className="btn btn-secondary"
                      style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.78rem', justifyContent: 'center' }}
                      onClick={onOpenAddDevice}
                    >
                      <PlusCircle size={14} /> Register Node for this Tier
                    </button>
                  </div>
                ) : selectedMetric ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                      Live Performance Metrics
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div className="card" style={{ padding: '0.65rem', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>CPU Load</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.1rem' }}>
                          {selectedMetric.cpu_utilization.toFixed(1)}%
                        </div>
                      </div>

                      <div className="card" style={{ padding: '0.65rem', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Memory Usage</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.1rem' }}>
                          {selectedMetric.memory_usage.toFixed(1)}%
                        </div>
                      </div>

                      <div className="card" style={{ padding: '0.65rem', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Latency</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.1rem' }}>
                          {selectedMetric.latency.toFixed(1)} ms
                        </div>
                      </div>

                      <div className="card" style={{ padding: '0.65rem', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Packet Loss</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: selectedMetric.packet_loss > 0 ? 'var(--status-critical-text)' : 'var(--text-main)', marginTop: '0.1rem' }}>
                          {selectedMetric.packet_loss.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    {selectedAnalysis && (
                      <div style={{ padding: '0.65rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Evaluated Fault Risk:</span>
                          <RiskBadge level={selectedAnalysis.risk_level} size="sm" />
                        </div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                          Risk Score: {Math.round(selectedAnalysis.fault_risk_score)}/100
                        </div>
                      </div>
                    )}

                    {/* Navigation Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.5rem' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', justifyContent: 'center' }}
                        onClick={() => {
                          onSelectDevice(selectedNode.deviceId);
                          onNavigate('monitoring');
                        }}
                      >
                        <Activity size={14} color="var(--accent-blue-highlight)" /> Inspect Telemetry Stream
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', justifyContent: 'center' }}
                        onClick={() => {
                          onSelectDevice(selectedNode.deviceId);
                          onNavigate('analysis');
                        }}
                      >
                        <ShieldAlert size={14} color="var(--status-degraded-text)" /> Run ML Fault Analysis
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                    No telemetry records logged yet for this device.
                  </div>
                )}
              </>
            ) : (
              <div className="state-container" style={{ padding: '2rem 1rem' }}>
                <Waypoints size={30} className="state-icon" />
                <div className="state-title" style={{ fontSize: '0.92rem' }}>No Node Selected</div>
                <p className="state-desc" style={{ fontSize: '0.8rem' }}>
                  Click any topology node on the canvas to inspect its network parameters and live performance telemetry.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Academic Topology Architecture Callout */}
      <div className="academic-callout">
        <Info size={17} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-blue-highlight)' }} />
        <div>
          <strong>Topology Architecture Note:</strong> Link connections represent illustrative logical relationships.
          Because automatic layer-2/layer-3 discovery (e.g., IEEE 802.1AB LLDP / Cisco CDP) is intentionally outside the project scope,
          physical port-to-port connections are not dynamically queried; registered devices and their real-time telemetry are mapped onto this logical topology.
        </div>
      </div>
    </div>
  );
}
