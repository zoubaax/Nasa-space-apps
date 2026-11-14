"""Ground-truth data aggregation for FieldShift AI from existing backend services.

Consumes real JSON outputs from:
- NASA SMAP Level-4 GEE Service (`SmapGeeService`)
- NASA POWER Daily Climate Service (`ClimateDataService`)
- FieldShift Agro Recommendation Engine (`app.services.agro.advise`)
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from app.models.ai import AiChatRequest
from app.services.agro import advise as agro_advise
from app.services.climate_service import ClimateDataService, ClimateRequest
from app.services.smap_dictionary import get_variable_metadata
from app.services.smap_gee import SmapGeeRequest, SmapGeeService

logger = logging.getLogger(__name__)


class AiContextBuilder:
    """Aggregates real data from existing platform services without modifying their calculations."""

    def __init__(
        self,
        climate_service: ClimateDataService,
        smap_gee_service: SmapGeeService,
    ) -> None:
        self._climate = climate_service
        self._smap = smap_gee_service

    async def build_ground_truth_dossier(self, request: AiChatRequest) -> dict[str, Any]:
        """Fetch and structure real evidence from NASA POWER, SMAP L4, and Agro Engine."""
        loc_name = request.location.name
        lat = round(request.location.latitude, 4)
        lon = round(request.location.longitude, 4)
        year = request.year

        start_date = request.start_date or date(year, 1, 1)
        end_date = request.end_date or date(year, 12, 31)

        sources_used: list[str] = []
        evidence: dict[str, Any] = {
            "location": {"name": loc_name, "latitude": lat, "longitude": lon},
            "period": {"year": year, "start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
            "smap_l4": {},
            "nasa_power": {},
            "agro_recommendations": {},
            "focused_element": {},
            "missing_data": [],
        }

        # 1. Gather NASA SMAP Level-4 Satellite Data
        try:
            smap_req = SmapGeeRequest(
                latitude=lat,
                longitude=lon,
                city=loc_name,
                start_date=start_date,
                end_date=end_date,
                mode=request.mode,
                scale=11000,
                refresh=False,
                include_3hourly=False,
            )
            smap_resp = await self._smap.get_timeseries(smap_req)
            sources_used.append("NASA SMAP Level-4 SPL4SMGP V008 (~9-11 km)")

            # Extract annual averages and key cards
            annual_map = {item.variable_id: item for item in smap_resp.annual_summary}
            cards_map = {card.id: card for card in smap_resp.summary_cards}

            evidence["smap_l4"] = {
                "dataset": smap_resp.dataset,
                "cached": smap_resp.cached,
                "spatial_scale": "EASE-Grid 2.0 (~9-11 km)",
                "observation_count": sum(m.observation_count for m in smap_resp.monthly_series),
                "annual_metrics": {
                    var_id: {
                        "name_fr": item.name_fr,
                        "mean": item.mean,
                        "min": item.min,
                        "max": item.max,
                        "unit": item.display_unit,
                        "trend": item.seasonal_trend,
                    }
                    for var_id, item in annual_map.items()
                },
                "monthly_evolution": [
                    {
                        "month": m.month_name,
                        "obs_count": m.observation_count,
                        "sm_surface": m.display_values.get("sm_surface"),
                        "sm_rootzone": m.display_values.get("sm_rootzone"),
                        "sm_profile": m.display_values.get("sm_profile"),
                        "sm_rootzone_wetness": m.display_values.get("sm_rootzone_wetness"),
                        "sm_rootzone_pctl": m.display_values.get("sm_rootzone_pctl"),
                        "soil_temp_layer1": m.display_values.get("soil_temp_layer1"),
                        "evapotranspiration": m.display_values.get("land_evapotranspiration_flux") or m.display_values.get("evapotranspiration"),
                        "infiltration": m.display_values.get("soil_water_infiltration_flux") or m.display_values.get("infiltration"),
                    }
                    for m in smap_resp.monthly_series
                ],
                "latest_month_cards": {
                    c.id: {
                        "title": c.title,
                        "value": c.value,
                        "unit": c.display_unit,
                        "period": c.period,
                        "tone": c.status_tone,
                        "change_vs_prev_pct": c.change_vs_previous_month_pct,
                    }
                    for c in smap_resp.summary_cards[:16]
                },
            }
        except Exception as e:
            logger.warning("SMAP evidence gathering failed: %s", e)
            evidence["missing_data"].append(f"SMAP L4 indisponible pour cette période: {e}")

        # 2. Gather NASA POWER Climate Data & Agro Recommendations
        try:
            power_query = ClimateRequest(
                city=loc_name,
                latitude=lat,
                longitude=lon,
                start_date=start_date,
                end_date=end_date,
                refresh=False,
            )
            power_summary = await self._climate.get_summary(power_query)
            sources_used.append("NASA POWER Daily Agroclimatology (AG Community)")

            ind = power_summary.indicators
            evidence["nasa_power"] = {
                "source": power_summary.source,
                "cached": power_summary.cached,
                "mean_temperature_c": ind.average_temperature,
                "max_temperature_c": ind.maximum_temperature,
                "min_temperature_c": ind.minimum_temperature,
                "total_precipitation_mm": ind.total_precipitation,
                "dry_days_count": ind.dry_days,
                "hot_days_count": ind.hot_days,
                "frost_days_count": ind.cold_days,
                "relative_humidity_pct": ind.average_relative_humidity,
                "wind_speed_ms": ind.average_wind_speed,
                "solar_radiation_mj": ind.average_solar_radiation,
            }

            # 3. Apply FieldShift Agro Decision Engine
            try:
                agro_resp = agro_advise(power_summary)
                sources_used.append("FieldShift Agro Recommendation Engine")
                evidence["agro_recommendations"] = {
                    "water_stress_status": agro_resp.recommendations[0].status if len(agro_resp.recommendations) > 0 else "inconnu",
                    "water_rule_observed": agro_resp.recommendations[0].observed if len(agro_resp.recommendations) > 0 else "",
                    "water_message": agro_resp.recommendations[0].message if len(agro_resp.recommendations) > 0 else "",
                    "heat_status": agro_resp.recommendations[1].status if len(agro_resp.recommendations) > 1 else "",
                    "heat_message": agro_resp.recommendations[1].message if len(agro_resp.recommendations) > 1 else "",
                    "rotation_recommendations": [
                        {"order": r.order, "action": r.action}
                        for r in agro_resp.rotation
                    ],
                }
            except Exception as e_agro:
                logger.warning("Agro advise calculation failed: %s", e_agro)
        except Exception as e:
            logger.warning("NASA POWER evidence gathering failed: %s", e)
            evidence["missing_data"].append(f"NASA POWER climatologie indisponible pour cette période: {e}")

        # 4. Handle Specific Chart / Variable Focus if requested
        if request.variable_id:
            meta = get_variable_metadata(request.variable_id)
            if meta:
                evidence["focused_element"] = {
                    "type": "variable",
                    "id": meta.id,
                    "name_fr": meta.name_fr,
                    "name_en": meta.name_en,
                    "unit": meta.display_unit,
                    "category": meta.category,
                    "darija_what": meta.darija_what,
                    "darija_why": meta.darija_why_agri,
                    "darija_unit": meta.darija_unit,
                }
        elif request.chart_id:
            evidence["focused_element"] = {
                "type": "chart",
                "id": request.chart_id,
                "description": self._describe_chart(request.chart_id),
            }

        evidence["sources_used"] = sources_used
        return evidence

    @staticmethod
    def _describe_chart(chart_id: str) -> str:
        descriptions = {
            "moisture": "Graphique d'évolution mensuelle de l'humidité du sol : compare la surface (0-5 cm), la zone racinaire (0-100 cm) et le profil total.",
            "drought": "Graphique des percentiles de sécheresse racinaire (sm_rootzone_pctl) et degré de saturation du sol (sm_rootzone_wetness).",
            "temperature": "Profil thermique du sol multicouches : surface, couche 1 (0-10 cm), couche 2 (10-20 cm), couche 3 (20-40 cm), couche 4 (40-100 cm), et bedrock.",
            "water": "Bilan hydrique mensuel : compare la demande évaporatoire (ET en mm/j), l'eau infiltrée (infiltration) et le ruissellement.",
            "cross": "Comparateur croisé bi-variable dynamique avec deux axes Y indépendants.",
        }
        return descriptions.get(chart_id, f"Graphique interactif {chart_id}")
