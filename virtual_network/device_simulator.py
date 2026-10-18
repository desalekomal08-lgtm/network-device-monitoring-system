"""
Modular Network Device Telemetry Simulator.

Part of: Network Device Monitoring and Predictive Fault Analysis System.
Location: virtual_network/device_simulator.py

Generates realistic timestamped telemetry for registered network devices.
Supports normal baselines and anomalous scenarios (CPU spikes, memory leaks,
high latency, packet loss surges).
Submits readings directly through the backend's REST API endpoint:
POST /api/devices/{device_id}/metrics
"""

import argparse
import json
import random
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import urllib.request
import urllib.error


class NetworkDeviceSimulator:
    """
    Simulates network device metric streams under different operational scenarios.
    """

    AVAILABLE_SCENARIOS = [
        "normal",
        "cpu_spike",
        "memory_leak",
        "high_latency",
        "packet_loss",
    ]

    def __init__(self, device_id: int, seed: Optional[int] = None):
        self.device_id = device_id
        self.seed = seed
        self.rng = random.Random(seed)

    def _clamp(self, val: float, min_val: float, max_val: float) -> float:
        return max(min_val, min(max_val, val))

    def generate_reading(
        self,
        scenario: str = "normal",
        step_index: int = 0,
        total_steps: int = 1,
        timestamp: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Generate a single realistic metric reading adhering to the backend's MonitoringData schema.
        """
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)

        # Baseline "normal" operating values
        cpu = self.rng.uniform(22.0, 38.0)
        memory = self.rng.uniform(42.0, 52.0)
        bandwidth = self.rng.uniform(85.0, 115.0)
        latency = self.rng.uniform(8.0, 15.0)
        packet_loss = 0.0
        interface_errors = 0
        device_status = "UP"

        progress = step_index / max(1, total_steps - 1) if total_steps > 1 else 1.0

        if scenario == "normal":
            # Small random fluctuations around normal baseline
            cpu += self.rng.uniform(-3.0, 3.0)
            memory += self.rng.uniform(-1.0, 1.0)
            latency += self.rng.uniform(-2.0, 2.0)

        elif scenario == "cpu_spike":
            # Progressively climbs to a high peak or spikes suddenly
            if progress > 0.4:
                spike_factor = min(1.0, (progress - 0.4) / 0.4)
                cpu = 40.0 + (52.0 * spike_factor) + self.rng.uniform(-2.0, 3.0)
                latency += 10.0 * spike_factor
                if cpu > 85.0:
                    device_status = "WARNING"
                if cpu > 92.0:
                    device_status = "DEGRADED"

        elif scenario == "memory_leak":
            # Memory incrementally increases with every step
            leak_growth = progress * 48.0  # Climbs from baseline ~45% up to ~93%
            memory = 45.0 + leak_growth + self.rng.uniform(-1.0, 1.5)
            if memory > 75.0:
                device_status = "WARNING"
            if memory > 88.0:
                device_status = "DEGRADED"

        elif scenario == "high_latency":
            # Latency swells and packet loss begins to creep up
            congestion = progress * 140.0
            latency = 12.0 + congestion + self.rng.uniform(-5.0, 12.0)
            bandwidth = max(20.0, bandwidth - (progress * 40.0))
            if progress > 0.5:
                packet_loss = self.rng.uniform(0.5, 2.5)
                device_status = "WARNING"
            if latency > 100.0:
                device_status = "DEGRADED"

        elif scenario == "packet_loss":
            # Significant packet loss and interface error surge
            loss_intensity = progress * 12.0
            packet_loss = loss_intensity + self.rng.uniform(0.0, 2.0)
            interface_errors = int(progress * 15 + self.rng.randint(0, 3))
            latency += progress * 40.0
            bandwidth = max(10.0, bandwidth - (progress * 65.0))
            if packet_loss > 3.0:
                device_status = "WARNING"
            if packet_loss > 8.0:
                device_status = "DEGRADED"

        else:
            raise ValueError(
                f"Unknown scenario '{scenario}'. Choose from {self.AVAILABLE_SCENARIOS}"
            )

        return {
            "timestamp": timestamp.isoformat(),
            "cpu_utilization": round(self._clamp(cpu, 0.0, 100.0), 2),
            "memory_usage": round(self._clamp(memory, 0.0, 100.0), 2),
            "bandwidth": round(max(0.0, bandwidth), 2),
            "latency": round(max(0.0, latency), 2),
            "packet_loss": round(self._clamp(packet_loss, 0.0, 100.0), 2),
            "interface_errors": max(0, int(interface_errors)),
            "device_status": device_status,
        }

    def generate_scenario(
        self,
        scenario: str = "normal",
        count: int = 10,
        interval_seconds: int = 30,
        start_time: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """
        Generate an ordered series of timestamped readings for a scenario.
        """
        if start_time is None:
            # End at current time, go backward to make a realistic history
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(seconds=(count - 1) * interval_seconds)

        readings = []
        for i in range(count):
            t = start_time + timedelta(seconds=i * interval_seconds)
            reading = self.generate_reading(
                scenario=scenario,
                step_index=i,
                total_steps=count,
                timestamp=t,
            )
            readings.append(reading)

        return readings

    def submit_readings(
        self,
        readings: List[Dict[str, Any]],
        api_base_url: str = "http://127.0.0.1:8000",
        timeout: int = 5,
    ) -> Dict[str, Any]:
        """
        Submit a list of generated readings to the backend API.
        """
        endpoint = f"{api_base_url.rstrip('/')}/api/devices/{self.device_id}/metrics"
        success_count = 0
        failed_count = 0
        errors = []

        for reading in readings:
            req_data = json.dumps(reading).encode("utf-8")
            req = urllib.request.Request(
                endpoint,
                data=req_data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=timeout) as response:
                    if response.status == 201:
                        success_count += 1
                    else:
                        failed_count += 1
                        errors.append(f"Unexpected status: {response.status}")
            except urllib.error.HTTPError as err:
                failed_count += 1
                try:
                    err_body = err.read().decode("utf-8")
                except Exception:
                    err_body = ""
                errors.append(f"HTTP {err.code}: {err_body}")
            except Exception as ex:
                failed_count += 1
                errors.append(str(ex))

        return {
            "device_id": self.device_id,
            "total_submitted": len(readings),
            "success_count": success_count,
            "failed_count": failed_count,
            "errors": errors[:5],  # Cap to first 5 errors to avoid flooding
        }

    def stream_loop(
        self,
        scenario: str = "normal",
        interval: float = 5.0,
        api_base_url: str = "http://127.0.0.1:8000",
        cycle_length: int = 20,
        max_cycles: Optional[int] = None,
    ) -> None:
        """
        Continuously generates and submits telemetry readings in an ongoing loop.
        Stops cleanly on KeyboardInterrupt without a traceback.
        """
        cycle = 0
        print(f"[LOOP] Starting continuous telemetry streaming for Device ID {self.device_id}...", flush=True)
        print(f"[LOOP] Scenario: '{scenario}' | Interval: {interval}s | Target API: {api_base_url}", flush=True)
        print("[LOOP] Press Ctrl+C to stop streaming.\n", flush=True)

        try:
            while max_cycles is None or cycle < max_cycles:
                step_in_cycle = cycle % cycle_length
                reading = self.generate_reading(
                    scenario=scenario,
                    step_index=step_in_cycle,
                    total_steps=cycle_length,
                    timestamp=datetime.now(timezone.utc),
                )
                cycle += 1

                sub_res = self.submit_readings([reading], api_base_url=api_base_url)
                is_success = sub_res["success_count"] == 1
                status_text = "SUCCESS" if is_success else f"FAILED ({sub_res['errors'][0] if sub_res['errors'] else 'Error'})"
                time_str = datetime.now().strftime("%H:%M:%S")

                print(
                    f"[LOOP] [#{cycle}] [{time_str}] Device {self.device_id} | "
                    f"Scenario: '{scenario}' | CPU: {reading['cpu_utilization']}% | "
                    f"Mem: {reading['memory_usage']}% | Latency: {reading['latency']}ms | "
                    f"Loss: {reading['packet_loss']}% | Status: {reading['device_status']} -> {status_text}",
                    flush=True,
                )

                if max_cycles is None or cycle < max_cycles:
                    time.sleep(interval)
        except KeyboardInterrupt:
            print("\n[LOOP] Streaming stopped cleanly by user (Ctrl+C).", flush=True)
            sys.exit(0)


def run_cli():
    parser = argparse.ArgumentParser(
        description="Network Device Monitoring Simulator (Virtual / Simulated Stream)"
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Continuously generate and submit telemetry in an ongoing loop",
    )
    parser.add_argument(
        "--device-id",
        type=int,
        default=1,
        help="Target device ID registered in the monitoring system",
    )
    parser.add_argument(
        "--scenario",
        type=str,
        default="normal",
        choices=NetworkDeviceSimulator.AVAILABLE_SCENARIOS,
        help="Operational condition scenario to simulate",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=5,
        help="Number of telemetry readings to generate in one-shot mode",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=5.0,
        help="Seconds interval between readings (default: 5.0)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Optional random seed for reproducible metric streams",
    )
    parser.add_argument(
        "--api-url",
        type=str,
        default="http://127.0.0.1:8000",
        help="FastAPI backend base URL",
    )
    parser.add_argument(
        "--submit",
        action="store_true",
        help="Submit generated readings to the backend API via HTTP POST (in one-shot mode)",
    )

    args = parser.parse_args()

    simulator = NetworkDeviceSimulator(device_id=args.device_id, seed=args.seed)

    if args.loop:
        simulator.stream_loop(
            scenario=args.scenario,
            interval=args.interval,
            api_base_url=args.api_url,
        )
        return

    print(f"[SIMULATOR] Generating {args.count} readings for Device ID {args.device_id}...")
    print(f"[SIMULATOR] Scenario: '{args.scenario}' (Interval: {args.interval}s)")

    readings = simulator.generate_scenario(
        scenario=args.scenario,
        count=args.count,
        interval_seconds=args.interval,
    )

    print("\n--- SAMPLE GENERATED METRICS (First 3) ---")
    for r in readings[:3]:
        print(f"  [{r['timestamp']}] CPU: {r['cpu_utilization']}% | Mem: {r['memory_usage']}% | Latency: {r['latency']}ms | Loss: {r['packet_loss']}% | Status: {r['device_status']}")

    if args.submit:
        print(f"\n[SIMULATOR] Submitting readings to {args.api_url}/api/devices/{args.device_id}/metrics...")
        results = simulator.submit_readings(readings, api_base_url=args.api_url)
        print(f"[SIMULATOR] Results: {results['success_count']} succeeded, {results['failed_count']} failed.")
        if results["errors"]:
            print(f"[SIMULATOR] Errors: {results['errors']}")
    else:
        print("\n[SIMULATOR] Dry-run complete. Use '--submit' flag to send readings to the API.")


if __name__ == "__main__":
    run_cli()
