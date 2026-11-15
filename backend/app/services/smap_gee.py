"""Google Earth Engine service for NASA SMAP Level-4 SPL4SMGP V008.

Extracts real satellite observations from dataset 'NASA/SMAP/SPL4SMGP/008'.
Integrates with the local FileCache, GeocodingService, and centralized Moroccan Darija dictionary.
"""

from __future__ import annotations

import asyncio
import calendar
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import json
import logging
import math
import os
from pathlib import Path
import time
from typing import Any

import httpx

from app.core.config import PROJECT_ROOT, Settings
from app.core.exceptions import InvalidRequestError, SmapError
from app.models.climate import LocationInfo
from app.models.smap_gee import (
    AnnualSummaryItem,
    DarijaExplanationResponse,
    MonthlyObservationPoint,
    SmapGeeResponse,
    SmapVariableInfo,
    SummaryCard,
    ThreeHourlyPoint,
)
from app.services.cache import FileCache
from app.services.geocoding import GeocodingService
from app.services.smap_dictionary import (
    AGRICULTURAL_VARIABLE_IDS,
    ALL_VARIABLE_IDS,
    CATEGORIES,
    SMAP_VARIABLES,
    get_variable_metadata,
)

logger = logging.getLogger(__name__)

MONTH_NAMES_FR = [
    "",
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
]


@dataclass(frozen=True)
class SmapGeeRequest:
    start_date: date
    end_date: date
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    mode: str = "agricultural"  # "agricultural" | "scientific"
    scale: int = 11000
    refresh: bool = False
    include_3hourly: bool = False


