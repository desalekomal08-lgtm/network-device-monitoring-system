import os
import sys
from datetime import datetime, timezone, timedelta
import pandas as pd
import pytest

# Ensure ml and backend can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from ml.src.preprocessing import extract_features, compute_device_summary, records_to_dataframe


# ==========================================================
# PREPROCESSING UNIT TESTS
# ==========================================================

def test_extract_features_calculations():
    """Verify calculation of moving averages, rate of change, and trend ratios."""
    base_time = datetime(2026, 10, 10, 12, 0, 0, tzinfo=timezone.utc)
    records = [
        {
            "timestamp": (base_time + timedelta(minutes=i)).isoformat(),
            "cpu_utilization": cpu,
            "memory_usage": 50.0,
            "bandwidth": 100.0,
            "latency": 10.0 + (i * 5),
            "packet_loss": 0.0,
            "interface_errors": i,
            "device_status": "UP",
        }
        for i, cpu in enumerate([20.0, 30.0, 40.0, 50.0, 60.0])
    ]

    df_feat = extract_features(records, window_sizes=[3, 5])
    assert len(df_feat) == 5

    # Check Moving Averages for CPU:
    # Index 2 (first 3): (20 + 30 + 40) / 3 = 30.0
    assert df_feat.loc[2, "cpu_ma3"] == 30.0
    # Index 4 (all 5): (20 + 30 + 40 + 50 + 60) / 5 = 40.0
    assert df_feat.loc[4, "cpu_ma5"] == 40.0

    # Check Rate of Change (diff):
    # Index 0: fillna(0) -> 0.0
    assert df_feat.loc[0, "cpu_change"] == 0.0
    # Index 1: 30 - 20 = 10.0
    assert df_feat.loc[1, "cpu_change"] == 10.0
    # Latency change: 15 - 10 = 5.0
    assert df_feat.loc[1, "latency_change"] == 5.0

    # Trend Ratio:
    # Index 4: CPU (60.0) / cpu_ma5 (40.0) = 1.5
    assert df_feat.loc[4, "cpu_trend_ratio"] == 1.5


def test_preprocessing_unordered_timestamps():
    """Verify that records submitted out of order are chronologically sorted."""
    t1 = "2026-10-10T10:00:00Z"
    t2 = "2026-10-10T10:05:00Z"
    t3 = "2026-10-10T10:10:00Z"

    # Out of order: t3, then t1, then t2
    unordered = [
        {"timestamp": t3, "cpu_utilization": 60.0, "memory_usage": 50.0, "bandwidth": 100.0, "latency": 10.0, "packet_loss": 0.0, "interface_errors": 0},
        {"timestamp": t1, "cpu_utilization": 20.0, "memory_usage": 50.0, "bandwidth": 100.0, "latency": 10.0, "packet_loss": 0.0, "interface_errors": 0},
        {"timestamp": t2, "cpu_utilization": 40.0, "memory_usage": 50.0, "bandwidth": 100.0, "latency": 10.0, "packet_loss": 0.0, "interface_errors": 0},
    ]

    df_feat = extract_features(unordered)
    # After sorting, row 0 should be t1 (CPU 20), row 1 t2 (CPU 40), row 2 t3 (CPU 60)
    assert df_feat.loc[0, "cpu_utilization"] == 20.0
    assert df_feat.loc[1, "cpu_utilization"] == 40.0
    assert df_feat.loc[2, "cpu_utilization"] == 60.0


def test_preprocessing_insufficient_history():
    """Verify that single reading or small history does not crash or yield all NaNs."""
    single_record = [
        {"timestamp": "2026-10-10T10:00:00Z", "cpu_utilization": 45.0, "memory_usage": 60.0, "bandwidth": 80.0, "latency": 12.0, "packet_loss": 0.0, "interface_errors": 0}
    ]
    df_feat = extract_features(single_record)
    assert len(df_feat) == 1
    assert df_feat.loc[0, "cpu_ma3"] == 45.0
    assert df_feat.loc[0, "cpu_change"] == 0.0
    assert df_feat.loc[0, "cpu_trend_ratio"] == 1.0


def test_preprocessing_empty_records():
    """Verify that empty inputs safely return an empty DataFrame without raising an exception."""
    df_empty = extract_features([])
    assert df_empty.empty
    summary = compute_device_summary(df_empty)
    assert summary["status"] == "NO_DATA"


def test_preprocessing_missing_values():
    """Verify that records with None/NaN values are properly imputed without crashing."""
    records_with_nan = [
        {"timestamp": "2026-10-10T10:00:00Z", "cpu_utilization": 30.0, "memory_usage": None, "bandwidth": 100.0, "latency": 10.0, "packet_loss": 0.0, "interface_errors": 0},
        {"timestamp": "2026-10-10T10:01:00Z", "cpu_utilization": None, "memory_usage": 55.0, "bandwidth": 100.0, "latency": 12.0, "packet_loss": 0.0, "interface_errors": 0},
    ]
    df_feat = extract_features(records_with_nan)
    assert not df_feat["cpu_utilization"].isna().any()
    assert not df_feat["memory_usage"].isna().any()


def test_compute_device_summary():
    """Verify statistical summary calculation."""
    records = [
        {"timestamp": "2026-10-10T10:00:00Z", "cpu_utilization": 30.0, "memory_usage": 40.0, "bandwidth": 100.0, "latency": 10.0, "packet_loss": 0.0, "interface_errors": 1, "device_status": "UP"},
        {"timestamp": "2026-10-10T10:01:00Z", "cpu_utilization": 60.0, "memory_usage": 50.0, "bandwidth": 100.0, "latency": 20.0, "packet_loss": 0.5, "interface_errors": 2, "device_status": "WARNING"},
    ]
    df_feat = extract_features(records)
    summary = compute_device_summary(df_feat)

    assert summary["record_count"] == 2
    assert summary["latest_device_status"] == "WARNING"
    assert summary["metrics"]["cpu_current"] == 60.0
    assert summary["metrics"]["cpu_change"] == 30.0
    assert summary["metrics"]["interface_errors_total"] == 3
