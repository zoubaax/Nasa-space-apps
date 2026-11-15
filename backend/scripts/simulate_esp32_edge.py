"""Standalone edge simulation script mimicking a physical ESP32 microcontroller node.

Transmits realistic Capacitive Soil Moisture Sensor v1.2 packets from GPIO34
to FieldShift's FastAPI backend over HTTP POST.
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from datetime import datetime, timezone

try:
    import httpx
except ImportError:
    import urllib.request
    import json
    httpx = None


def run_transmitter(server_url: str = "http://127.0.0.1:8000", interval: float = 4.0) -> None:
    endpoint = f"{server_url.rstrip('/')}/api/sensors/soil-moisture"
    print("=" * 70)
    print("📡 FieldShift AI: ESP32 Edge Soil Probe Simulator")
    print(f"Target Gateway: {endpoint}")
    print(f"Hardware Model: ESP32 Node #1 | Sensor: Capacitive Soil Moisture v1.2 (GPIO34)")
    print(f"Transmission Frequency: Every {interval} seconds")
    print("Press Ctrl+C to disconnect edge node and trigger auto-standby.")
    print("=" * 70)

    seq = 1
    baseline_adc = 2240

    while True:
        try:
            now = datetime.now(timezone.utc)
            hour = now.hour + (now.minute / 60.0)
            
            # Simulate natural diurnal soil temperature
            temp = round(18.0 + 4.5 * math.sin((hour - 9) * (math.pi / 12.0)), 1)
            # Subtle natural noise
            jitter = int(12 * math.sin(time.time() / 2.5))
            adc = max(1300, min(3500, baseline_adc + jitter))

            payload = {
                "device_id": "esp32-field-node-01",
                "boot_id": "boot-a1b2c3d4",
                "seq": seq,
                "gpio_pin": 34,
                "adc_raw": adc,
                "battery_mv": 3310,
                "soil_temp_c": temp,
                "rssi_dbm": -62,
                "timestamp": now.isoformat(),
            }

            if httpx is not None:
                with httpx.Client(timeout=5.0) as client:
                    resp = client.post(endpoint, json=payload)
                    code = resp.status_code
                    data = resp.json()
            else:
                req = urllib.request.Request(
                    endpoint,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=5.0) as response:
                    code = response.status
                    data = json.loads(response.read().decode("utf-8"))

            vwc = data.get("vwc_m3_m3", 0.0)
            verdict = data.get("hydration_verdict_en", "")
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Packet #{seq:03d} -> Status {code} | GPIO34 ADC: {adc} | VWC: {vwc} m³/m³ | {verdict}")

            seq += 1
            time.sleep(interval)
        except KeyboardInterrupt:
            print("\n🛑 Edge node disconnected. Transmitting stopped.")
            break
        except Exception as exc:
            print(f"⚠️ Transmission error (retrying in {interval}s): {exc}")
            time.sleep(interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ESP32 Virtual Edge Transmitter")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Base backend URL")
    parser.add_argument("--interval", type=float, default=4.0, help="Transmission interval in seconds")
    args = parser.parse_args()
    run_transmitter(server_url=args.url, interval=args.interval)
