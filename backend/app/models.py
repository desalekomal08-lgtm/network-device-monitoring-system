from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Device(Base):
    """
    Represents a registered network device (Router, Switch, Server).
    Stores identification and monitoring configuration details provided by the user.
    """
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    device_name = Column(String(100), nullable=False)
    ip_address = Column(String(45), nullable=False, unique=True, index=True)
    device_type = Column(String(50), nullable=False)          # e.g., 'Router', 'Switch', 'Server'
    monitoring_method = Column(String(50), default="SNMP")     # e.g., 'SNMP', 'SIMULATED'
    status = Column(String(20), default="ACTIVE")             # 'ACTIVE', 'INACTIVE'
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship: One device has many historical monitoring records
    metrics = relationship("MonitoringData", back_populates="device", cascade="all, delete-orphan")


class MonitoringData(Base):
    """
    Represents a timestamped monitoring record collected from a network device.
    Stores core performance parameters used for historical analysis and ML.
    """
    __tablename__ = "monitoring_data"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    # Core Monitoring Parameters
    cpu_utilization = Column(Float, nullable=False)   # Percentage (0.0 - 100.0%)
    memory_usage = Column(Float, nullable=False)      # Percentage (0.0 - 100.0%)
    bandwidth = Column(Float, nullable=False)         # In Mbps
    latency = Column(Float, nullable=False)           # In milliseconds (ms)
    packet_loss = Column(Float, nullable=False)       # Percentage (0.0 - 100.0%)
    interface_errors = Column(Integer, default=0)     # Count of bad/dropped packets
    device_status = Column(String(20), default="UP")  # 'UP', 'DOWN', 'DEGRADED'

    # Relationship back to the parent Device
    device = relationship("Device", back_populates="metrics")