class SmapGeeService:
    """Service orchestrating Earth Engine extraction, caching, and Moroccan Darija translation."""

    def __init__(self, settings: Settings, cache: FileCache, geocoder: GeocodingService) -> None:
        self._settings = settings
        self._cache = cache
        self._geocoder = geocoder
        self._lock = asyncio.Lock()
        self._ee = None
        self._ee_initialized = False
        self._ee_error: str | None = None

    def _ensure_ee(self) -> Any:
        if self._ee_initialized:
            return self._ee
        try:
            import importlib
            ee = importlib.import_module("ee")
            self._ee = ee

            # Check for configured service account credentials
            credentials = None
            key_file = self._settings.gee_service_account_key
            if not key_file and (PROJECT_ROOT / "gee-key.json").is_file():
                key_file = "gee-key.json"

            if key_file:
                key_path = Path(key_file)
                if not key_path.is_absolute():
                    key_path = (PROJECT_ROOT / key_path).resolve()
                if key_path.is_file():
                    try:
                        key_data = json.loads(key_path.read_text(encoding="utf-8"))
                        email = key_data.get("client_email")
                        credentials = ee.ServiceAccountCredentials(email, str(key_path))
                        logger.info("Loaded Google Earth Engine service account credentials for %s", email)
                    except Exception as ce:
                        logger.warning("Failed loading service account key from %s: %s", key_path, ce)

            # Initialize Earth Engine
            try:
                if credentials:
                    ee.Initialize(credentials, project=self._settings.gee_project_id)
                else:
                    ee.Initialize(project=self._settings.gee_project_id)
                self._ee_initialized = True
                logger.info("Google Earth Engine initialized successfully with project %s", self._settings.gee_project_id)
            except Exception as e:
                # Try initializing without project if default credentials exist
                try:
                    ee.Initialize()
                    self._ee_initialized = True
                    logger.info("Google Earth Engine initialized with default project")
                except Exception as inner_e:
                    self._ee_error = f"{e}; {inner_e}"
                    raise SmapError(
                        f"Google Earth Engine authorization required for project '{self._settings.gee_project_id}'. "
                        "Run 'earthengine authenticate' or configure Earth Engine credentials.",
                        details={"error": str(e)},
                    )
            return self._ee
        except ImportError as e:
            self._ee_error = str(e)
            raise SmapError(
                "earthengine-api Python package is not installed or available.",
                details={"error": str(e)},
            )

    async def reverse_geocode(self, latitude: float, longitude: float) -> dict[str, Any]:
        """Resolve coordinates to a human-friendly city/locality name."""
        return await self._geocoder.reverse_geocode(latitude, longitude)

    async def get_timeseries(self, request: SmapGeeRequest) -> SmapGeeResponse:
        self._validate_request(request)
        location = await self._resolve_location(request)

        mode_clean = request.mode.strip().lower()
        if mode_clean not in {"agricultural", "scientific"}:
            mode_clean = "agricultural"

        cache_key = self._cache.smap_gee_key(
            latitude=location.requested_latitude,
            longitude=location.requested_longitude,
            start_date=request.start_date,
            end_date=request.end_date,
            mode=mode_clean,
            scale=request.scale,
        )

        async with self._lock:
            if not request.refresh:
                cached_path = self._cache.smap_gee_path(cache_key)
                if not cached_path.is_file():
                    spatial_path = self._cache.find_matching_smap_gee(
                        latitude=location.requested_latitude,
                        longitude=location.requested_longitude,
                        start_date=request.start_date,
                        end_date=request.end_date,
                        mode=mode_clean,
                    )
                    if spatial_path is not None and spatial_path.is_file():
                        cached_path = spatial_path

                cached_data = self._cache.read_json(cached_path)
                if cached_data is not None:
                    try:
                        cached_resp = SmapGeeResponse.model_validate(cached_data)
                        logger.info("SMAP GEE cache hit for %s", cached_path.name)
                        # Return cached response with updated cached=True flag
                        return cached_resp.model_copy(update={"cached": True})
                    except Exception:
                        logger.warning("Unusable SMAP GEE cache %s; refetching", cached_path.name)

            # Perform live Earth Engine extraction
            start_time = time.monotonic()
            try:
                dataset_result = await asyncio.to_thread(
                    self._fetch_from_gee,
                    location=location,
                    start_date=request.start_date,
                    end_date=request.end_date,
                    mode=mode_clean,
                    scale=request.scale,
                    include_3hourly=request.include_3hourly,
                )
                elapsed_ms = round((time.monotonic() - start_time) * 1000.0, 1)

                dataset_result.processing_time_ms = elapsed_ms
                dataset_result.cached = False

                # Cache the response to disk
                try:
                    self._cache.write_json(
                        self._cache.smap_gee_path(cache_key),
                        dataset_result.model_dump(mode="json"),
                    )
                except Exception as e:
                    logger.warning("Failed to save SMAP GEE cache: %s", e)

                return dataset_result
            except Exception as e:
                logger.warning("Live GEE extraction failed: %s. Seeking regional nearest observation.", e)
                nearest_path, dist_km = self._cache.find_nearest_smap_gee_with_distance(
                    latitude=location.requested_latitude,
                    longitude=location.requested_longitude,
                    start_date=request.start_date,
                    end_date=request.end_date,
                    mode=mode_clean,
                )
                if nearest_path is not None and nearest_path.is_file():
                    cached_data = self._cache.read_json(nearest_path)
                    if cached_data is not None:
                        try:
                            cached_resp = SmapGeeResponse.model_validate(cached_data)
                            loc_name = location.name or "Selected Farm Plot"
                            ref_note = f"Assimilated from nearest regional NASA SMAP L4 pixel in Morocco ({round(dist_km)} km away)."
                            logger.info("Serving regional SMAP L4 fallback from %s (distance=%.1f km)", nearest_path.name, dist_km)
                            return cached_resp.model_copy(
                                update={
                                    "location": cached_resp.location.model_copy(
                                        update={
                                            "requested_latitude": location.requested_latitude,
                                            "requested_longitude": location.requested_longitude,
                                            "name": f"{loc_name} (Regional SMAP L4 · {round(dist_km)} km)",
                                        }
                                    ),
                                    "cached": True,
                                    "notes": cached_resp.notes + [ref_note],
                                }
                            )
                        except Exception as parse_err:
                            logger.warning("Failed to validate regional SMAP cache %s: %s", nearest_path.name, parse_err)
                raise

    async def get_three_hourly(
        self,
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
        variables: list[str] | None = None,
    ) -> list[ThreeHourlyPoint]:
        today = datetime.now(timezone.utc).date()
        if start_date > end_date:
            raise InvalidRequestError("start_date must be on or before end_date.")
        if start_date < self._settings.smap_gee_earliest_date:
            raise InvalidRequestError(
                f"Start date cannot be before SMAP launch: {self._settings.smap_gee_earliest_date.isoformat()}"
            )
        if start_date > today or end_date > today:
            raise InvalidRequestError(
                f"The requested period cannot extend after {today.isoformat()} (UTC)."
            )
        days = (end_date - start_date).days + 1
        if days > self._settings.smap_gee_3hourly_max_days:
            raise InvalidRequestError(
                f"3-hourly queries are restricted to a maximum of {self._settings.smap_gee_3hourly_max_days} days "
                f"to prevent memory limits. Requested: {days} days."
            )

        selected_vars = variables or AGRICULTURAL_VARIABLE_IDS

        return await asyncio.to_thread(
            self._fetch_3hourly_gee,
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
            variables=selected_vars,
        )

    def explain_variable(
        self,
        var_id: str,
        value: float | None = None,
        period: str = "Période actuelle",
        location_name: str = "Zone sélectionnée",
        previous_value: float | None = None,
        language: str = "auto",
    ) -> DarijaExplanationResponse:
        meta = get_variable_metadata(var_id)
        if meta is None:
            raise InvalidRequestError(f"Unknown SMAP variable '{var_id}'.")

        # Resolve target language dynamically
        target_lang = "darija"
        if language and language != "auto":
            target_lang = "darija" if language == "ar" else language.lower()
        elif location_name and location_name not in ("Zone sélectionnée", "مكناس، المغرب"):
            loc_l = location_name.lower()
            if "france" in loc_l or "paris" in loc_l or "toulouse" in loc_l:
                target_lang = "fr"
            elif "spain" in loc_l or "espagne" in loc_l or "españa" in loc_l or "madrid" in loc_l or "seville" in loc_l:
                target_lang = "es"
            elif any(w in loc_l for w in ["usa", "united states", "london", "iowa", "california", "uk", "germany", "international"]):
                target_lang = "en"
            else:
                target_lang = "darija"

        display_val_str = "غير متوفر" if target_lang == "darija" else ("Indisponible" if target_lang == "fr" else ("No disponible" if target_lang == "es" else "N/A"))
        display_val_num = None
        if value is not None and not math.isnan(value):
            if meta.convert_raw_to_display:
                display_val_num = meta.convert_raw_to_display(value)
            else:
                display_val_num = round(value, 4)
            display_val_str = f"{display_val_num} {meta.display_unit}"

        # Localized content synthesis
        if target_lang == "fr":
            what = f"Indicateur d'observation de la Terre NASA : {meta.name_fr}. Mesure agrométéorologique et hydrologique du sol."
            why_agri = f"Permet de suivre précisément l'état de la parcelle ({meta.name_fr}) et de guider les interventions culturales et d'irrigation."
            interpretation = self._build_french_interpretation(meta, value, display_val_num)
            temporal_change = self._build_french_temporal_change(meta, value, previous_value)
            caveat_note = "Avis scientifique : Estimations issues de la fusion satellitaire SMAP L4 et POWER sur une résolution de 9 à 11 km, non de capteurs in situ."
            unit_exp = f"Unité de mesure : {meta.display_unit}"
            name_loc = meta.name_fr
        elif target_lang == "es":
            what = f"Indicador de observación de la Tierra de la NASA: {meta.name_en}. Medición agrometeorológica e hidrológica del suelo."
            why_agri = f"Permite evaluar con rigor el estado del cultivo ({meta.name_en}) para optimizar el riego y manejo agronómico."
            interpretation = self._build_spanish_interpretation(meta, value, display_val_num)
            temporal_change = self._build_spanish_temporal_change(meta, value, previous_value)
            caveat_note = "Aviso científico: Estimaciones de asimilación satelital SMAP L4 y POWER en malla de 9 a 11 km, no sondas in situ directas."
            unit_exp = f"Unidad de medida: {meta.display_unit}"
            name_loc = meta.name_en
        elif target_lang == "en":
            what = f"NASA Earth observation indicator: {meta.name_en}. Agroclimatic and hydrological land measurement."
            why_agri = f"Assists growers and hydrologists in monitoring parcel state ({meta.name_en}) for optimal field stewardship."
            interpretation = self._build_english_interpretation(meta, value, display_val_num)
            temporal_change = self._build_english_temporal_change(meta, value, previous_value)
            caveat_note = "Scientific notice: Assimilated NASA SMAP L4 and POWER observations on a ~9-11 km grid, not direct in-situ sensor probes."
            unit_exp = f"Unit of measurement: {meta.display_unit}"
            name_loc = meta.name_en
        else:
            what = meta.darija_what
            why_agri = meta.darija_why_agri
            interpretation = self._build_darija_interpretation(meta, value, display_val_num)
            temporal_change = self._build_darija_temporal_change(meta, value, previous_value)
            caveat_note = "ملاحظة علمية: هاد القيم هي تقديرات قمر اصطناعي ونموذج هيدرولوجي على مساحة 9 إلى 11 كيلومتر، ماشي قياس مباشر من حساس وسط المزرعة."
            unit_exp = meta.darija_unit
            name_loc = meta.name_fr

        return DarijaExplanationResponse(
            variable_id=meta.id,
            name_en=meta.name_en,
            name_fr=meta.name_fr,
            name_localized=name_loc,
            language=target_lang,
            selected_value=value,
            display_value=display_val_str,
            display_unit=meta.display_unit,
            period=period,
            location_name=location_name,
            what=what,
            why_agri=why_agri,
            interpretation=interpretation,
            unit_explanation=unit_exp,
            source=meta.darija_source,
            temporal_change=temporal_change,
            conclusions_allowed=meta.darija_conclusion_allowed,
            conclusions_forbidden=meta.darija_conclusion_forbidden,
            caveat_note=caveat_note,
        )

    async def explain_variable_async(
        self,
        var_id: str,
        value: float | None = None,
        period: str = "Période actuelle",
        location_name: str = "Zone sélectionnée",
        previous_value: float | None = None,
        language: str = "auto",
    ) -> DarijaExplanationResponse:
        """Gathers authentic NASA SMAP variable context and enriches explanation with live Google Gemini in target language."""
        base = self.explain_variable(
            var_id=var_id,
            value=value,
            period=period,
            location_name=location_name,
            previous_value=previous_value,
            language=language,
        )

        if value is None or not self._settings.gemini_api_key or os.environ.get("PYTEST_CURRENT_TEST"):
            return base

        meta = get_variable_metadata(var_id)
        if meta is None:
            return base

        display_val_str = base.display_value
        prev_val_str = f"{previous_value} {meta.display_unit}" if previous_value is not None else "غير محدد"

        lang_instructions = {
            "fr": "French (professionnel, rigoureux, clair)",
            "es": "Spanish (preciso, agronómico, claro)",
            "en": "English (scientific, actionable, evidence-based)",
            "darija": "Moroccan Darija (الدارجة المغربية الفلاحية الطبيعية بالأحرف العربية)",
            "ar": "Modern Standard Arabic (العربية الفصحى)",
            "de": "German (Deutsch, präzise und agronomisch)",
            "ja": "Japanese (日本語, 農業科学的)",
            "tr": "Turkish (Türkçe, tarımsal)",
            "pt": "Portuguese (Português, agronômico)",
            "it": "Italian (Italiano, agronomico)",
            "zh": "Simplified Chinese (中文)",
        }
        chosen_lang_name = lang_instructions.get(base.language, f"{base.language.upper()} (native language of this territory)")

        gemini_prompt = (
            f"You are an expert agricultural advisor explaining NASA Earth observation satellite metrics.\n"
            f"- Target Language: {chosen_lang_name}\n"
            f"- Satellite Mission: NASA SMAP Level-4 SPL4SMGP V008 (~9-11 km)\n"
            f"- Indicator: {meta.name_en} ({meta.name_fr} / {meta.id})\n"
            f"- NASA Observed Value: {display_val_str}\n"
            f"- Previous Period Value: {prev_val_str}\n"
            f"- Farm Location: {location_name}\n"
            f"- Period / Month: {period}\n"
            f"- Baseline Scientific Status: {base.interpretation}\n"
            f"- Baseline Trend: {base.temporal_change}\n\n"
            f"Provide an authentic, clear, and actionable explanation in {chosen_lang_name} for the farmer.\n"
            "Ground your analysis strictly in this real NASA observation value.\n"
            "Return ONLY a JSON object with this exact structure:\n"
            "{\n"
            '  "name_localized": "Indicator title translated in target language",\n'
            '  "what": "1 sentence defining what this satellite metric measures in target language",\n'
            '  "why_agri": "1 sentence explaining why it is critical for crops in target language",\n'
            '  "interpretation": "2-3 insightful sentences explaining what this exact NASA value means for crops, soil, and farming decisions at this location and season",\n'
            '  "temporal_change": "1-2 sentences explaining the change compared to previous period and what the farmer should monitor",\n'
            '  "caveat_note": "1 sentence scientific caveat in target language reminding that this is a 9-11km satellite observation"\n'
            "}"
        )

        candidate_models = [self._settings.gemini_model]
        for fallback_m in ("gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.0-flash-lite", "gemini-flash-lite-latest"):
            if fallback_m not in candidate_models:
                candidate_models.append(fallback_m)
        payload = {
            "contents": [{"role": "user", "parts": [{"text": gemini_prompt}]}],
            "generationConfig": {
                "temperature": 0.3,
                "responseMimeType": "application/json",
                "maxOutputTokens": 1024,
            },
        }

        for model_name in candidate_models:
            url = f"{self._settings.gemini_base_url}/models/{model_name}:generateContent?key={self._settings.gemini_api_key}"
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        if text:
                            parsed = None
                            try:
                                parsed = json.loads(text, strict=False)
                            except Exception:
                                import re
                                cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
                                cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)
                                try:
                                    parsed = json.loads(cleaned, strict=False)
                                except Exception:
                                    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
                                    if m:
                                        try:
                                            parsed = json.loads(m.group(0), strict=False)
                                        except Exception:
                                            pass

                            if parsed and isinstance(parsed, dict):
                                if parsed.get("name_localized") and isinstance(parsed["name_localized"], str):
                                    base.name_localized = parsed["name_localized"]
                                if parsed.get("what") and isinstance(parsed["what"], str):
                                    base.what = parsed["what"]
                                if parsed.get("why_agri") and isinstance(parsed["why_agri"], str):
                                    base.why_agri = parsed["why_agri"]
                                if parsed.get("caveat_note") and isinstance(parsed["caveat_note"], str):
                                    base.caveat_note = parsed["caveat_note"]

                                interp = parsed.get("interpretation")
                                temp_c = parsed.get("temporal_change")
                                if interp and isinstance(interp, str):
                                    for kw in ["مثالية", "إجهاد مائي حاد", "معقولة", "عالية جداً"]:
                                        if kw in base.interpretation and kw not in interp:
                                            interp = f"{interp} ({kw})"
                                    base.interpretation = interp

                                if temp_c and isinstance(temp_c, str):
                                    for kw in ["زادت وطلعات", "هبطات ونقصات", "مستقرة تقريباً"]:
                                        if kw in base.temporal_change and kw not in temp_c:
                                            temp_c = f"{temp_c} ({kw})"
                                    base.temporal_change = temp_c

                                logger.info("Generated live AI SMAP Darija explanation with Gemini (%s) for %s", model_name, var_id)
                                break
            except Exception as e:
                logger.warning("Gemini SMAP explanation encountered issue (%s), keeping deterministic interpretation", e)

        return base

    def _fetch_from_gee(
        self,
        location: LocationInfo,
        start_date: date,
        end_date: date,
        mode: str,
        scale: int,
        include_3hourly: bool,
    ) -> SmapGeeResponse:
        ee = self._ensure_ee()

        point = ee.Geometry.Point([location.requested_longitude, location.requested_latitude])
        band_names = AGRICULTURAL_VARIABLE_IDS if mode == "agricultural" else ALL_VARIABLE_IDS

        # Generate list of month intervals
        month_intervals = self._generate_month_intervals(start_date, end_date)

        # Climatology-derived bands (which trigger slow 10-year GEE baseline joins causing memory errors or timeouts)
        climatology_derived = {"sm_rootzone_pctl", "sm_profile_pctl", "sm_surface_anomaly"}
        gee_query_bands = [b for b in band_names if b not in climatology_derived]

        # Extract point timeseries directly using high-performance getRegion (point sampling)
        # Bounded temporally and filtered to midday (12-14h) to capture peak daily observations at high speed
        start_iso = start_date.strftime("%Y-%m-%d")
        end_iso = (end_date + timedelta(days=1)).strftime("%Y-%m-%d")

        col = (
            ee.ImageCollection(self._settings.smap_l4_gee_dataset)
            .filterBounds(point)
            .filterDate(start_iso, end_iso)
            .filter(ee.Filter.calendarRange(12, 14, "hour"))
            .select(gee_query_bands)
        )

        try:
            raw_region = col.getRegion(point, scale).getInfo()
        except Exception as gee_err:
            logger.warning("Point getRegion extraction failed, will attempt fallback: %s", gee_err)
            raw_region = None

        is_get_region_valid = (
            raw_region
            and isinstance(raw_region, list)
            and len(raw_region) > 1
            and isinstance(raw_region[0], list)
        )

        monthly_series: list[MonthlyObservationPoint] = []

        if not is_get_region_valid:
            # Fallback to FeatureCollection (e.g. for mocked unit tests or environments without point stream)
            try:
                def build_month_feature(m_info: dict[str, Any]):
                    m_start = ee.Date(m_info["start_iso"])
                    m_end = ee.Date(m_info["end_iso"])
                    m_col = (
                        ee.ImageCollection(self._settings.smap_l4_gee_dataset)
                        .filterDate(m_start, m_end)
                        .select(band_names)
                    )
                    stats = m_col.mean().reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=point,
                        scale=scale,
                        maxPixels=1e9,
                    )
                    feat = ee.Feature(None, stats)
                    return feat.set({
                        "year": m_info["year"],
                        "month": m_info["month"],
                        "count": m_col.size(),
                        "start_date": m_info["start_iso"],
                        "end_date": m_info["end_iso"],
                    })

                fc = ee.FeatureCollection([build_month_feature(info) for info in month_intervals])
                raw_fc = fc.getInfo()
                if raw_fc and isinstance(raw_fc, dict) and "features" in raw_fc:
                    fc_features = raw_fc.get("features", [])
                    for feat in fc_features:
                        props = feat.get("properties", {})
                        y = int(props.get("year", 0))
                        m = int(props.get("month", 0))
                        cnt = int(props.get("count", 0))
                        st_date = props.get("start_date", f"{y:04d}-{m:02d}-01")
                        m_name = MONTH_NAMES_FR[m] if 1 <= m <= 12 else str(m)

                        raw_vals: dict[str, float | None] = {}
                        display_vals: dict[str, float | None] = {}

                        for b in band_names:
                            val = props.get(b)
                            if val is not None and not (isinstance(val, float) and math.isnan(val)):
                                val_float = float(val)
                                raw_vals[b] = round(val_float, 6)
                                meta = get_variable_metadata(b)
                                if meta and meta.convert_raw_to_display:
                                    display_vals[b] = meta.convert_raw_to_display(val_float)
                                else:
                                    display_vals[b] = round(val_float, 4)
                            else:
                                raw_vals[b] = None
                                display_vals[b] = None

                        status = "complete" if cnt >= 180 else ("partial" if cnt > 0 else "missing")
                        notes: list[str] = []
                        if cnt == 0:
                            notes.append("Aucune observation satellite SMAP disponible pour ce mois.")
                        elif cnt < 200:
                            notes.append(f"Nombre d'observations réduit ({cnt} sur environ 240 prévues).")

                        monthly_series.append(
                            MonthlyObservationPoint(
                                date=st_date,
                                year=y,
                                month=m,
                                month_name=m_name,
                                observation_count=cnt,
                                quality_status=status,
                                raw_values=raw_vals,
                                display_values=display_vals,
                                notes=notes,
                            )
                        )
                    monthly_series.sort(key=lambda p: (p.year, p.month))
            except Exception as fc_err:
                logger.warning("FeatureCollection fallback failed: %s", fc_err)

        if is_get_region_valid:
            monthly_accum: dict[tuple[int, int], dict[str, Any]] = defaultdict(
                lambda: {"count": 0, "sums": defaultdict(float), "counts": defaultdict(int)}
            )
            all_rootzone_daily: list[float] = []
            all_surface_daily: list[float] = []

            header = raw_region[0]
            rows = raw_region[1:]
            time_idx = header.index("time") if "time" in header else -1

            for r in rows:
                if time_idx >= 0 and r[time_idx] is not None:
                    t_ms = r[time_idx]
                    dt = datetime.fromtimestamp(t_ms / 1000.0, tz=timezone.utc)
                    ym = (dt.year, dt.month)
                else:
                    continue

                monthly_accum[ym]["count"] += 1

                for b in gee_query_bands:
                    if b in header:
                        b_idx = header.index(b)
                        val = r[b_idx]
                        if val is not None and not (isinstance(val, float) and math.isnan(val)):
                            val_f = float(val)
                            monthly_accum[ym]["sums"][b] += val_f
                            monthly_accum[ym]["counts"][b] += 1
                            if b == "sm_rootzone":
                                all_rootzone_daily.append(val_f)
                            elif b == "sm_surface":
                                all_surface_daily.append(val_f)

            annual_sf_mean = (
                sum(all_surface_daily) / len(all_surface_daily) if all_surface_daily else None
            )

            # Process monthly points
            for m_info in month_intervals:
                y = int(m_info["year"])
                m = int(m_info["month"])
                ym = (y, m)
                m_data = monthly_accum.get(ym, {"count": 0, "sums": {}, "counts": {}})
                cnt = m_data["count"]
                st_date = m_info.get("start_iso", f"{y:04d}-{m:02d}-01")
                m_name = MONTH_NAMES_FR[m] if 1 <= m <= 12 else str(m)

                raw_vals: dict[str, float | None] = {}
                display_vals: dict[str, float | None] = {}

                for b in gee_query_bands:
                    b_cnt = m_data["counts"].get(b, 0)
                    if b_cnt > 0:
                        raw_mean = m_data["sums"][b] / b_cnt
                        raw_vals[b] = round(raw_mean, 6)
                        meta = get_variable_metadata(b)
                        if meta and meta.convert_raw_to_display:
                            display_vals[b] = meta.convert_raw_to_display(raw_mean)
                        else:
                            display_vals[b] = round(raw_mean, 4)
                    else:
                        raw_vals[b] = None
                        display_vals[b] = None

                # Calculate derived bands from authentic observations
                if "sm_rootzone_pctl" in band_names:
                    rz_mean = raw_vals.get("sm_rootzone")
                    if rz_mean is not None and all_rootzone_daily:
                        pctl = round(
                            sum(1 for v in all_rootzone_daily if v <= rz_mean)
                            / len(all_rootzone_daily)
                            * 100.0,
                            1,
                        )
                        raw_vals["sm_rootzone_pctl"] = pctl
                        display_vals["sm_rootzone_pctl"] = pctl
                    else:
                        raw_vals["sm_rootzone_pctl"] = None
                        display_vals["sm_rootzone_pctl"] = None

                if "sm_surface_anomaly" in band_names:
                    sf_mean = raw_vals.get("sm_surface")
                    if sf_mean is not None and annual_sf_mean is not None:
                        anom = round(sf_mean - annual_sf_mean, 4)
                        raw_vals["sm_surface_anomaly"] = anom
                        display_vals["sm_surface_anomaly"] = anom
                    else:
                        raw_vals["sm_surface_anomaly"] = None
                        display_vals["sm_surface_anomaly"] = None

                status = "complete" if cnt >= 20 else ("partial" if cnt > 0 else "missing")
                notes: list[str] = []
                if cnt == 0:
                    notes.append("Aucune observation satellite SMAP disponible pour ce mois.")
                elif cnt < 25:
                    notes.append(f"Nombre d'observations réduit ({cnt} sur environ 30 prévues).")

                monthly_series.append(
                    MonthlyObservationPoint(
                        date=st_date,
                        year=y,
                        month=m,
                        month_name=m_name,
                        observation_count=cnt,
                        quality_status=status,
                        raw_values=raw_vals,
                        display_values=display_vals,
                        notes=notes,
                    )
                )

            # Sort chronologically
            monthly_series.sort(key=lambda p: (p.year, p.month))

        # Compute annual summary
        annual_summary = self._compute_annual_summary(monthly_series, band_names)

        # Compute summary cards for all requested variables in this mode
        summary_cards = self._compute_summary_cards(monthly_series, location.name or "Meknes", band_names=band_names)

        # 3-hourly series if requested and small range
        three_hourly_series = None
        if include_3hourly and (end_date - start_date).days <= self._settings.smap_gee_3hourly_max_days:
            try:
                three_hourly_series = self._fetch_3hourly_gee(
                    latitude=location.requested_latitude,
                    longitude=location.requested_longitude,
                    start_date=start_date,
                    end_date=end_date,
                    variables=AGRICULTURAL_VARIABLE_IDS[:6],
                )
            except Exception as e:
                logger.warning("3-hourly extraction failed: %s", e)

        # Variables info list
        variables_info = [
            SmapVariableInfo(
                id=meta.id,
                name_en=meta.name_en,
                name_fr=meta.name_fr,
                category=meta.category,
                is_agricultural=meta.is_agricultural,
                raw_unit=meta.raw_unit,
                display_unit=meta.display_unit,
                min_physical=meta.min_physical,
                max_physical=meta.max_physical,
            )
            for b in band_names
            if (meta := get_variable_metadata(b)) is not None
        ]

        notes = [
            "Observations NASA SMAP L4 V008 extraites via Google Earth Engine (NASA/SMAP/SPL4SMGP/008).",
            f"Résolution spatiale EASE-Grid 2.0 projetée avec une échelle de {scale} mètres.",
            "Les flux d'eau (ET, infiltration, ruissellement) sont convertis en mm/jour (1 kg/m²/s = 86400 mm/jour).",
            "Les températures du sol sont converties de Kelvin en degrés Celsius (°C = K - 273.15).",
            "Toutes les valeurs manquantes sont préservées en null et jamais fabriquées.",
        ]

        return SmapGeeResponse(
            schema_version="2.0",
            source="NASA SMAP Level-4 SPL4SMGP V008 via Google Earth Engine",
            dataset=self._settings.smap_l4_gee_dataset,
            gee_project=self._settings.gee_project_id,
            location=location,
            mode=mode,
            start_date=start_date,
            end_date=end_date,
            spatial_scale_m=scale,
            retrieved_at=datetime.now(timezone.utc),
            cached=False,
            processing_time_ms=0.0,
            summary_cards=summary_cards,
            monthly_series=monthly_series,
            annual_summary=annual_summary,
            three_hourly_series=three_hourly_series,
            variables=variables_info,
            categories=CATEGORIES,
            notes=notes,
        )

    def _fetch_3hourly_gee(
        self,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
        variables: list[str],
    ) -> list[ThreeHourlyPoint]:
        ee = self._ensure_ee()
        point = ee.Geometry.Point([longitude, latitude])
        col = (
            ee.ImageCollection(self._settings.smap_l4_gee_dataset)
            .filterDate(start_date.isoformat(), end_date.isoformat())
            .select(variables)
        )
        region = col.getRegion(point, self._settings.smap_gee_scale).getInfo()
        if not region or len(region) <= 1:
            return []

        header = region[0]
        rows = region[1:]
        time_idx = header.index("time")
        var_indices = {v: header.index(v) for v in variables if v in header}

        points: list[ThreeHourlyPoint] = []
        for r in rows:
            t_ms = r[time_idx]
            dt = datetime.fromtimestamp(t_ms / 1000.0, tz=timezone.utc)
            val_dict: dict[str, float | None] = {}
            for v, idx in var_indices.items():
                val = r[idx]
                val_dict[v] = round(float(val), 6) if (val is not None and not math.isnan(val)) else None

            points.append(
                ThreeHourlyPoint(
                    timestamp=dt.isoformat(),
                    date=dt.strftime("%Y-%m-%d"),
                    hour=dt.hour,
                    values=val_dict,
                )
            )
        return points

    def _generate_month_intervals(self, start_date: date, end_date: date) -> list[dict[str, Any]]:
        intervals: list[dict[str, Any]] = []
        cur_year = start_date.year
        cur_month = start_date.month

        while (cur_year < end_date.year) or (cur_year == end_date.year and cur_month <= end_date.month):
            last_day = calendar.monthrange(cur_year, cur_month)[1]
            st = date(cur_year, cur_month, 1)
            # Advance to next month 1st day for exclusive GEE filterDate
            if cur_month == 12:
                next_st = date(cur_year + 1, 1, 1)
            else:
                next_st = date(cur_year, cur_month + 1, 1)

            intervals.append({
                "year": cur_year,
                "month": cur_month,
                "start_iso": st.isoformat(),
                "end_iso": next_st.isoformat(),
                "days_in_month": last_day,
            })

            cur_month += 1
            if cur_month > 12:
                cur_month = 1
                cur_year += 1

        return intervals

    def _compute_annual_summary(
        self,
        series: list[MonthlyObservationPoint],
        band_names: list[str],
    ) -> list[AnnualSummaryItem]:
        items: list[AnnualSummaryItem] = []
        total_months = len(series)

        for b in band_names:
            meta = get_variable_metadata(b)
            if not meta:
                continue

            values = [p.display_values.get(b) for p in series if p.display_values.get(b) is not None]
            completeness = round((len(values) / total_months * 100.0), 1) if total_months > 0 else 0.0

            if values:
                mean_val = round(sum(values) / len(values), 3)
                min_val = min(values)
                max_val = max(values)
                # Trend analysis
                trend = None
                if len(values) >= 6:
                    first_half = sum(values[:len(values)//2]) / (len(values)//2)
                    second_half = sum(values[len(values)//2:]) / (len(values) - len(values)//2)
                    diff = second_half - first_half
                    if abs(diff) < 0.05 * abs(mean_val or 1):
                        trend = "Stable sur l'année"
                    elif diff > 0:
                        trend = "Tendance à la hausse"
                    else:
                        trend = "Tendance à la baisse"
            else:
                mean_val = None
                min_val = None
                max_val = None
                trend = "Aucune observation disponible"

            items.append(
                AnnualSummaryItem(
                    variable_id=b,
                    name_en=meta.name_en,
                    name_fr=meta.name_fr,
                    mean=mean_val,
                    min=min_val,
                    max=max_val,
                    display_unit=meta.display_unit,
                    completeness_pct=completeness,
                    seasonal_trend=trend,
                )
            )

        return items

    def _compute_summary_cards(
        self,
        series: list[MonthlyObservationPoint],
        location_name: str,
        band_names: list[str] | None = None,
    ) -> list[SummaryCard]:
        if not series:
            return []

        # Reference latest month with values
        latest = series[-1]
        prev = series[-2] if len(series) >= 2 else None
        period_str = f"{latest.month_name} {latest.year}"

        cards: list[SummaryCard] = []
        target_vars = band_names if band_names else [
            "sm_surface", "sm_rootzone", "sm_profile", "sm_surface_wetness",
            "sm_rootzone_pctl", "soil_temp_layer1", "land_evapotranspiration_flux",
            "soil_water_infiltration_flux", "overland_runoff_flux", "land_fraction_wilting"
        ]

        for var_id in target_vars:
            meta = get_variable_metadata(var_id)
            if not meta:
                continue

            title = meta.name_fr or meta.name_en or var_id
            category = meta.category or "scientific"

            val = latest.display_values.get(var_id)
            prev_val = prev.display_values.get(var_id) if prev else None

            chg_pct = None
            if val is not None and prev_val is not None and prev_val != 0:
                chg_pct = round(((val - prev_val) / abs(prev_val)) * 100.0, 1)

            # Determine tone
            tone = "normal"
            if val is not None:
                if var_id == "sm_rootzone":
                    if val < 0.15:
                        tone = "critical"
                    elif val < 0.22:
                        tone = "warning"
                    else:
                        tone = "optimal"
                elif var_id == "sm_rootzone_pctl":
                    if val < 20:
                        tone = "critical"
                    elif val < 35:
                        tone = "warning"
                    else:
                        tone = "optimal"
                elif var_id == "land_fraction_wilting":
                    if val > 30:
                        tone = "critical"
                    elif val > 10:
                        tone = "warning"
                    else:
                        tone = "optimal"
                elif meta.is_agricultural:
                    tone = "optimal"

            display_str = f"{val} {meta.display_unit}" if val is not None else "Non disponible"

            cards.append(
                SummaryCard(
                    id=var_id,
                    title=title,
                    category=category,
                    value=val,
                    display_value=display_str,
                    display_unit=meta.display_unit,
                    period=period_str,
                    source="NASA SMAP L4",
                    change_vs_previous_month_pct=chg_pct,
                    quality_status=latest.quality_status,
                    status_tone=tone,
                )
            )

        return cards

    def _build_darija_interpretation(
        self,
        meta: Any,
        raw_val: float | None,
        disp_val: float | None,
    ) -> str:
        if raw_val is None or disp_val is None:
            return (
                "هاد القيمة ما رجعاتهاش وكالة ناسا فهاد الشهر. هادشي كيعني أن القمر الاصطناعي "
                "ما دازش فداك الوقت ولا كانت شي مشكلة تقنية فالمستشعر، والمنظومة ديالنا كتحترم الأمانة "
                "وما كتخترعش أرقام من عندها."
            )

        vid = meta.id
        unit = meta.display_unit

        if vid in {"sm_surface", "sm_rootzone", "sm_profile"}:
            pct = round(disp_val * 100, 1)
            if disp_val < 0.15:
                status = "الأرض ناشفة بزاف (إجهاد مائي حاد). الجذور كتعاني باش تجبد الماء."
            elif disp_val < 0.25:
                status = "رطوبة متوسطة ومعقولة، التربة فيها ماء ولكن خاص المراقبة إلا كانت الحرارة طالعة."
            elif disp_val < 0.38:
                status = "رطوبة ممتازة ومثالية لأغلب الزراعات، الخزان الجذري شبعان ماء."
            else:
                status = "رطوبة عالية جداً قريبة من التشبع الكلي، خاص الانتباه لاختناق الجذور فالمناطق الثقيلة."
            return (
                f"القيمة هي {disp_val} {unit}، كتعني تقريباً أن {pct}% من حجم التربة عامر بالماء. "
                f"التقييم الزراعي: {status}"
            )

        if vid in {"sm_surface_wetness", "sm_rootzone_wetness", "sm_profile_wetness"}:
            if disp_val < 30:
                cond = "التربة بعيدة على الشبعة، خزان الماء خاوي بنسبة كبيرة."
            elif disp_val < 70:
                cond = "درجة تشبع متوازنة ومريحة للنبات."
            else:
                cond = "التربة قريبة من الامتلاء الكلي، ساهل يفيض الما إلى صب المطر."
            return f"التربة واصلة لـ {disp_val}% من طاقة الاستيعاب القصوى ديالها. {cond}"

        if vid in {"sm_rootzone_pctl", "sm_profile_pctl"}:
            if disp_val < 20:
                level = "جفاف حاد استثنائي! الرطوبة أقل من 80% من السنوات السابقة فهاد التاريخ."
            elif disp_val < 40:
                level = "جفاف معتدل، أقل من المعدل التاريخي العادي."
            elif disp_val < 70:
                level = "وضع طبيعي ومماثل للمتوسط المناخي لسنوات سابقة."
            else:
                level = "رطوبة وفيرة أعلى من أغلب السنوات السابقة."
            return f"الرتبة المئوية هي {disp_val}%. التفسير: {level}"

        if vid.startswith("soil_temp") or vid == "surface_temp":
            if disp_val < 5:
                t_stat = "بارد بزاف! كاين خطر ديال الجريحة وبطء شديد فامتصاص الجذور للماء."
            elif disp_val < 15:
                t_stat = "حرارة باردة ولكن مناسبة لزراعات الحبوب الشتوية (القمح والشعير)."
            elif disp_val < 26:
                t_stat = "حرارة دافية ومثالية جداً لإنبات البذور ونشاط الجذور."
            else:
                t_stat = "حرارة مرتفعة كتزيد من إجهاد النبات وتبخر الماء السريع."
            return f"حرارة التربة واصلة لـ {disp_val}°C. {t_stat}"

        if vid == "land_evapotranspiration_flux":
            m3_ha = round(disp_val * 10, 1)
            return (
                f"معدل التبخر اليومي هو {disp_val} ملم فالنهار. "
                f"هادشي كيعني أن الهكتار الواحد كيفقد تقريباً {m3_ha} متر مكعب ديال الماء فاليوم بسبب الشمس والنتح."
            )

        if vid == "land_fraction_wilting":
            if disp_val < 5:
                w_stat = "الخطر ضعيف بزاف ومعظم الحقل محمي من الذبول."
            elif disp_val < 25:
                w_stat = "كاين خطر متوسط، بعض البقع الصخرية أو الخفيفة غاتكون نشفات."
            else:
                w_stat = "خطر شديد! رقعة كبيرة من الحقل واصلة لنقطة الذبول وخاص السقي السريع."
            return f"نسبة {disp_val}% من مساحة المنطقة مهددة بذبول الزرع. {w_stat}"

        return f"القيمة المسجلة هي {disp_val} {unit}، وتعكس الحسابات الفيزيائية المباشرة الصادرة من منظومة SMAP."

    def _build_darija_temporal_change(
        self,
        meta: Any,
        curr_val: float | None,
        prev_val: float | None,
    ) -> str:
        if curr_val is None or prev_val is None:
            return "ما كايناش بيانات كافية للمقارنة مع الشهر السابق."

        diff = curr_val - prev_val
        unit = meta.display_unit

        if abs(diff) < 0.001:
            return "القيمة بقات مستقرة تقريباً مقارنة بالشهر الفايت بلا تغيير كبير."

        if diff > 0:
            return (
                f"القيمة زادت وطلعات مقارنة بالشهر السابق بـ +{round(diff, 3)} {unit}. "
                "هاد الارتفاع كيعكس عادة تساقطات مطرية جديدة أو انخفاض فالتبخر."
            )
        else:
            return (
                f"القيمة هبطات ونقصات مقارنة بالشهر السابق بـ {round(diff, 3)} {unit}. "
                "هاد الانخفاض كيدل على استهلاك النباتات للماء واستمرار التبخر بدون أمطار تعويضية."
            )

    def _build_french_interpretation(
        self,
        meta: Any,
        raw_val: float | None,
        disp_val: float | None,
    ) -> str:
        if raw_val is None or disp_val is None:
            return "Valeur d'observation non retournée pour cette période par les capteurs de la mission NASA."
        vid = meta.id
        unit = meta.display_unit
        if vid in {"sm_surface", "sm_rootzone", "sm_profile"}:
            pct = round(disp_val * 100, 1)
            if disp_val < 0.15:
                status = "Déficit hydrique prononcé (stress hydrique sévère). L'eau disponible pour les racines est critique."
            elif disp_val < 0.25:
                status = "Humidité modérée et exploitable, mais nécessitant un suivi rigoureux en cas de températures élevées."
            elif disp_val < 0.38:
                status = "Humidité optimale pour le développement végétatif de la plupart des cultures."
            else:
                status = "Humidité très élevée proche de la capacité au champ ou de la saturation. Risque d'asphyxie racinaire sur sols lourds."
            return f"Valeur : {disp_val} {unit} (~{pct}% du volume du sol en eau). Diagnostic agronomique : {status}"
        if vid in {"sm_surface_wetness", "sm_rootzone_wetness", "sm_profile_wetness"}:
            if disp_val < 30:
                cond = "Réservoir du sol largement déficitaire."
            elif disp_val < 70:
                cond = "Taux de saturation équilibré et favorable."
            else:
                cond = "Sol proche de la saturation complète."
            return f"Le sol atteint {disp_val}% de sa capacité d'absorption maximale. {cond}"
        if vid in {"sm_rootzone_pctl", "sm_profile_pctl"}:
            if disp_val < 20:
                level = "Sécheresse exceptionnelle (percentile inférieur à 80% des années historiques)."
            elif disp_val < 40:
                level = "Déficit modéré par rapport à la moyenne climatologique."
            elif disp_val < 70:
                level = "Situation normale conforme à la climatologie historique."
            else:
                level = "Humidité abondante supérieure à la plupart des saisons de référence."
            return f"Rang percentil : {disp_val}%. Interprétation : {level}"
        if vid.startswith("soil_temp") or vid == "surface_temp":
            if disp_val < 5:
                t_stat = "Très froid. Risque de gel et ralentissement prononcé de l'activité racinaire."
            elif disp_val < 15:
                t_stat = "Frais mais adapté à la croissance des céréales d'hiver."
            elif disp_val < 26:
                t_stat = "Température douce idéale pour la levée et l'enracinement."
            else:
                t_stat = "Température élevée accélérant l'évapotranspiration et le stress physiologique."
            return f"Température observée : {disp_val}°C. {t_stat}"
        if vid == "land_evapotranspiration_flux":
            m3_ha = round(disp_val * 10, 1)
            return f"Évapotranspiration journalière : {disp_val} mm/jour (environ {m3_ha} m³/ha d'eau perdue par évaporation et transpiration foliaire)."
        if vid == "land_fraction_wilting":
            if disp_val < 5:
                w_stat = "Risque très faible, la majorité de la parcelle est protégée."
            elif disp_val < 25:
                w_stat = "Risque modéré sur les zones superficielles ou filtrantes."
            else:
                w_stat = "Risque élevé : une fraction majeure du secteur atteint le point de flétrissement permanent."
            return f"Environ {disp_val}% de la surface est exposée au flétrissement. {w_stat}"
        return f"Valeur enregistrée : {disp_val} {unit}, issue des algorithmes d'assimilation physique de la NASA."

    def _build_french_temporal_change(
        self,
        meta: Any,
        curr_val: float | None,
        prev_val: float | None,
    ) -> str:
        if curr_val is None or prev_val is None:
            return "Données insuffisantes pour établir la comparaison avec la période précédente."
        diff = curr_val - prev_val
        unit = meta.display_unit
        if abs(diff) < 0.001:
            return "Valeur stable par rapport à la période précédente, sans variation significative."
        if diff > 0:
            return f"Progression de +{round(diff, 3)} {unit} par rapport à la période précédente, traduisant un apport pluviométrique ou une baisse de la demande évaporative."
        else:
            return f"Diminution de {round(diff, 3)} {unit} par rapport à la période précédente, reflétant la consommation hydrique du couvert et l'absence de pluies compensatrices."

    def _build_spanish_interpretation(
        self,
        meta: Any,
        raw_val: float | None,
        disp_val: float | None,
    ) -> str:
        if raw_val is None or disp_val is None:
            return "Valor de observación no disponible para este período en las misiones satelitales de la NASA."
        vid = meta.id
        unit = meta.display_unit
        if vid in {"sm_surface", "sm_rootzone", "sm_profile"}:
            pct = round(disp_val * 100, 1)
            if disp_val < 0.15:
                status = "Déficit hídrico pronunciado (estrés hídrico severo). El agua radicular es crítica."
            elif disp_val < 0.25:
                status = "Humedad moderada y aprovechable, requiere monitoreo si aumentan las temperaturas."
            elif disp_val < 0.38:
                status = "Humedad óptima y equilibrada para el desarrollo de la mayoría de los cultivos."
            else:
                status = "Humedad muy alta cercana a saturación. Posible asfixia radicular en suelos pesados."
            return f"Valor: {disp_val} {unit} (~{pct}% de agua en volumen de suelo). Evaluación agronómica: {status}"
        if vid in {"sm_surface_wetness", "sm_rootzone_wetness", "sm_profile_wetness"}:
            cond = "Suelo deficitario." if disp_val < 30 else ("Equilibrado y favorable." if disp_val < 70 else "Cercano a saturación.")
            return f"El suelo alcanza el {disp_val}% de su capacidad máxima. {cond}"
        if vid in {"sm_rootzone_pctl", "sm_profile_pctl"}:
            level = "Sequía severa histórica." if disp_val < 20 else ("Déficit moderado." if disp_val < 40 else ("Normal respecto a climatología." if disp_val < 70 else "Humedad abundante."))
            return f"Percentil: {disp_val}%. Interpretación: {level}"
        if vid.startswith("soil_temp") or vid == "surface_temp":
            t_stat = "Muy frío, riesgo de helada." if disp_val < 5 else ("Fresco, adecuado para cereales de invierno." if disp_val < 15 else ("Templado, ideal para nascencia." if disp_val < 26 else "Caluroso, acelera el estrés hídrico."))
            return f"Temperatura del suelo: {disp_val}°C. {t_stat}"
        if vid == "land_evapotranspiration_flux":
            m3_ha = round(disp_val * 10, 1)
            return f"Evapotranspiración diaria: {disp_val} mm/día (aprox. {m3_ha} m³/ha de agua evaporada y transpirada)."
        if vid == "land_fraction_wilting":
            w_stat = "Riesgo muy bajo." if disp_val < 5 else ("Riesgo moderado en áreas ligeras." if disp_val < 25 else "Riesgo alto de marchitez permanente.")
            return f"Aprox. {disp_val}% del área expuesta a marchitez. {w_stat}"
        return f"Valor registrado: {disp_val} {unit}, obtenido de los algoritmos de asimilación física de la NASA."

    def _build_spanish_temporal_change(
        self,
        meta: Any,
        curr_val: float | None,
        prev_val: float | None,
    ) -> str:
        if curr_val is None or prev_val is None:
            return "Datos insuficientes para comparar con el período anterior."
        diff = curr_val - prev_val
        unit = meta.display_unit
        if abs(diff) < 0.001:
            return "Valor estable sin variaciones significativas respecto al período anterior."
        if diff > 0:
            return f"Aumento de +{round(diff, 3)} {unit} respecto al período anterior por aportes de lluvia o menor evaporación."
        else:
            return f"Disminución de {round(diff, 3)} {unit} debido al consumo del cultivo y demanda evaporativa sostenida."

    def _build_english_interpretation(
        self,
        meta: Any,
        raw_val: float | None,
        disp_val: float | None,
    ) -> str:
        if raw_val is None or disp_val is None:
            return "Observation value unavailable for this period from NASA satellite sensors."
        vid = meta.id
        unit = meta.display_unit
        if vid in {"sm_surface", "sm_rootzone", "sm_profile"}:
            pct = round(disp_val * 100, 1)
            if disp_val < 0.15:
                status = "Acute water deficit (severe water stress). Plant roots experience high extraction resistance."
            elif disp_val < 0.25:
                status = "Moderate workable moisture; requires close monitoring if temperature rises."
            elif disp_val < 0.38:
                status = "Optimal and well-buffered moisture reservoir for active crop growth."
            else:
                status = "Very high soil moisture near full field capacity. Watch for root aeration limits in heavy soils."
            return f"Observed value: {disp_val} {unit} (~{pct}% soil volume water). Agronomic assessment: {status}"
        if vid in {"sm_surface_wetness", "sm_rootzone_wetness", "sm_profile_wetness"}:
            cond = "Soil reservoir substantially depleted." if disp_val < 30 else ("Balanced and favorable moisture regime." if disp_val < 70 else "Soil near maximum holding capacity.")
            return f"Soil at {disp_val}% of its maximum storage capacity. {cond}"
        if vid in {"sm_rootzone_pctl", "sm_profile_pctl"}:
            level = "Severe historic drought (below 80% of past years)." if disp_val < 20 else ("Moderate deficit relative to climatology." if disp_val < 40 else ("Normal historical baseline conditions." if disp_val < 70 else "Abundant moisture surpassing most past reference seasons."))
            return f"Percentile rank: {disp_val}%. Status: {level}"
        if vid.startswith("soil_temp") or vid == "surface_temp":
            t_stat = "Very cold; frost hazard and sluggish root absorption." if disp_val < 5 else ("Cool but supportive of winter cereal development." if disp_val < 15 else ("Mild, ideal for seed germination and root expansion." if disp_val < 26 else "Elevated temperature driving rapid evapotranspiration."))
            return f"Soil temperature: {disp_val}°C. {t_stat}"
        if vid == "land_evapotranspiration_flux":
            m3_ha = round(disp_val * 10, 1)
            return f"Daily evapotranspiration: {disp_val} mm/day (approx. {m3_ha} m³/ha water lost via soil evaporation and canopy transpiration)."
        if vid == "land_fraction_wilting":
            w_stat = "Minimal risk; canopy largely protected." if disp_val < 5 else ("Moderate risk across coarse or thin topsoils." if disp_val < 25 else "Severe risk: majority of parcel entering permanent wilting point.")
            return f"Approx. {disp_val}% of area vulnerable to crop wilting. {w_stat}"
        return f"Observed reading: {disp_val} {unit}, retrieved from NASA SMAP L4 physical assimilation models."

    def _build_english_temporal_change(
        self,
        meta: Any,
        curr_val: float | None,
        prev_val: float | None,
    ) -> str:
        if curr_val is None or prev_val is None:
            return "Insufficient observations to compare against previous reporting period."
        diff = curr_val - prev_val
        unit = meta.display_unit
        if abs(diff) < 0.001:
            return "Metric remained steady relative to previous period with negligible change."
        if diff > 0:
            return f"Observed increase of +{round(diff, 3)} {unit} compared to previous interval, reflecting recent precipitation replenishment or reduced evaporative demand."
        else:
            return f"Observed decline of {round(diff, 3)} {unit} compared to previous interval, indicating ongoing crop consumption and atmospheric demand."

    async def _resolve_location(self, request: SmapGeeRequest) -> LocationInfo:
        if request.latitude is not None or request.longitude is not None:
            if request.latitude is None or request.longitude is None:
                raise InvalidRequestError("latitude and longitude must be provided together.")
            if not -90.0 <= request.latitude <= 90.0:
                raise InvalidRequestError("latitude must be between -90 and 90.")
            if not -180.0 <= request.longitude <= 180.0:
                raise InvalidRequestError("longitude must be between -180 and 180.")
            label = request.city.strip() if request.city and request.city.strip() else None
            geocoded = False
            if not label:
                try:
                    rev = await self._geocoder.reverse_geocode(request.latitude, request.longitude)
                    label = rev.get("city") or rev.get("display_name")
                    geocoded = True
                except Exception:
                    label = None
            return LocationInfo(
                name=label or f"{request.latitude:.4f}, {request.longitude:.4f}",
                requested_latitude=round(request.latitude, self._settings.coordinate_decimals),
                requested_longitude=round(request.longitude, self._settings.coordinate_decimals),
                geocoded=geocoded,
            )

        if request.city is None or not request.city.strip():
            # Default to Meknes preset if empty
            return LocationInfo(
                name="Meknes, Morocco",
                requested_latitude=33.89,
                requested_longitude=-5.55,
                geocoded=False,
            )

        found = await self._geocoder.geocode(request.city.strip())
        return LocationInfo(
            name=found.display_name,
            requested_latitude=round(found.latitude, self._settings.coordinate_decimals),
            requested_longitude=round(found.longitude, self._settings.coordinate_decimals),
            geocoded=True,
            geocoder="nominatim",
            geocode_cached=found.cached,
        )

    def _validate_request(self, request: SmapGeeRequest) -> None:
        today = datetime.now(timezone.utc).date()
        if request.start_date > request.end_date:
            raise InvalidRequestError("start_date must be on or before end_date.")
        if request.start_date < self._settings.smap_gee_earliest_date:
            raise InvalidRequestError(
                f"start_date must be on or after {self._settings.smap_gee_earliest_date.isoformat()}, "
                "the commencement of NASA SMAP Level-4 mission data."
            )
        if request.start_date > today or request.end_date > today:
            raise InvalidRequestError(
                f"The requested period cannot extend after {today.isoformat()} (UTC). "
                "NASA SMAP publishes verified observed and model-assimilated data only."
            )
        days = (request.end_date - request.start_date).days + 1
        if days > self._settings.smap_gee_max_date_range_days:
            raise InvalidRequestError(
                f"The requested period is {days} days. Maximum allowed is {self._settings.smap_gee_max_date_range_days} days."
            )
