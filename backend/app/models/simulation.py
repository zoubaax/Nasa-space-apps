"""Pydantic models for the Virtual Agricultural Laboratory & Simulation Engine."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, ConfigDict, Field

from app.models.ai import AiLocationContext


class SimulationPlan(BaseModel):
    """Evaluation metrics for one simulated crop rotation strategy."""

    model_config = ConfigDict(extra="ignore")

    id: str
    name_fr: str
    name_ar: str
    rotation_sequence: list[str]
    water_need_mm: float
    water_deficit_mm: float
    water_stress_risk_pct: float
    soil_health_score: float
    resilience_score: float
    budget_fit_score: float
    yield_stability_score: float
    status_tag: str
    summary_darija: str
    pros: list[str]
    cons: list[str]
    rotation_years: list[dict[str, Any]] = Field(default_factory=list)


class TribunalAgentVerdict(BaseModel):
    """Verdict from one expert persona in the AI Scientific Tribunal."""

    model_config = ConfigDict(extra="ignore")

    agent_role: str
    agent_name: str
    avatar: str
    stance: str  # "favorable" | "reserve" | "defavorable"
    argument_darija: str
    key_evidence: str


class SimulationRequest(BaseModel):
    """Farmer configuration inputs for the virtual agricultural laboratory."""

    model_config = ConfigDict(extra="ignore")

    location: AiLocationContext
    year: int = 2025
    soil_type: str = Field(default="limoneux_profond")  # argileux_lourd, limoneux_profond, sableux, calcaire
    water_access: str = Field(default="appoint")  # bour, appoint, irrigue
    budget: str = Field(default="moyen")  # faible, moyen, eleve
    climate_shock: str = Field(default="none")  # none, drought, heatwave, delayed_rain
    historical_compare_year: int | None = None
    target_crops: list[str] = Field(default_factory=list)


class SimulationResponse(BaseModel):
    """Complete output of the Virtual Agricultural Laboratory."""

    model_config = ConfigDict(extra="ignore")

    location_name: str
    year: int
    soil_type: str
    soil_type_label: str
    water_access: str
    water_access_label: str
    budget: str
    shock_applied: str
    shock_label: str
    baseline_metrics: dict[str, Any]
    plans: list[SimulationPlan]
    winner_plan_id: str
    tribunal_verdicts: list[TribunalAgentVerdict]
    overall_synthesis_darija: str
    radar_dimensions: list[str]
    sources_used: list[str]
    validation_metadata: dict[str, Any] = Field(default_factory=dict)
