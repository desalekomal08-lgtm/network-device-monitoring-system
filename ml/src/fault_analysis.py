"""
Machine Learning Fault Analysis & Anomaly Detection Engine.

Part of: Network Device Monitoring and Predictive Fault Analysis System.
Location: ml/src/fault_analysis.py

Uses Scikit-learn (Isolation Forest) alongside time-series feature preprocessing
to detect abnormal device telemetry and compute an interpretable Fault-Risk Score (0-100).
"""

from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Union
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from ml.src.preprocessing import extract_features, records_to_dataframe


# Features selected for unsupervised anomaly detection
ML_FEATURE_COLS = [
    "cpu_utilization",
    "memory_usage",
    "latency",
    "packet_loss",
    "interface_errors",
    "cpu_change",
    "memory_change",
    "latency_change",
    "cpu_trend_ratio",
    "latency_trend_ratio",
]


class FaultAnalyzer:
    """
    Performs unsupervised anomaly detection and calculates an operational
    fault-risk score based on current metrics and historical patterns.
    """

    def __init__(self, random_state: int = 42, contamination: float = 0.15):
        self.random_state = random_state
        self.contamination = contamination

    def _calculate_domain_stress_score(self, latest_row: pd.Series) -> tuple[float, List[Dict[str, Any]]]:
        """
        Calculates an operational stress score (0-100) based on critical network thresholds.
        Identifies specific metric contributors.
        """
        stress = 0.0
        contributors = []

        cpu = float(latest_row.get("cpu_utilization", 0.0))
        cpu_change = float(latest_row.get("cpu_change", 0.0))
        memory = float(latest_row.get("memory_usage", 0.0))
        memory_change = float(latest_row.get("memory_change", 0.0))
        latency = float(latest_row.get("latency", 0.0))
        packet_loss = float(latest_row.get("packet_loss", 0.0))
        errors = int(latest_row.get("interface_errors", 0))

        # 1. CPU checks
        if cpu >= 90.0:
            stress += 45.0
            contributors.append({
                "metric": "cpu_utilization",
                "value": cpu,
                "severity": "CRITICAL",
                "detail": f"CPU utilization is critical ({cpu:.1f}% >= 90%).",
            })
        elif cpu >= 75.0:
            stress += 25.0
            contributors.append({
                "metric": "cpu_utilization",
                "value": cpu,
                "severity": "WARNING",
                "detail": f"CPU utilization is elevated ({cpu:.1f}% >= 75%).",
            })

        if cpu_change >= 15.0:
            stress += 15.0
            contributors.append({
                "metric": "cpu_change",
                "value": cpu_change,
                "severity": "WARNING",
                "detail": f"Rapid CPU surge detected (+{cpu_change:.1f}% change).",
            })

        # 2. Memory checks
        if memory >= 88.0:
            stress += 45.0
            contributors.append({
                "metric": "memory_usage",
                "value": memory,
                "severity": "CRITICAL",
                "detail": f"Memory exhaustion risk ({memory:.1f}% >= 88%).",
            })
        elif memory >= 75.0:
            stress += 25.0
            contributors.append({
                "metric": "memory_usage",
                "value": memory,
                "severity": "WARNING",
                "detail": f"Memory usage is elevated ({memory:.1f}% >= 75%).",
            })

        if memory_change >= 8.0:
            stress += 15.0
            contributors.append({
                "metric": "memory_change",
                "value": memory_change,
                "severity": "WARNING",
                "detail": f"Memory climbing quickly (+{memory_change:.1f}% change).",
            })

        # 3. Network health (Packet loss & latency)
        if packet_loss >= 5.0:
            stress += 40.0
            contributors.append({
                "metric": "packet_loss",
                "value": packet_loss,
                "severity": "CRITICAL",
                "detail": f"Severe packet loss detected ({packet_loss:.1f}% >= 5%).",
            })
        elif packet_loss >= 1.0:
            stress += 20.0
            contributors.append({
                "metric": "packet_loss",
                "value": packet_loss,
                "severity": "WARNING",
                "detail": f"Packet loss detected ({packet_loss:.1f}%).",
            })

        if latency >= 100.0:
            stress += 30.0
            contributors.append({
                "metric": "latency",
                "value": latency,
                "severity": "CRITICAL",
                "detail": f"Excessive latency delay ({latency:.1f}ms >= 100ms).",
            })
        elif latency >= 40.0:
            stress += 15.0
            contributors.append({
                "metric": "latency",
                "value": latency,
                "severity": "WARNING",
                "detail": f"Latency delay is elevated ({latency:.1f}ms >= 40ms).",
            })

        # 4. Interface errors
        if errors >= 5:
            stress += 25.0
            contributors.append({
                "metric": "interface_errors",
                "value": errors,
                "severity": "CRITICAL",
                "detail": f"Severe interface corruption/packet errors ({errors} errors).",
            })
        elif errors >= 1:
            stress += 10.0
            contributors.append({
                "metric": "interface_errors",
                "value": errors,
                "severity": "WARNING",
                "detail": f"Interface errors observed ({errors} errors).",
            })

        return min(100.0, stress), contributors

    def analyze_device_metrics(
        self,
        records: Union[List[Dict[str, Any]], pd.DataFrame, List[Any]],
        device_id: Optional[int] = None,
        min_samples_for_ml: int = 5,
    ) -> Dict[str, Any]:
        """
        Executes the fault analysis pipeline on historical records for a device.
        Combines unsupervised Isolation Forest anomaly scoring with operational stress indicators.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        disclaimer = "Fault risk indicates abnormal deviation and resource stress, not a guarantee of physical hardware failure."

        # Step 1: Preprocess and extract derived time-series features
        df_feat = extract_features(records)

        if df_feat.empty:
            return {
                "device_id": device_id,
                "analysis_timestamp": now_iso,
                "latest_reading_timestamp": None,
                "readings_analyzed": 0,
                "is_anomaly": False,
                "anomaly_score": 0.0,
                "fault_risk_score": 0.0,
                "risk_level": "INSUFFICIENT_DATA",
                "contributing_metrics": [],
                "summary_explanation": "No monitoring records available to analyze.",
                "algorithm_used": "None (No data)",
                "disclaimer": disclaimer,
            }

        latest_row = df_feat.iloc[-1]
        latest_time = latest_row["timestamp"].isoformat() if hasattr(latest_row["timestamp"], "isoformat") else str(latest_row["timestamp"])
        dev_id = device_id if device_id is not None else int(latest_row.get("device_id", 0))

        # Calculate operational domain stress
        domain_score, contributors = self._calculate_domain_stress_score(latest_row)
        has_critical = any(c.get("severity") == "CRITICAL" for c in contributors)

        readings_count = len(df_feat)

        # Step 2: Unsupervised Anomaly Detection using Isolation Forest
        if readings_count < min_samples_for_ml:
            fault_risk_score = round(domain_score, 1)
            is_anomaly = (domain_score >= 40.0) or has_critical
            anomaly_score = round(domain_score / 100.0, 2)
            algo_used = f"Domain Threshold Engine (Need >={min_samples_for_ml} samples for Isolation Forest)"
        else:
            # Prepare feature matrix for ML
            X = df_feat[ML_FEATURE_COLS].copy()
            X = X.replace([np.inf, -np.inf], np.nan).fillna(0.0)

            # Fit Isolation Forest
            model = IsolationForest(
                n_estimators=100,
                contamination=self.contamination,
                random_state=self.random_state,
            )
            model.fit(X)

            scores = model.decision_function(X)
            latest_decision = float(scores[-1])
            is_anomaly_pred = bool(model.predict(X)[-1] == -1)

            # Map decision function (-0.5 to +0.5) to an anomaly score (0 to 100)
            raw_anomaly_score = max(0.0, min(100.0, (0.25 - latest_decision) / 0.5 * 100.0))

            # Combine Unsupervised Anomaly Score (50%) + Domain Stress Score (50%)
            fault_risk_score = round(min(100.0, (0.5 * raw_anomaly_score) + (0.5 * domain_score)), 1)
            is_anomaly = is_anomaly_pred or (fault_risk_score >= 40.0) or has_critical
            anomaly_score = round(raw_anomaly_score / 100.0, 3)
            algo_used = "Scikit-learn Isolation Forest + Operational Domain Rules"

        # Step 3: Categorize Risk Level
        if readings_count < 3 and domain_score == 0.0:
            risk_level = "LOW_RISK"
        elif fault_risk_score >= 70.0 or has_critical:
            risk_level = "HIGH_RISK"
        elif fault_risk_score >= 40.0:
            risk_level = "MODERATE_RISK"
        else:
            risk_level = "LOW_RISK"

        # Step 4: Generate Human-Readable Summary Explanation
        if risk_level == "HIGH_RISK":
            issues = [c["detail"] for c in contributors]
            issues_str = " ".join(issues) if issues else "Severe multivariate anomaly detected."
            explanation = f"HIGH RISK: Abnormal pattern detected. {issues_str}"
        elif risk_level == "MODERATE_RISK":
            issues = [c["detail"] for c in contributors]
            issues_str = " ".join(issues) if issues else "Noticeable deviation from baseline behavior."
            explanation = f"MODERATE RISK: Elevated metric activity observed. {issues_str}"
        else:
            explanation = "LOW RISK: Device operating within normal baseline parameters. No significant anomalies detected."

        return {
            "device_id": dev_id,
            "analysis_timestamp": now_iso,
            "latest_reading_timestamp": latest_time,
            "readings_analyzed": readings_count,
            "is_anomaly": is_anomaly,
            "anomaly_score": anomaly_score,
            "fault_risk_score": fault_risk_score,
            "risk_level": risk_level,
            "contributing_metrics": contributors,
            "summary_explanation": explanation,
            "algorithm_used": algo_used,
            "disclaimer": disclaimer,
        }
