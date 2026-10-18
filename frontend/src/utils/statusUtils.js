/**
 * Utilities for standardizing network device status terminology
 * across the dashboard, telemetry monitoring, and fault analysis.
 *
 * Terminology Standard:
 * - Healthy: device is operating within defined thresholds.
 * - Degraded: device has a warning-level issue.
 * - Critical: device has a severe issue.
 * - Unknown: device status cannot be determined.
 */

/**
 * Maps any raw status string (e.g., 'UP', 'WARNING', 'DEGRADED', 'DOWN')
 * to our standardized status labels: Healthy, Degraded, Critical, or Unknown.
 *
 * @param {string|null|undefined} rawStatus
 * @returns {'Healthy' | 'Degraded' | 'Critical' | 'Unknown'}
 */
export function getStandardStatus(rawStatus) {
  if (!rawStatus) return 'Unknown';
  const s = String(rawStatus).toUpperCase().trim();
  if (['UP', 'HEALTHY', 'NORMAL', 'OK'].includes(s)) {
    return 'Healthy';
  }
  if (['WARNING', 'DEGRADED', 'ALERT'].includes(s)) {
    return 'Degraded';
  }
  if (['DOWN', 'CRITICAL', 'ERROR', 'FAILED'].includes(s)) {
    return 'Critical';
  }
  return 'Unknown';
}

/**
 * Derives operational health from latest telemetry metric record.
 * Prioritizes the telemetry record's device_status; if not present, evaluates
 * primary resource thresholds (CPU, Memory, Packet Loss).
 *
 * @param {object|null|undefined} metric
 * @returns {'Healthy' | 'Degraded' | 'Critical' | 'Unknown'}
 */
export function deriveOperationalHealth(metric) {
  if (!metric) return 'Unknown';
  if (metric.device_status) {
    return getStandardStatus(metric.device_status);
  }
  const cpu = metric.cpu_utilization ?? 0;
  const mem = metric.memory_usage ?? 0;
  const loss = metric.packet_loss ?? 0;

  if (cpu >= 90 || mem >= 90 || loss >= 10) {
    return 'Critical';
  }
  if (cpu >= 75 || mem >= 80 || loss >= 3) {
    return 'Degraded';
  }
  return 'Healthy';
}

/**
 * Normalizes connection / administrative state (e.g. 'ACTIVE', 'INACTIVE')
 * to ensure monitoring connection state is kept separate from device operational health.
 *
 * @param {string|null|undefined} rawState
 * @returns {'Active' | 'Inactive' | 'Unknown'}
 */
export function getStandardConnectionState(rawState) {
  if (!rawState) return 'Unknown';
  const s = String(rawState).toUpperCase().trim();
  if (s === 'ACTIVE') return 'Active';
  if (s === 'INACTIVE') return 'Inactive';
  return s;
}
