"""FastAPI router for Agro-Climatic AI Intelligence."""

from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse

from app.api.deps import get_ai_service, get_simulation_service
from app.models.ai import AiChatRequest, AiChatResponse, AiHealthStatus
from app.models.climate import ErrorResponse
from app.models.simulation import SimulationRequest, SimulationResponse
from app.services.agri_simulation import AgriSimulationService
from app.services.ai_service import AiService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai"])
si_router = APIRouter(prefix="/api/si", tags=["si"])

_ERROR_RESPONSES = {
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
    504: {"model": ErrorResponse},
}


@router.post(
    "/chat",
    response_model=AiChatResponse,
    responses=_ERROR_RESPONSES,
    status_code=status.HTTP_200_OK,
    summary="Agro-Climatic Intelligence Chat",
    description=(
        "Ask questions in Moroccan Darija, French, or English. "
        "Consumes real data from NASA POWER and SMAP L4, runs specialized Climate, Soil, "
        "and Crop workflows, validates claims, and returns an evidence-backed answer."
    ),
)
async def chat_endpoint(
    request: AiChatRequest,
    service: AiService = Depends(get_ai_service),
) -> AiChatResponse:
    return await service.chat(request)


@router.post(
    "/chat/stream",
    responses=_ERROR_RESPONSES,
    summary="Streaming AI Chat (SSE)",
    description="Streams the AI response chunk by chunk with metadata events.",
)
async def chat_stream_endpoint(
    request: AiChatRequest,
    service: AiService = Depends(get_ai_service),
) -> StreamingResponse:
    generator = service.stream_chat(request)
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/health",
    response_model=AiHealthStatus,
    responses=_ERROR_RESPONSES,
    summary="AI Intelligence Health Status",
)
def ai_health(
    service: AiService = Depends(get_ai_service),
) -> AiHealthStatus:
    is_cfg = service.is_configured()
    return AiHealthStatus(
        status="ready" if is_cfg else "offline_rule_engine",
        model=service._model,
        api_configured=is_cfg,
        base_url=service._base_url,
        services_connected=[
            "NASA SMAP Level-4 SPL4SMGP V008 (Google Earth Engine)",
            "NASA POWER Daily Agroclimatology API",
            "FieldShift Agro Recommendation Engine",
            "FieldShift Virtual Agricultural Laboratory Engine",
        ],
    )


@router.post(
    "/simulate",
    response_model=SimulationResponse,
    responses=_ERROR_RESPONSES,
    status_code=status.HTTP_200_OK,
    summary="Virtual Agricultural Laboratory Simulation",
    description=(
        "Executes a multi-plan digital twin simulation: Crop Battle Lab, Climate Attack stress testing, "
        "Farm Time Machine, and AI Scientific Tribunal evaluations based on real NASA SMAP & POWER observations."
    ),
)
async def simulate_endpoint(
    request: SimulationRequest,
    sim_service: AgriSimulationService = Depends(get_simulation_service),
) -> SimulationResponse:
    return await sim_service.run_simulation(request)


# Register identical endpoints under /api/si (Super Intelligence)
si_router.add_api_route("/chat", chat_endpoint, methods=["POST"], response_model=AiChatResponse, responses=_ERROR_RESPONSES)
si_router.add_api_route("/chat/stream", chat_stream_endpoint, methods=["POST"], responses=_ERROR_RESPONSES)
si_router.add_api_route("/health", ai_health, methods=["GET"], response_model=AiHealthStatus, responses=_ERROR_RESPONSES)
si_router.add_api_route("/simulate", simulate_endpoint, methods=["POST"], response_model=SimulationResponse, responses=_ERROR_RESPONSES)


