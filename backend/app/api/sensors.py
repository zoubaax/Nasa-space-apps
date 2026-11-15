"""FastAPI router for In-Situ Soil Sensors (ESP32 Capacitive v1.2 on GPIO34)."""

from __future__ import annotations

import logging
from typing import Any
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_sensor_service
from app.models.climate import ErrorResponse
from app.models.sensor import (
    Esp32SoilPayload,
    SensorSimulationTrigger,
    SensorTelemetryData,
)
from app.services.sensor_service import SensorService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sensors", tags=["sensors"])

_ERROR_RESPONSES = {
    400: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
}


@router.post(
    "/soil-moisture",
    response_model=SensorTelemetryData,
    responses=_ERROR_RESPONSES,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest ESP32 Soil Sensor Telemetry",
    description=(
        "Endpoint for ESP32 nodes transmitting 12-bit ADC raw soil moisture "
        "from Capacitive Soil Moisture Sensor v1.2 on GPIO34 over Wi-Fi."
    ),
)
async def ingest_soil_moisture(
    payload: Esp32SoilPayload,
    service: SensorService = Depends(get_sensor_service),
) -> SensorTelemetryData:
    logger.info(
        "[Sensor Ingest] Node %s Pin GPIO%s: raw ADC %s",
        payload.device_id,
        payload.gpio_pin,
        payload.adc_raw,
    )
    return service.record_payload(payload)


@router.get(
    "/soil-moisture/latest",
    response_model=SensorTelemetryData,
    responses=_ERROR_RESPONSES,
    summary="Get Latest In-Situ Soil Telemetry",
    description="Returns the latest verified or virtual in-situ soil reading with SMAP L4 fusion delta.",
)
async def get_latest_soil_moisture(
    smap_rootzone: float | None = Query(default=None, description="Optional SMAP L4 root-zone baseline for delta fusion"),
    service: SensorService = Depends(get_sensor_service),
) -> SensorTelemetryData:
    return service.get_latest_telemetry(smap_rootzone_m3_m3=smap_rootzone)


@router.post(
    "/simulate",
    response_model=SensorTelemetryData,
    responses=_ERROR_RESPONSES,
    summary="Virtual Sensor Edge Simulation Trigger",
    description="Simulates field events in software: irrigation event, dry spell, or reset to optimal.",
)
async def trigger_sensor_simulation(
    trigger: SensorSimulationTrigger,
    service: SensorService = Depends(get_sensor_service),
) -> SensorTelemetryData:
    logger.info("[Sensor Simulation] Trigger action: %s", trigger.action)
    return service.trigger_simulation(trigger)


@router.post(
    "/edge-broadcast/start",
    responses=_ERROR_RESPONSES,
    summary="Start Virtual ESP32 Edge Telemetry Broadcast",
    description="Starts a background task continuously transmitting simulated ESP32 packets to trigger auto-detection.",
)
def start_edge_broadcast(
    service: SensorService = Depends(get_sensor_service),
) -> dict[str, Any]:
    service.start_edge_broadcast(interval_seconds=4.0)
    return {"status": "broadcasting", "is_broadcasting": True}


@router.post(
    "/edge-broadcast/stop",
    responses=_ERROR_RESPONSES,
    summary="Stop Virtual ESP32 Edge Telemetry Broadcast",
    description="Stops the background virtual edge broadcast.",
)
def stop_edge_broadcast(
    service: SensorService = Depends(get_sensor_service),
) -> dict[str, Any]:
    service.stop_edge_broadcast()
    return {"status": "stopped", "is_broadcasting": False}


@router.get(
    "/edge-broadcast/status",
    responses=_ERROR_RESPONSES,
    summary="Get Edge Broadcast Status",
)
def get_edge_broadcast_status(
    service: SensorService = Depends(get_sensor_service),
) -> dict[str, Any]:
    return {"is_broadcasting": service.is_broadcasting()}
