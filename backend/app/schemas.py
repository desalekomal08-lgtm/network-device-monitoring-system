from datetime import datetime
from typing import Optional, Any, List
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


# ==========================================================
# DEVICE SCHEMAS (Validation for Device Registration)
# ==========================================================

class DeviceCreate(BaseModel):
    """
    Schema for adding/registering a new network device.
    User provides device name, IP, type, and monitoring configuration.
    """
    device_name: str = Field(..., min_length=2, max_length=100, description="Human-readable name, e.g. Router-1")
    ip_address: str = Field(..., description="Valid IPv4 or IPv6 address")
    device_type: str = Field(..., min_length=2, max_length=50, description="Device Type, e.g. Router, Switch, Server")
    monitoring_method: Optional[str] = Field(default="SNMP", description="Monitoring protocol/source, e.g. SNMP, SIMULATED")
    status: Optional[str] = Field(default="ACTIVE", description="Initial status: ACTIVE or INACTIVE")

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, value: str) -> str:
        v = value.strip()
        if not v:
            raise ValueError("IP address cannot be blank")
        return v


class DeviceResponse(BaseModel):
    """
    Schema for returning device information back to the client.
    """
    id: int
    device_name: str
    ip_address: str
    device_type: str
    monitoring_method: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# MONITORING DATA SCHEMAS (Validation for Telemetry/Metrics)
# ==========================================================

class MonitoringDataCreate(BaseModel):
    """
    Schema for recording a metric reading for a device.
    Validates that numerical values fall within realistic boundaries.
    """
    timestamp: Optional[datetime] = Field(
        default=None,
        description="Optional timestamp of measurement (defaults to current UTC time if omitted)"
    )
    cpu_utilization: float = Field(..., ge=0.0, le=100.0, description="CPU usage percentage (0 to 100%)")
    memory_usage: float = Field(..., ge=0.0, le=100.0, description="Memory usage percentage (0 to 100%)")
    bandwidth: float = Field(..., ge=0.0, description="Current traffic bandwidth in Mbps")
    latency: float = Field(..., ge=0.0, description="Round-trip latency in milliseconds")
    packet_loss: float = Field(..., ge=0.0, le=100.0, description="Packet loss percentage (0 to 100%)")
    interface_errors: Optional[int] = Field(default=0, ge=0, description="Interface error packet count")
    device_status: Optional[str] = Field(default="UP", description="Status observed: UP, DOWN, DEGRADED, etc.")

    @model_validator(mode="before")
    @classmethod
    def handle_memory_alias(cls, data: Any) -> Any:
        """
        Accepts 'memory_utilization' as an interchangeable alias for 'memory_usage'.
        """
        if isinstance(data, dict):
            if "memory_utilization" in data and "memory_usage" not in data:
                data["memory_usage"] = data["memory_utilization"]
        return data

    @field_validator("device_status")
    @classmethod
    def validate_device_status(cls, value: Optional[str]) -> str:
        if not value:
            return "UP"
        normalized = value.strip().upper()
        allowed = {"UP", "DOWN", "DEGRADED", "WARNING", "CRITICAL", "UNKNOWN"}
        if normalized not in allowed:
            raise ValueError(f"device_status must be one of: {', '.join(sorted(allowed))}")
        return normalized


class MonitoringDataResponse(BaseModel):
    """
    Schema for returning historical metric readings back to the client.
    """
    id: int
    device_id: int
    timestamp: datetime
    cpu_utilization: float
    memory_usage: float
    bandwidth: float
    latency: float
    packet_loss: float
    interface_errors: int
    device_status: str

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# FAULT ANALYSIS & ANOMALY DETECTION SCHEMAS
# ==========================================================

class ContributingMetric(BaseModel):
    metric: str
    value: float
    severity: str
    detail: str


class FaultAnalysisResponse(BaseModel):
    device_id: int
    analysis_timestamp: datetime
    latest_reading_timestamp: Optional[datetime] = None
    readings_analyzed: int
    is_anomaly: bool
    anomaly_score: float
    fault_risk_score: float
    risk_level: str
    contributing_metrics: List[ContributingMetric]
    summary_explanation: str
    algorithm_used: str
    disclaimer: str

    model_config = ConfigDict(from_attributes=True)
