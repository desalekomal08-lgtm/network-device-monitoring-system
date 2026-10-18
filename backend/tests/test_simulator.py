import os
import sys
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure virtual_network and backend can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from virtual_network.device_simulator import NetworkDeviceSimulator
from app.database import Base, get_db
from app.main import app


# Test database setup for integration test
TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client

    Base.metadata.drop_all(bind=test_engine)
    app.dependency_overrides.clear()


# ==========================================================
# SIMULATOR UNIT TESTS
# ==========================================================

def test_simulator_reading_structure():
    """Verify generated reading strictly complies with schema field names and types."""
    sim = NetworkDeviceSimulator(device_id=1, seed=42)
    reading = sim.generate_reading(scenario="normal")

    required_fields = [
        "timestamp",
        "cpu_utilization",
        "memory_usage",
        "bandwidth",
        "latency",
        "packet_loss",
        "interface_errors",
        "device_status",
    ]
    for field in required_fields:
        assert field in reading, f"Missing required field: {field}"

    assert 0.0 <= reading["cpu_utilization"] <= 100.0
    assert 0.0 <= reading["memory_usage"] <= 100.0
    assert reading["bandwidth"] >= 0.0
    assert reading["latency"] >= 0.0
    assert 0.0 <= reading["packet_loss"] <= 100.0
    assert reading["interface_errors"] >= 0
    assert reading["device_status"] in ["UP", "WARNING", "DEGRADED", "CRITICAL"]


def test_simulator_scenarios():
    """Verify that all configured scenarios generate appropriate patterns."""
    sim = NetworkDeviceSimulator(device_id=1, seed=123)

    for scenario in NetworkDeviceSimulator.AVAILABLE_SCENARIOS:
        readings = sim.generate_scenario(scenario=scenario, count=5)
        assert len(readings) == 5
        for r in readings:
            assert 0.0 <= r["cpu_utilization"] <= 100.0
            assert 0.0 <= r["memory_usage"] <= 100.0


def test_simulator_reproducibility():
    """Verify that using the same random seed yields identical metrics."""
    sim1 = NetworkDeviceSimulator(device_id=1, seed=999)
    sim2 = NetworkDeviceSimulator(device_id=1, seed=999)

    fixed_time = datetime(2026, 10, 10, 12, 0, 0, tzinfo=timezone.utc)
    r1 = sim1.generate_scenario(scenario="cpu_spike", count=5, start_time=fixed_time)
    r2 = sim2.generate_scenario(scenario="cpu_spike", count=5, start_time=fixed_time)

    assert r1 == r2


def test_simulator_memory_leak_progression():
    """Verify that 'memory_leak' scenario produces an upward memory progression."""
    sim = NetworkDeviceSimulator(device_id=1, seed=10)
    readings = sim.generate_scenario(scenario="memory_leak", count=6)

    # First reading should have baseline memory, last should have significantly higher
    first_mem = readings[0]["memory_usage"]
    last_mem = readings[-1]["memory_usage"]
    assert last_mem > first_mem + 30.0


# ==========================================================
# SIMULATOR TO API INTEGRATION TEST
# ==========================================================

def test_simulator_submission_pipeline(client):
    """Verify that simulated readings are accepted and stored through the actual API."""
    # 1. Register a test device
    dev_res = client.post("/api/devices", json={
        "device_name": "Simulated-Router",
        "ip_address": "10.0.0.1",
        "device_type": "Router",
        "monitoring_method": "SIMULATED",
        "status": "ACTIVE"
    })
    assert dev_res.status_code == 201
    device_id = dev_res.json()["id"]

    # 2. Generate simulated metrics
    sim = NetworkDeviceSimulator(device_id=device_id, seed=55)
    readings = sim.generate_scenario(scenario="high_latency", count=3)

    # 3. Submit through API
    for r in readings:
        sub_res = client.post(f"/api/devices/{device_id}/metrics", json=r)
        assert sub_res.status_code == 201
        saved = sub_res.json()
        assert saved["device_id"] == device_id
        assert saved["latency"] == r["latency"]

    # 4. Verify historical query retrieves them
    hist_res = client.get(f"/api/devices/{device_id}/metrics")
    assert hist_res.status_code == 200
    assert len(hist_res.json()) == 3
