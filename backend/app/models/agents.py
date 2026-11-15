"""Pydantic data models and schemas for FieldShift AI Multi-Agent Orchestration."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

from app.models.ai import AiLocationContext


class AgentIntent(str, Enum):
    """Categorization of user queries for optimal execution routing."""

    CLIMATE_ONLY = "climate_only"
    SOIL_ONLY = "soil_only"
    AGRONOMY_ADVISORY = "agronomy_advisory"
    SIMULATION_ASSIST = "simulation_assist"
    GENERAL_CHAT = "general_chat"


class AgentRole(str, Enum):
    """Defined expert roles in the multi-agent tribunal and execution pipeline."""

    SUPERVISOR = "supervisor"
    CLIMATE_SPECIALIST = "climate_specialist"
    SOIL_SPECIALIST = "soil_specialist"
    AGRONOMIST = "agronomist"
    GUARDRAIL_SENTINEL = "guardrail_sentinel"
    LOCALIZER = "localizer"


class AgentStreamEvent(BaseModel):
    """Real-time SSE event emitted to the frontend during multi-agent reasoning."""

    model_config = ConfigDict(extra="ignore")

    event: Literal["agent_start", "agent_progress", "agent_done", "evidence_cited", "guardrail_check", "complete", "error"]
    agent_id: str
    agent_name: str
    avatar: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: str | None = None


class ClimateSpecialistReport(BaseModel):
    """Evaluated atmospheric metrics from NASA POWER observations."""

    model_config = ConfigDict(extra="ignore")

    status: Literal["success", "partial", "unavailable"] = "success"
    summary: str
    mean_temp_c: float | None = None
    min_temp_c: float | None = None
    max_temp_c: float | None = None
    total_precip_mm: float | None = None
    dry_days_count: int | None = None
    hot_days_count: int | None = None
    frost_days_count: int | None = None
    relative_humidity_pct: float | None = None
    hazard_flags: list[str] = Field(default_factory=list)
    key_evidence: list[str] = Field(default_factory=list)


class SoilSpecialistReport(BaseModel):
    """Evaluated root-zone hydrological metrics from NASA SMAP Level-4 satellite radar."""

    model_config = ConfigDict(extra="ignore")

    status: Literal["success", "partial", "unavailable"] = "success"
    summary: str
    sm_rootzone: float | None = None
    sm_surface: float | None = None
    drought_pctl: float | None = None
    soil_temp_layer1: float | None = None
    available_water_capacity_mm: float | None = None
    wilting_point_buffer_mm: float | None = None
    hydration_status: str = "adequate"  # dry, stress, adequate, saturated
    key_evidence: list[str] = Field(default_factory=list)


class AgronomySpecialistReport(BaseModel):
    """Practical field advisories, FAO-56 crop mechanics, and rotation strategies."""

    model_config = ConfigDict(extra="ignore")

    status: Literal["success", "partial", "unavailable"] = "success"
    summary: str
    recommended_crops: list[str] = Field(default_factory=list)
    irrigation_strategy: str = "bour_rainfed"
    irrigation_advice: str = ""
    sowing_window_assessment: str = ""
    soil_conservation_tactics: list[str] = Field(default_factory=list)
    disease_and_pest_warnings: list[str] = Field(default_factory=list)
    key_evidence: list[str] = Field(default_factory=list)


class GuardrailAuditReport(BaseModel):
    """Deterministic validation results checking specialist assertions against raw NASA truth."""

    model_config = ConfigDict(extra="ignore")

    validation_status: Literal["validated", "adjusted", "flagged"] = "validated"
    passed: bool = True
    claims_verified_count: int = 0
    discrepancies_detected: list[str] = Field(default_factory=list)
    critique_feedback: str | None = None
    disclaimers_enforced: list[str] = Field(default_factory=list)
    audited_evidence: dict[str, Any] = Field(default_factory=dict)


class AgentContext(BaseModel):
    """Shared state container flowing through the orchestrator execution graph."""

    model_config = ConfigDict(extra="ignore")

    user_query: str
    location: AiLocationContext
    year: int = 2025
    requested_language: str = "auto"
    detected_language: str = "darija"
    ground_truth_dossier: dict[str, Any] = Field(default_factory=dict)
    
    # Intermediate specialist outputs
    climate_report: ClimateSpecialistReport | None = None
    soil_report: SoilSpecialistReport | None = None
    agronomy_report: AgronomySpecialistReport | None = None
    guardrail_report: GuardrailAuditReport | None = None

    # Reflection and Critique Loop
    critique: str | None = None
    revision_count: int = 0
    
    # Trace & Metadata
    specialists_consulted: list[str] = Field(default_factory=list)
    execution_timeline: list[dict[str, Any]] = Field(default_factory=list)
