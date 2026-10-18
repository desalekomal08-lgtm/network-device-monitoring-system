"""
Feature Preprocessing Pipeline for Network Telemetry.

Part of: Network Device Monitoring and Predictive Fault Analysis System.
Location: ml/src/preprocessing.py

Extracts derived time-series features (moving averages, rate of change, trends)
from historical device monitoring records. Handles missing values, timestamp
sorting, and insufficient historical depth safely.
"""

from typing import Union, List, Dict, Any, Optional
import pandas as pd
import numpy as np


FEATURE_COLUMNS = [
    # Baseline Metrics
    "cpu_utilization",
    "memory_usage",
    "bandwidth",
    "latency",
    "packet_loss",
    "interface_errors",
    # Moving Averages (Smooth short-term noise)
    "cpu_ma3",
    "cpu_ma5",
    "memory_ma3",
    "memory_ma5",
    "latency_ma3",
    "latency_ma5",
    "bandwidth_ma3",
    # Rate of Change / Deltas (Identifies rapid surges)
    "cpu_change",
    "memory_change",
    "latency_change",
    "packet_loss_change",
    "interface_errors_change",
    # Relative Trend Ratios
    "cpu_trend_ratio",
    "latency_trend_ratio",
]


def records_to_dataframe(records: Union[List[Dict[str, Any]], pd.DataFrame, List[Any]]) -> pd.DataFrame:
    """
    Normalizes different record inputs (list of dicts, SQLAlchemy models, DataFrame)
    into a clean pandas DataFrame sorted chronologically.
    """
    if isinstance(records, pd.DataFrame):
        df = records.copy()
    elif isinstance(records, list):
        if not records:
            return pd.DataFrame()
        # Handle SQLAlchemy ORM objects or dicts
        first = records[0]
        if hasattr(first, "__dict__") and not isinstance(first, dict):
            # SQLAlchemy model instances
            data = [
                {
                    "id": getattr(r, "id", None),
                    "device_id": getattr(r, "device_id", None),
                    "timestamp": getattr(r, "timestamp", None),
                    "cpu_utilization": getattr(r, "cpu_utilization", 0.0),
                    "memory_usage": getattr(r, "memory_usage", 0.0),
                    "bandwidth": getattr(r, "bandwidth", 0.0),
                    "latency": getattr(r, "latency", 0.0),
                    "packet_loss": getattr(r, "packet_loss", 0.0),
                    "interface_errors": getattr(r, "interface_errors", 0),
                    "device_status": getattr(r, "device_status", "UP"),
                }
                for r in records
            ]
            df = pd.DataFrame(data)
        else:
            df = pd.DataFrame(records)
    else:
        raise TypeError(f"Unsupported records format: {type(records)}")

    if df.empty:
        return df

    # Normalize 'memory_utilization' alias to 'memory_usage' if present
    if "memory_utilization" in df.columns and "memory_usage" not in df.columns:
        df["memory_usage"] = df["memory_utilization"]

    # Ensure timestamp is parsed as datetime and sorted ascending
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.sort_values(by="timestamp", ascending=True).reset_index(drop=True)

    # Ensure required numeric columns are present and numeric
    core_cols = [
        "cpu_utilization",
        "memory_usage",
        "bandwidth",
        "latency",
        "packet_loss",
        "interface_errors",
    ]
    for col in core_cols:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Handle missing values: forward fill, backward fill, fill 0
    df[core_cols] = df[core_cols].ffill().bfill().fillna(0.0)

    if "device_status" not in df.columns:
        df["device_status"] = "UP"
    df["device_status"] = df["device_status"].fillna("UP")

    return df


def extract_features(
    records: Union[List[Dict[str, Any]], pd.DataFrame, List[Any]],
    window_sizes: Optional[List[int]] = None,
) -> pd.DataFrame:
    """
    Extracts time-series features (moving averages, rate of change, trend ratios)
    from monitoring telemetry records.

    Safely handles:
    - Empty records: returns empty DataFrame.
    - Low record count (< window size): uses min_periods=1 to compute available data.
    - Missing values and unordered timestamps.
    """
    if window_sizes is None:
        window_sizes = [3, 5]

    df = records_to_dataframe(records)
    if df.empty:
        # Return empty DataFrame with defined feature schema
        return pd.DataFrame(columns=["timestamp", "device_id"] + FEATURE_COLUMNS + ["device_status"])

    # 1. Rolling Moving Averages (min_periods=1 prevents NaNs when data history is short)
    for w in window_sizes:
        df[f"cpu_ma{w}"] = df["cpu_utilization"].rolling(window=w, min_periods=1).mean().round(2)
        df[f"memory_ma{w}"] = df["memory_usage"].rolling(window=w, min_periods=1).mean().round(2)
        df[f"latency_ma{w}"] = df["latency"].rolling(window=w, min_periods=1).mean().round(2)

    df["bandwidth_ma3"] = df["bandwidth"].rolling(window=3, min_periods=1).mean().round(2)

    # 2. Rate of Change / Deltas between consecutive measurements (diff)
    df["cpu_change"] = df["cpu_utilization"].diff().fillna(0.0).round(2)
    df["memory_change"] = df["memory_usage"].diff().fillna(0.0).round(2)
    df["latency_change"] = df["latency"].diff().fillna(0.0).round(2)
    df["packet_loss_change"] = df["packet_loss"].diff().fillna(0.0).round(2)
    df["interface_errors_change"] = df["interface_errors"].diff().fillna(0).astype(int)

    # 3. Relative Trend Ratios (Current / 5-period Moving Average)
    # Ratios > 1.0 indicate an upward surge compared to recent history.
    # Safe division avoids division-by-zero.
    safe_cpu_ma5 = df["cpu_ma5"].replace(0.0, 1.0)
    df["cpu_trend_ratio"] = (df["cpu_utilization"] / safe_cpu_ma5).round(3)

    safe_latency_ma5 = df["latency_ma5"].replace(0.0, 1.0)
    df["latency_trend_ratio"] = (df["latency"] / safe_latency_ma5).round(3)

    return df


def compute_device_summary(df_features: pd.DataFrame) -> Dict[str, Any]:
    """
    Computes a concise operational summary of the preprocessed device metrics.
    Useful for quick diagnostics and dashboard summary cards.
    """
    if df_features.empty:
        return {
            "record_count": 0,
            "status": "NO_DATA",
            "message": "No telemetry readings available.",
        }

    latest = df_features.iloc[-1]

    return {
        "record_count": len(df_features),
        "latest_timestamp": latest["timestamp"].isoformat() if hasattr(latest["timestamp"], "isoformat") else str(latest["timestamp"]),
        "latest_device_status": latest.get("device_status", "UP"),
        "metrics": {
            "cpu_current": float(latest["cpu_utilization"]),
            "cpu_avg_ma5": float(latest.get("cpu_ma5", latest["cpu_utilization"])),
            "cpu_change": float(latest.get("cpu_change", 0.0)),
            "memory_current": float(latest["memory_usage"]),
            "memory_avg_ma5": float(latest.get("memory_ma5", latest["memory_usage"])),
            "memory_change": float(latest.get("memory_change", 0.0)),
            "latency_current": float(latest["latency"]),
            "latency_avg_ma5": float(latest.get("latency_ma5", latest["latency"])),
            "packet_loss_current": float(latest["packet_loss"]),
            "interface_errors_total": int(df_features["interface_errors"].sum()),
        },
    }
