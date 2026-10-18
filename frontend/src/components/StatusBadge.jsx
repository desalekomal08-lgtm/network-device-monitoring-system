import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  Radio,
  PowerOff,
  ShieldCheck,
} from 'lucide-react';
import { getStandardStatus, getStandardConnectionState } from '../utils/statusUtils';

/**
 * HealthBadge renders the standardized operational health:
 * - Healthy: Green
 * - Degraded: Amber
 * - Critical: Muted Red
 * - Unknown: Muted Slate / Gray
 */
export function HealthBadge({ status, showIcon = true, size = 'md' }) {
  const std = getStandardStatus(status);
  const iconSize = size === 'sm' ? 12 : 14;

  switch (std) {
    case 'Healthy':
      return (
        <span className={`badge badge-healthy badge-${size}`} title="Operating within defined thresholds">
          {showIcon && <CheckCircle2 size={iconSize} />}
          <span>Healthy</span>
        </span>
      );
    case 'Degraded':
      return (
        <span className={`badge badge-degraded badge-${size}`} title="Warning-level operational issue detected">
          {showIcon && <AlertTriangle size={iconSize} />}
          <span>Degraded</span>
        </span>
      );
    case 'Critical':
      return (
        <span className={`badge badge-critical badge-${size}`} title="Severe operational threshold violation">
          {showIcon && <AlertOctagon size={iconSize} />}
          <span>Critical</span>
        </span>
      );
    default:
      return (
        <span className={`badge badge-unknown badge-${size}`} title="Device status cannot be determined">
          {showIcon && <HelpCircle size={iconSize} />}
          <span>Unknown</span>
        </span>
      );
  }
}

/**
 * ConnectionBadge renders monitoring administrative/link state:
 * Kept strictly separate from operational health.
 * - Active: Cyan / Slate-Teal
 * - Inactive: Muted Slate
 */
export function ConnectionBadge({ status, showIcon = true, size = 'md' }) {
  const std = getStandardConnectionState(status);
  const iconSize = size === 'sm' ? 12 : 14;

  if (std === 'Active') {
    return (
      <span className={`badge badge-connection-active badge-${size}`} title="Monitoring polling enabled">
        {showIcon && <Radio size={iconSize} />}
        <span>Active</span>
      </span>
    );
  }

  return (
    <span className={`badge badge-connection-inactive badge-${size}`} title="Monitoring polling paused or disabled">
      {showIcon && <PowerOff size={iconSize} />}
      <span>{std}</span>
    </span>
  );
}

/**
 * RiskBadge renders predictive ML fault-risk category:
 * - Low Risk (0-39): Green
 * - Moderate Risk (40-69): Amber
 * - High Risk (70-100): Muted Red
 * - Insufficient Data: Slate
 */
export function RiskBadge({ level, showIcon = true, size = 'md' }) {
  const iconSize = size === 'sm' ? 12 : 14;

  switch (level) {
    case 'LOW_RISK':
      return (
        <span className={`badge badge-healthy badge-${size}`} title="Low anomaly probability">
          {showIcon && <ShieldCheck size={iconSize} />}
          <span>Low Risk</span>
        </span>
      );
    case 'MODERATE_RISK':
      return (
        <span className={`badge badge-degraded badge-${size}`} title="Elevated anomaly score or warning indicators">
          {showIcon && <AlertTriangle size={iconSize} />}
          <span>Moderate Risk</span>
        </span>
      );
    case 'HIGH_RISK':
      return (
        <span className={`badge badge-critical badge-${size}`} title="Multivariate anomaly or severe resource exhaustion">
          {showIcon && <AlertOctagon size={iconSize} />}
          <span>High Risk</span>
        </span>
      );
    default:
      return (
        <span className={`badge badge-unknown badge-${size}`} title="Insufficient historical readings for ML analysis">
          {showIcon && <HelpCircle size={iconSize} />}
          <span>Insufficient Data</span>
        </span>
      );
  }
}

export default HealthBadge;
