import os
import sys
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure ml and backend can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from ml.src.fault_analysis import FaultAnalyzer
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
# FAULT ANALYZER UNIT TESTS
# ==========================================================

def test_fault_analyzer_normal_baseline():
    """Verify that normal stable readings produce LOW_RISK with no anomalies."""
    sim = NetworkDeviceSimulator(device_id=1, seed=100)
    normal_readings = sim.generate_scenario(scenario="normal", count=15)

    analyzer = FaultAnalyzer()
    result = analyzer.analyze_device_metrics(normal_readings, device_id=1)

    assert result["device_id"] == 1
    assert result["readings_analyzed"] == 15
    assert result["risk_level"] == "LOW_RISK"
    assert result["fault_risk_score"] < 40.0
    assert 0.0 <= result["fault_risk_score"] <= 100.0
    assert not result["is_anomaly"]


def test_fault_analyzer_cpu_spike_anomaly():
    """Verify that a severe CPU spike is flagged as anomaly with elevated risk."""
    sim = NetworkDeviceSimulator(device_id=1, seed=200)
    spike_readings = sim.generate_scenario(scenario="cpu_spike", count=12)

    analyzer = FaultAnalyzer()
    result = analyzer.analyze_device_metrics(spike_readings, device_id=1)

    assert result["is_anomaly"]
    assert result["fault_risk_score"] >= 45.0
    assert result["risk_level"] in ["HIGH_RISK", "MODERATE_RISK"]
    # Check that CPU is flagged in contributing metrics
    metric_names = [c["metric"] for c in result["contributing_metrics"]]
    assert any("cpu" in m for m in metric_names)


def test_fault_analyzer_memory_leak():
    """Verify that progressive memory exhaustion triggers elevated risk score."""
    sim = NetworkDeviceSimulator(device_id=1, seed=300)
    leak_readings = sim.generate_scenario(scenario="memory_leak", count=15)

    analyzer = FaultAnalyzer()
    result = analyzer.analyze_device_metrics(leak_readings, device_id=1)

    assert result["fault_risk_score"] >= 40.0
    metric_names = [c["metric"] for c in result["contributing_metrics"]]
    assert "memory_usage" in metric_names


def test_fault_analyzer_insufficient_history():
    """Verify safe fallback when readings are fewer than the minimum threshold."""
    analyzer = FaultAnalyzer()

    # Empty list
    res_empty = analyzer.analyze_device_metrics([], device_id=1)
    assert res_empty["readings_analyzed"] == 0
    assert res_empty["risk_level"] == "INSUFFICIENT_DATA"

    # Only 2 readings
    sparse = [
        {"timestamp": "2026-10-10T10:00:00Z", "cpu_utilization": 25.0, "memory_usage": 40.0, "latency": 10.0, "packet_loss": 0.0},
        {"timestamp": "2026-10-10T10:01:00Z", "cpu_utilization": 26.0, "memory_usage": 41.0, "latency": 10.5, "packet_loss": 0.0},
    ]
    res_sparse = analyzer.analyze_device_metrics(sparse, device_id=1)
    assert res_sparse["readings_analyzed"] == 2
    assert res_sparse["risk_level"] == "LOW_RISK"
    assert 0.0 <= res_sparse["fault_risk_score"] <= 100.0


def test_fault_analyzer_constant_values():
    """Verify that completely flat constant readings do not cause divide-by-zero errors."""
    constant_readings = [
        {"timestamp": f"2026-10-10T10:0{i}:00Z", "cpu_utilization": 30.0, "memory_usage": 40.0, "bandwidth": 100.0, "latency": 10.0, "packet_loss": 0.0, "interface_errors": 0}
        for i in range(8)
    ]
    analyzer = FaultAnalyzer()
    result = analyzer.analyze_device_metrics(constant_readings, device_id=1)
    assert result["risk_level"] == "LOW_RISK"
    assert result["fault_risk_score"] < 40.0


def test_fault_analyzer_boundary_clamping():
    """Verify risk scores never exceed [0.0, 100.0] even under extreme synthetic stress."""
    extreme_readings = [
        {"timestamp": f"2026-10-10T10:0{i}:00Z", "cpu_utilization": 100.0, "memory_usage": 100.0, "bandwidth": 0.0, "latency": 500.0, "packet_loss": 100.0, "interface_errors": 999}
        for i in range(10)
    ]
    analyzer = FaultAnalyzer()
    result = analyzer.analyze_device_metrics(extreme_readings, device_id=1)
    assert result["fault_risk_score"] <= 100.0
    assert result["fault_risk_score"] >= 0.0
    assert result["risk_level"] == "HIGH_RISK"


# ==========================================================
# FAULT ANALYSIS API ENDPOINT INTEGRATION TEST
# ==========================================================

def test_fault_analysis_api_endpoint(client):
    """Verify GET /api/devices/{device_id}/analysis runs and returns expected schema."""
    # 1. Register a test device
    dev_res = client.post("/api/devices", json={
        "device_name": "ML-Analyzed-Router",
        "ip_address": "10.10.10.1",
        "device_type": "Router",
        "monitoring_method": "SIMULATED",
        "status": "ACTIVE"
    })
    assert dev_res.status_code == 201
    device_id = dev_res.json()["id"]

    # 2. Query analysis when no data exists
    res_empty = client.get(f"/api/devices/{device_id}/analysis")
    assert res_empty.status_code == 200
    assert res_empty.json()["readings_analyzed"] == 0

    # 3. Populate device with simulated readings
    sim = NetworkDeviceSimulator(device_id=device_id, seed=77)
    readings = sim.generate_scenario(scenario="cpu_spike", count=8)
    for r in readings:
        client.post(f"/api/devices/{device_id}/metrics", json=r)

    # 4. Query analysis endpoint
    res_analyzed = client.get(f"/api/devices/{device_id}/analysis")
    assert res_analyzed.status_code == 200
    data = res_analyzed.json()

    assert data["device_id"] == device_id
    assert data["readings_analyzed"] == 8
    assert "fault_risk_score" in data
    assert "risk_level" in data
    assert "contributing_metrics" in data
    assert "summary_explanation" in data
    assert "algorithm_used" in data

    # 5. Non-existent device returns 404
    not_found = client.get("/api/devices/999/analysis")
    assert not_found.status_code == 404
