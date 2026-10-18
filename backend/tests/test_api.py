from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

# StaticPool ensures that all threads and connections share the exact same in-memory SQLite database
TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="module")
def client():
    # Setup database tables in test database
    Base.metadata.create_all(bind=test_engine)

    # Dependency override for test isolation
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client

    # Teardown
    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


# ==========================================================
# TEST 1: Health Endpoint (/health)
# ==========================================================
def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "database" in data


# ==========================================================
# TEST 2: Device Registration (POST /api/devices)
# ==========================================================
def test_register_device(client):
    payload = {
        "device_name": "Test-Router-1",
        "ip_address": "192.168.1.1",
        "device_type": "Router",
        "monitoring_method": "SNMP",
        "status": "ACTIVE"
    }
    response = client.post("/api/devices", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == 1
    assert data["device_name"] == "Test-Router-1"
    assert data["ip_address"] == "192.168.1.1"


# ==========================================================
# TEST 3: Duplicate IP Prevention
# ==========================================================
def test_prevent_duplicate_ip(client):
    duplicate_payload = {
        "device_name": "Duplicate-Router",
        "ip_address": "192.168.1.1",
        "device_type": "Router",
        "monitoring_method": "SNMP"
    }
    response = client.post("/api/devices", json=duplicate_payload)
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]


# ==========================================================
# TEST 4: List and Retrieve Single Device
# ==========================================================
def test_list_and_get_device(client):
    # List devices
    response = client.get("/api/devices")
    assert response.status_code == 200
    devices = response.json()
    assert len(devices) == 1
    assert devices[0]["device_name"] == "Test-Router-1"

    # Get single device
    single_res = client.get("/api/devices/1")
    assert single_res.status_code == 200
    assert single_res.json()["device_name"] == "Test-Router-1"

    # Non-existent device returns 404
    not_found = client.get("/api/devices/999")
    assert not_found.status_code == 404


# ==========================================================
# TEST 5: Metric Storage with Validation (POST /api/devices/{id}/metrics)
# ==========================================================
def test_record_monitoring_data(client):
    valid_metrics = {
        "cpu_utilization": 45.5,
        "memory_usage": 60.2,
        "bandwidth": 120.0,
        "latency": 15.4,
        "packet_loss": 0.0,
        "interface_errors": 0,
        "device_status": "UP"
    }
    response = client.post("/api/devices/1/metrics", json=valid_metrics)
    assert response.status_code == 201
    data = response.json()
    assert data["device_id"] == 1
    assert data["cpu_utilization"] == 45.5
    assert data["memory_usage"] == 60.2
    assert "timestamp" in data


def test_record_monitoring_data_with_memory_utilization_alias(client):
    # Tests that 'memory_utilization' can be used instead of 'memory_usage'
    alias_metrics = {
        "cpu_utilization": 50.0,
        "memory_utilization": 65.5,
        "bandwidth": 100.0,
        "latency": 12.0,
        "packet_loss": 0.1,
        "interface_errors": 0,
        "device_status": "UP"
    }
    response = client.post("/api/devices/1/metrics", json=alias_metrics)
    assert response.status_code == 201
    data = response.json()
    assert data["memory_usage"] == 65.5


def test_record_monitoring_data_with_custom_timestamp(client):
    past_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    historical_metrics = {
        "timestamp": past_time,
        "cpu_utilization": 70.0,
        "memory_usage": 80.0,
        "bandwidth": 200.0,
        "latency": 30.0,
        "packet_loss": 1.2,
        "interface_errors": 5,
        "device_status": "WARNING"
    }
    response = client.post("/api/devices/1/metrics", json=historical_metrics)
    assert response.status_code == 201
    data = response.json()
    assert data["device_status"] == "WARNING"


# ==========================================================
# TEST 6: Input Validation Errors
# ==========================================================
def test_metric_validation_rejection(client):
    # Invalid: CPU > 100% and negative packet loss
    invalid_metrics = {
        "cpu_utilization": 150.0,  # Invalid: > 100%
        "memory_usage": 50.0,
        "bandwidth": 10.0,
        "latency": 5.0,
        "packet_loss": -5.0       # Invalid: < 0%
    }
    response = client.post("/api/devices/1/metrics", json=invalid_metrics)
    assert response.status_code == 422

    # Invalid: Non-existent device ID
    not_found_device = client.post("/api/devices/999/metrics", json={
        "cpu_utilization": 30.0,
        "memory_usage": 40.0,
        "bandwidth": 50.0,
        "latency": 10.0,
        "packet_loss": 0.0
    })
    assert not_found_device.status_code == 404


# ==========================================================
# TEST 7: Historical and Latest Metrics Retrieval
# ==========================================================
def test_get_historical_metrics(client):
    response = client.get("/api/devices/1/metrics?limit=10")
    assert response.status_code == 200
    history = response.json()
    assert len(history) == 3


def test_get_latest_metric(client):
    response = client.get("/api/devices/1/metrics/latest")
    assert response.status_code == 200
    data = response.json()
    assert data["device_id"] == 1
    assert "cpu_utilization" in data

    # Non-existent device
    not_found = client.get("/api/devices/999/metrics/latest")
    assert not_found.status_code == 404
