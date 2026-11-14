"""Google Earth Engine service for NASA SMAP Level-4 SPL4SMGP V008.

Extracts real satellite observations from dataset 'NASA/SMAP/SPL4SMGP/008'.
Integrates with the local FileCache, GeocodingService, and centralized Moroccan Darija dictionary.
"""

from __future__ import annotations

import asyncio
import calendar
from dataclasses import dataclass
from datetime import date, datetime, timezone
import logging
import math
import time
from typing import Any

from app.core.config import Settings
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
            import ee
            self._ee = ee
            # Check if Earth Engine is already initialized
            try:
                ee.Initialize(project=self._settings.gee_project_id)
                self._ee_initialized = True
                logger.info("Google Earth Engine initialized with project %s", self._settings.gee_project_id)
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

    async def get_three_hourly(
        self,
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
        variables: list[str] | None = None,
    ) -> list[ThreeHourlyPoint]:
        days = (end_date - start_date).days + 1
        if days > self._settings.smap_gee_3hourly_max_days:
            raise InvalidRequestError(
                f"3-hourly queries are restricted to a maximum of {self._settings.smap_gee_3hourly_max_days} days "
                f"to prevent memory limits. Requested: {days} days."
            )
        if start_date < self._settings.smap_gee_earliest_date:
            raise InvalidRequestError(f"Start date cannot be before SMAP launch: {self._settings.smap_gee_earliest_date}")

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
    ) -> DarijaExplanationResponse:
        meta = get_variable_metadata(var_id)
        if meta is None:
            raise InvalidRequestError(f"Unknown SMAP variable '{var_id}'.")

        display_val_str = "غير متوفر"
        display_val_num = None
        if value is not None and not math.isnan(value):
            if meta.convert_raw_to_display:
                display_val_num = meta.convert_raw_to_display(value)
            else:
                display_val_num = round(value, 4)
            display_val_str = f"{display_val_num} {meta.display_unit}"

        # Dynamic interpretation in Moroccan Darija
        interpretation = self._build_darija_interpretation(meta, value, display_val_num)
        temporal_change = self._build_darija_temporal_change(meta, value, previous_value)

        return DarijaExplanationResponse(
            variable_id=meta.id,
            name_en=meta.name_en,
            name_fr=meta.name_fr,
            selected_value=value,
            display_value=display_val_str,
            display_unit=meta.display_unit,
            period=period,
            location_name=location_name,
            what=meta.darija_what,
            why_agri=meta.darija_why_agri,
            interpretation=interpretation,
            unit_explanation=meta.darija_unit,
            source=meta.darija_source,
            temporal_change=temporal_change,
            conclusions_allowed=meta.darija_conclusion_allowed,
            conclusions_forbidden=meta.darija_conclusion_forbidden,
            caveat_note=(
                "ملاحظة علمية: هاد القيم هي تقديرات قمر اصطناعي ونموذج هيدرولوجي على مساحة 9 إلى 11 كيلومتر، "
                "ماشي قياس مباشر من حساس وسط المزرعة."
            ),
        )

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

        # Build Earth Engine FeatureCollection
        def build_month_feature(m_info: dict[str, Any]):
            m_start = ee.Date(m_info["start_iso"])
            m_end = ee.Date(m_info["end_iso"])
            col = (
                ee.ImageCollection(self._settings.smap_l4_gee_dataset)
                .filterDate(m_start, m_end)
                .select(band_names)
            )
            stats = col.mean().reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=point,
                scale=scale,
                maxPixels=1e9,
            )
            feat = ee.Feature(None, stats)
            return feat.set({
                "year": m_info["year"],
                "month": m_info["month"],
                "count": col.size(),
                "start_date": m_info["start_iso"],
                "end_date": m_info["end_iso"],
            })

        fc = ee.FeatureCollection([build_month_feature(info) for info in month_intervals])
        raw_res = fc.getInfo()

        features = raw_res.get("features", [])

        # Process monthly points
        monthly_series: list[MonthlyObservationPoint] = []
        for feat in features:
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
                if val is not None and not math.isnan(val):
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
