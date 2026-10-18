/**
 * API client for interacting with the FastAPI backend.
 */

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;
const API_BASE_URL = (rawBaseUrl !== undefined && rawBaseUrl !== null ? rawBaseUrl : 'http://127.0.0.1:8000').replace(/\/+$/, '');

async function handleResponse(response) {
  if (!response.ok) {
    let errorDetail = `HTTP Error ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson && errorJson.detail) {
        errorDetail = errorJson.detail;
      }
    } catch (_) {
      // Fallback to text status
    }
    throw new Error(errorDetail);
  }
  return response.json();
}

export const api = {
  // Health Check
  async getHealth() {
    const res = await fetch(`${API_BASE_URL}/health`);
    return handleResponse(res);
  },

  // Devices
  async getDevices() {
    const res = await fetch(`${API_BASE_URL}/api/devices`);
    return handleResponse(res);
  },

  async getDevice(deviceId) {
    const res = await fetch(`${API_BASE_URL}/api/devices/${deviceId}`);
    return handleResponse(res);
  },

  async registerDevice(deviceData) {
    const res = await fetch(`${API_BASE_URL}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviceData),
    });
    return handleResponse(res);
  },

  // Telemetry Metrics
  async getDeviceMetrics(deviceId, limit = 50) {
    const res = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/metrics?limit=${limit}`);
    return handleResponse(res);
  },

  async getLatestMetric(deviceId) {
    const res = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/metrics/latest`);
    return handleResponse(res);
  },

  // ML Fault Analysis & Anomaly Detection
  async getDeviceFaultAnalysis(deviceId, limit = 100) {
    const res = await fetch(`${API_BASE_URL}/api/devices/${deviceId}/analysis?limit=${limit}`);
    return handleResponse(res);
  },
};
