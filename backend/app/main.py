from contextlib import asynccontextmanager
from datetime import datetime, timezone
import os
import sys
from typing import List
from fastapi import FastAPI, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

# Ensure ml and virtual_network modules can be imported
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app.database import engine, Base, get_db
import app.models as models
import app.schemas as schemas
from ml.src.fault_analysis import FaultAnalyzer


# Lifespan context manager runs database table creation safely on startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
        print("INFO: Database connection verified and tables ready.")
    except OperationalError as err:
        print(f"WARNING: Database is currently offline or unreachable: {err}")
    yield


# Initialize the FastAPI application
app = FastAPI(
    title="Network Device Monitoring and Predictive Fault Analysis System",
    description="Backend API for device management, data collection, and predictive analytics.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend development
from fastapi.middleware.cors import CORSMiddleware

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
)


# ==========================================================
# 1. HEALTH CHECK ENDPOINT (Preserved from Phase 2)
# ==========================================================

@app.get("/health", tags=["Health"])
def health_check():
    """
    Sanity check endpoint to verify backend server status and PostgreSQL connectivity.
    """
    db_status = "unknown"
    try:
        with engine.connect() as conn:
            db_status = "connected"
    except Exception:
        db_status = "disconnected (PostgreSQL not running or unreachable)"

    return {
        "status": "online",
        "message": "Network Monitoring System Backend is running smoothly.",
        "database": db_status
    }


# ==========================================================
# 2. DEVICE MANAGEMENT ENDPOINTS
# ==========================================================

@app.post(
    "/api/devices",
    response_model=schemas.DeviceResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Devices"],
    summary="Register a new network device"
)
def register_device(device_in: schemas.DeviceCreate, db: Session = Depends(get_db)):
    """
    Register a network device (e.g. Router-1).
    User supplies Device Name, IP Address, Device Type, and Monitoring Method.
    No automatic discovery is used; explicit configuration is stored.
    """
    existing_device = db.query(models.Device).filter(models.Device.ip_address == device_in.ip_address).first()
    if existing_device:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Device with IP address '{device_in.ip_address}' is already registered."
        )

    new_device = models.Device(
        device_name=device_in.device_name,
        ip_address=device_in.ip_address,
        device_type=device_in.device_type,
        monitoring_method=device_in.monitoring_method,
        status=device_in.status
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)
    return new_device


@app.get(
    "/api/devices",
    response_model=List[schemas.DeviceResponse],
    tags=["Devices"],
    summary="List all registered network devices"
)
def list_devices(db: Session = Depends(get_db)):
    """
    Retrieve a list of all registered network devices.
    """
    return db.query(models.Device).all()


@app.get(
    "/api/devices/{device_id}",
    response_model=schemas.DeviceResponse,
    tags=["Devices"],
    summary="Get single device details"
)
def get_device(device_id: int, db: Session = Depends(get_db)):
    """
    Retrieve details for a specific device by its ID.
    """
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device with ID {device_id} not found."
        )
    return device


# ==========================================================
# 3. MONITORING DATA COLLECTION & RETRIEVAL ENDPOINTS
# ==========================================================

@app.post(
    "/api/devices/{device_id}/metrics",
    response_model=schemas.MonitoringDataResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Monitoring Data"],
    summary="Store a monitoring data record for a device"
)
def record_metrics(
    device_id: int,
    metrics_in: schemas.MonitoringDataCreate,
    db: Session = Depends(get_db)
):
    """
    Store timestamped monitoring metrics (CPU, Memory, Bandwidth, Latency, Packet Loss, Errors)
    for a registered device.
    """
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cannot record metrics. Device with ID {device_id} does not exist."
        )

    record_timestamp = metrics_in.timestamp if metrics_in.timestamp is not None else datetime.now(timezone.utc)

    metric_record = models.MonitoringData(
        device_id=device_id,
        timestamp=record_timestamp,
        cpu_utilization=metrics_in.cpu_utilization,
        memory_usage=metrics_in.memory_usage,
        bandwidth=metrics_in.bandwidth,
        latency=metrics_in.latency,
        packet_loss=metrics_in.packet_loss,
        interface_errors=metrics_in.interface_errors,
        device_status=metrics_in.device_status
    )
    db.add(metric_record)
    db.commit()
    db.refresh(metric_record)
    return metric_record


@app.get(
    "/api/devices/{device_id}/metrics",
    response_model=List[schemas.MonitoringDataResponse],
    tags=["Monitoring Data"],
    summary="Retrieve historical monitoring data for a device"
)
def get_historical_metrics(
    device_id: int,
    limit: int = Query(default=100, ge=1, le=1000, description="Max number of historical records to return"),
    db: Session = Depends(get_db)
):
    """
    Retrieve historical monitoring records for a specific device,
    ordered by most recent first.
    """
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device with ID {device_id} not found."
        )

    return (
        db.query(models.MonitoringData)
        .filter(models.MonitoringData.device_id == device_id)
        .order_by(models.MonitoringData.timestamp.desc())
        .limit(limit)
        .all()
    )


@app.get(
    "/api/devices/{device_id}/metrics/latest",
    response_model=schemas.MonitoringDataResponse,
    tags=["Monitoring Data"],
    summary="Retrieve the most recent monitoring record for a device"
)
def get_latest_metric(device_id: int, db: Session = Depends(get_db)):
    """
    Retrieve the single most recent monitoring record for a specific device.
    """
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device with ID {device_id} not found."
        )

    latest = (
        db.query(models.MonitoringData)
        .filter(models.MonitoringData.device_id == device_id)
        .order_by(models.MonitoringData.timestamp.desc())
        .first()
    )
    if not latest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No monitoring records found for device ID {device_id}."
        )
    return latest


# ==========================================================
# 4. ML-BASED FAULT ANALYSIS & ANOMALY DETECTION ENDPOINT
# ==========================================================

@app.get(
    "/api/devices/{device_id}/analysis",
    response_model=schemas.FaultAnalysisResponse,
    tags=["Fault Analysis & ML"],
    summary="Run ML anomaly detection and calculate fault risk for a device"
)
def analyze_device_fault_risk(
    device_id: int,
    limit: int = Query(default=100, ge=1, le=500, description="Number of historical records to analyze"),
    db: Session = Depends(get_db)
):
    """
    Executes unsupervised anomaly detection (Isolation Forest) and operational
    domain analysis on the device's historical metrics to determine fault risk (0-100).
    """
    device = db.query(models.Device).filter(models.Device.id == device_id).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device with ID {device_id} not found."
        )

    records = (
        db.query(models.MonitoringData)
        .filter(models.MonitoringData.device_id == device_id)
        .order_by(models.MonitoringData.timestamp.asc())
        .limit(limit)
        .all()
    )

    analyzer = FaultAnalyzer()
    analysis_result = analyzer.analyze_device_metrics(records, device_id=device_id)
    return analysis_result
