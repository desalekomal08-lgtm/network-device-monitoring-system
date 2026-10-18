import React, { useState } from 'react';
import { X, Plus, AlertCircle, Server } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export default function AddDeviceModal({ isOpen, onClose, onDeviceAdded }) {
  const toast = useToast();
  const [deviceName, setDeviceName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [deviceType, setDeviceType] = useState('Router');
  const [monitoringMethod, setMonitoringMethod] = useState('SIMULATED');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        device_name: deviceName.trim(),
        ip_address: ipAddress.trim(),
        device_type: deviceType,
        monitoring_method: monitoringMethod,
        status: 'ACTIVE',
      };

      const newDevice = await api.registerDevice(payload);
      toast.success(`Device "${newDevice.device_name}" (${newDevice.ip_address}) registered successfully.`);
      onDeviceAdded(newDevice);
      onClose();
      // Reset form
      setDeviceName('');
      setIpAddress('');
      setDeviceType('Router');
      setMonitoringMethod('SIMULATED');
    } catch (err) {
      const errMsg = err.message || 'Failed to register device.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Server size={20} color="var(--accent-blue-highlight)" />
            <h3 style={{ fontSize: '1.08rem', fontWeight: 600, color: 'var(--text-main)' }}>Register Network Device</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem' }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="alert-box alert-error" style={{ marginBottom: '1rem' }}>
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Device Name *</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="e.g. Core-Router-1, Edge-Switch-01"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">IP Address *</label>
            <input
              type="text"
              required
              className="form-input"
              placeholder="e.g. 192.168.1.1 or 10.0.0.1"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Device Type</label>
            <select
              className="form-select"
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
            >
              <option value="Router">Router</option>
              <option value="Switch">Switch</option>
              <option value="Server">Server</option>
              <option value="Firewall">Firewall</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Monitoring Method</label>
            <select
              className="form-select"
              value={monitoringMethod}
              onChange={(e) => setMonitoringMethod(e.target.value)}
            >
              <option value="SIMULATED">SIMULATED (Telemetry Stream / Simulator)</option>
              <option value="SNMP">SNMP (REST Telemetry Ingestion / Planned SNMP)</option>
            </select>
            <span className="form-helper">
              Note: Automatic network discovery and physical SNMP sockets are outside current academic scope. Telemetry is ingested via the REST API or simulator.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '1.4rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Plus size={15} /> {loading ? 'Registering...' : 'Add Device'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
