"""Validate NASA POWER payloads and calculate agricultural indicators.

Daily observations are taken only from the NASA response. Fill values become
null. Indicator math skips those nulls and never fills them with zero or with
an estimated temperature, rainfall, humidity, wind, or radiation value.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import pandas as pd

from app.core.config import CLIMATE_PARAMETERS
from app.core.exceptions import NasaDataError
from app.models.climate import (
    Coverage,
    IndicatorDefinition,
    Indicators,
    ParameterCoverage,
    ThresholdsUsed,
)

HOT_DAY_RULE = "Count days where observed T2M_MAX is greater than or equal to hot_day_celsius."
COLD_DAY_RULE = "Count days where observed T2M_MIN is less than or equal to cold_day_celsius."
DRY_DAY_RULE = (
    "Count days where observed PRECTOTCORR is strictly below dry_day_precipitation_mm."
)

INDICATOR_DEFINITIONS: tuple[IndicatorDefinition, ...] = (
    IndicatorDefinition(
        name="average_temperature",
        parameter="T2M",
        description="Average of the daily mean 2-meter air temperature.",
        formula="mean(observed T2M)",
        missing_policy=(
            "Days without T2M are excluded. The result is null when no T2M observations "
            "are available. T2M is never estimated from T2M_MIN and T2M_MAX."
        ),
    ),
    IndicatorDefinition(
        name="minimum_temperature",
        parameter="T2M_MIN",
        description="Lowest observed daily minimum 2-meter temperature.",
        formula="min(observed T2M_MIN)",
        missing_policy="Days without T2M_MIN are excluded. The result is null when none remain.",
    ),
    IndicatorDefinition(
        name="maximum_temperature",
        parameter="T2M_MAX",
        description="Highest observed daily maximum 2-meter temperature.",
        formula="max(observed T2M_MAX)",
        missing_policy="Days without T2M_MAX are excluded. The result is null when none remain.",
    ),
    IndicatorDefinition(
        name="total_precipitation",
        parameter="PRECTOTCORR",
        description="Sum of observed corrected daily precipitation.",
        formula="sum(observed PRECTOTCORR)",
        missing_policy=(
            "Days without PRECTOTCORR are left out of the sum and are not treated as zero. "
            "The result is null when no precipitation observations are available."
        ),
    ),
    IndicatorDefinition(
        name="average_relative_humidity",
        parameter="RH2M",
        description="Average of the daily mean 2-meter relative humidity.",
        formula="mean(observed RH2M)",
        missing_policy="Days without RH2M are excluded. The result is null when none remain.",
    ),
    IndicatorDefinition(
        name="average_wind_speed",
        parameter="WS2M",
        description="Average of the daily mean 2-meter wind speed.",
        formula="mean(observed WS2M)",
        missing_policy="Days without WS2M are excluded. The result is null when none remain.",
    ),
    IndicatorDefinition(
        name="average_solar_radiation",
        parameter="ALLSKY_SFC_SW_DWN",
        description="Average of the daily all-sky surface shortwave downward irradiance.",
        formula="mean(observed ALLSKY_SFC_SW_DWN)",
        missing_policy=(
            "Days without ALLSKY_SFC_SW_DWN are excluded. The result is null when none remain. "
            "The value is kept in the unit NASA POWER reported for this response."
        ),
    ),
    IndicatorDefinition(
        name="dry_days",
        parameter="PRECTOTCORR",
        description="Number of observed days with precipitation below the dry-day threshold.",
        formula="count(observed PRECTOTCORR < dry_day_precipitation_mm)",
        missing_policy=(
            "Only days with an observed PRECTOTCORR value are classified. "
            "A missing day is not counted as dry. The result is null when no precipitation "
            "observations are available."
        ),
    ),
    IndicatorDefinition(
        name="hot_days",
        parameter="T2M_MAX",
        description="Number of observed days that reached the hot-day temperature threshold.",
        formula="count(observed T2M_MAX >= hot_day_celsius)",
        missing_policy=(
            "Only days with an observed T2M_MAX value are classified. "
            "The result is null when no T2M_MAX observations are available."
        ),
    ),
    IndicatorDefinition(
        name="cold_days",
        parameter="T2M_MIN",
        description="Number of observed days at or below the cold-day temperature threshold.",
        formula="count(observed T2M_MIN <= cold_day_celsius)",
        missing_policy=(
            "Only days with an observed T2M_MIN value are classified. "
            "The result is null when no T2M_MIN observations are available."
        ),
    ),
)

_DATE_FORMAT = "%Y%m%d"


@dataclass
class NormalizedSeries:
    frame: pd.DataFrame
    units: dict[str, str]
    long_names: dict[str, str]
    fill_value: float
    nasa_messages: list[str]
    grid_latitude: float | None
    grid_longitude: float | None
    grid_elevation_m: float | None
    source_title: str | None
    nasa_start: str | None
    nasa_end: str | None
    notes: list[str]


@dataclass
class AnalysisResult:
    indicators: Indicators
    indicator_units: dict[str, str | None]
    definitions: list[IndicatorDefinition]
    coverage: Coverage
    thresholds: ThresholdsUsed
    notes: list[str]


def iter_dates(start_date: date, end_date: date) -> list[date]:
    count = (end_date - start_date).days + 1
    return [start_date + timedelta(days=offset) for offset in range(count)]


def normalize_power_payload(
    payload: dict,
    *,
    parameters: tuple[str, ...] = CLIMATE_PARAMETERS,
    start_date: date,
    end_date: date,
) -> NormalizedSeries:
    """Turn a NASA POWER daily JSON document into a dataframe of observed values."""
    if not isinstance(payload, dict):
        raise NasaDataError("NASA POWER response was not a JSON object.")

    properties = payload.get("properties")
    if not isinstance(properties, dict):
        message = _payload_error_message(payload)
        raise NasaDataError(
            message or "NASA POWER response did not include properties.parameter.",
            code="nasa_empty" if message else "nasa_invalid_payload",
        )

    parameter = properties.get("parameter")
    if not isinstance(parameter, dict) or not parameter:
        message = _payload_error_message(payload)
        raise NasaDataError(
            message or "NASA POWER returned no parameter values for this request.",
            code="nasa_empty",
        )

    fill_value = _read_fill_value(payload)
    allowed = set(iter_dates(start_date, end_date))
    columns: dict[str, dict[date, float | None]] = {name: {} for name in parameters}
    outside: set[date] = set()
    invalid_keys = 0

    for name in parameters:
        series = parameter.get(name)
        if not isinstance(series, dict):
            continue
        for raw_date, raw_value in series.items():
            parsed = _parse_power_date(raw_date)
            if parsed is None:
                invalid_keys += 1
                continue
            if parsed not in allowed:
                outside.add(parsed)
                continue
            columns[name][parsed] = _clean_value(raw_value, fill_value)

    observed_days = sorted({day for series in columns.values() for day in series})
    if not observed_days:
        raise NasaDataError(
            "NASA POWER returned no daily observations inside the requested period.",
            code="nasa_empty",
        )

    rows: list[dict[str, object]] = []
    for day in observed_days:
        row: dict[str, object] = {"date": day.isoformat()}
        for name in parameters:
            row[name] = columns[name].get(day)
        rows.append(row)

    frame = pd.DataFrame(rows, columns=["date", *parameters])
    units, long_names = _read_parameter_metadata(payload, parameters)
    notes: list[str] = []
    if outside:
        notes.append(
            f"Ignored observations on {len(outside)} date(s) outside the requested period."
        )
    if invalid_keys:
        notes.append(f"Ignored {invalid_keys} NASA value(s) with an unrecognized date key.")

    grid_longitude, grid_latitude, grid_elevation = _read_geometry(payload)
    header = payload.get("header") if isinstance(payload.get("header"), dict) else {}

    return NormalizedSeries(
        frame=frame,
        units=units,
        long_names=long_names,
        fill_value=fill_value,
        nasa_messages=_read_messages(payload),
        grid_latitude=grid_latitude,
        grid_longitude=grid_longitude,
        grid_elevation_m=grid_elevation,
        source_title=_text(header.get("title")),
        nasa_start=_text(header.get("start")),
        nasa_end=_text(header.get("end")),
        notes=notes,
    )


def summarize(
    frame: pd.DataFrame,
    *,
    start_date: date,
    end_date: date,
    units: dict[str, str],
    hot_day_celsius: float,
    cold_day_celsius: float,
    dry_day_precipitation_mm: float,
) -> AnalysisResult:
    """Calculate agricultural indicators from an already normalized dataframe."""
    requested_days = iter_dates(start_date, end_date)
    requested_count = len(requested_days)
    returned_iso = set(frame["date"].astype(str)) if "date" in frame.columns else set()
    dates_not_returned = [day for day in requested_days if day.isoformat() not in returned_iso]

    coverage_rows = [
        _coverage(frame, name, requested_count) for name in CLIMATE_PARAMETERS
    ]
    coverage = Coverage(
        requested_day_count=requested_count,
        returned_day_count=int(frame.shape[0]),
        dates_not_returned=dates_not_returned,
        parameters=coverage_rows,
    )
    by_parameter = {row.parameter: row for row in coverage_rows}

    t2m = _observed(frame, "T2M")
    t2m_max = _observed(frame, "T2M_MAX")
    t2m_min = _observed(frame, "T2M_MIN")
    precipitation = _observed(frame, "PRECTOTCORR")
    humidity = _observed(frame, "RH2M")
    wind = _observed(frame, "WS2M")
    solar = _observed(frame, "ALLSKY_SFC_SW_DWN")

    indicators = Indicators(
        average_temperature=_mean(t2m),
        minimum_temperature=_minimum(t2m_min),
        maximum_temperature=_maximum(t2m_max),
        total_precipitation=_sum(precipitation),
        average_relative_humidity=_mean(humidity),
        average_wind_speed=_mean(wind),
        average_solar_radiation=_mean(solar),
        dry_days=_count_below(precipitation, dry_day_precipitation_mm),
        hot_days=_count_at_least(t2m_max, hot_day_celsius),
        cold_days=_count_at_most(t2m_min, cold_day_celsius),
    )

    indicator_units = {
        "average_temperature": units.get("T2M"),
        "minimum_temperature": units.get("T2M_MIN"),
        "maximum_temperature": units.get("T2M_MAX"),
        "total_precipitation": units.get("PRECTOTCORR"),
        "average_relative_humidity": units.get("RH2M"),
        "average_wind_speed": units.get("WS2M"),
        "average_solar_radiation": units.get("ALLSKY_SFC_SW_DWN"),
        "dry_days": "days",
        "hot_days": "days",
        "cold_days": "days",
    }

    notes = _analysis_notes(
        indicators=indicators,
        coverage=by_parameter,
        units=units,
    )
    return AnalysisResult(
        indicators=indicators,
        indicator_units=indicator_units,
        definitions=[item.model_copy() for item in INDICATOR_DEFINITIONS],
        coverage=coverage,
        thresholds=ThresholdsUsed(
            hot_day_celsius=hot_day_celsius,
            cold_day_celsius=cold_day_celsius,
            dry_day_precipitation_mm=dry_day_precipitation_mm,
            hot_day_rule=HOT_DAY_RULE,
            cold_day_rule=COLD_DAY_RULE,
            dry_day_rule=DRY_DAY_RULE,
        ),
        notes=notes,
    )


def to_csv(frame: pd.DataFrame) -> str:
    """Serialize normalized observations. Empty cells are missing values, not zero."""
    buffer = io.StringIO()
    frame.to_csv(buffer, index=False, na_rep="", lineterminator="\n")
    return buffer.getvalue()


def missing_value_counts(frame: pd.DataFrame, requested_day_count: int) -> dict[str, int]:
    counts: dict[str, int] = {}
    for name in CLIMATE_PARAMETERS:
        present = 0 if name not in frame.columns else int(_observed(frame, name).shape[0])
        counts[name] = requested_day_count - present
    return counts


def records_from_frame(frame: pd.DataFrame) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for row in frame.to_dict(orient="records"):
        item: dict[str, object] = {}
        for column, value in row.items():
            if column == "date":
                item[column] = "" if value is None else str(value)
            else:
                item[column] = _json_number(value)
        records.append(item)
    return records


def _coverage(frame: pd.DataFrame, column: str, requested_count: int) -> ParameterCoverage:
    days_with_values = int(_observed(frame, column).shape[0])
    return ParameterCoverage(
        parameter=column,
        days_with_values=days_with_values,
        days_missing=requested_count - days_with_values,
        complete=requested_count > 0 and days_with_values == requested_count,
    )


def _observed(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(dtype="float64")
    return pd.to_numeric(frame[column], errors="coerce").dropna()


def _mean(series: pd.Series) -> float | None:
    if series.empty:
        return None
    return round(float(series.mean()), 4)


def _sum(series: pd.Series) -> float | None:
    if series.empty:
        return None
    return round(float(series.sum()), 4)


def _minimum(series: pd.Series) -> float | None:
    if series.empty:
        return None
    return round(float(series.min()), 4)


def _maximum(series: pd.Series) -> float | None:
    if series.empty:
        return None
    return round(float(series.max()), 4)


def _count_below(series: pd.Series, threshold: float) -> int | None:
    if series.empty:
        return None
    return int((series < threshold).sum())


def _count_at_least(series: pd.Series, threshold: float) -> int | None:
    if series.empty:
        return None
    return int((series >= threshold).sum())


def _count_at_most(series: pd.Series, threshold: float) -> int | None:
    if series.empty:
        return None
    return int((series <= threshold).sum())


def _analysis_notes(
    *,
    indicators: Indicators,
    coverage: dict[str, ParameterCoverage],
    units: dict[str, str],
) -> list[str]:
    notes = [
        "Temperature thresholds are Celsius values applied to the numeric T2M_MIN and T2M_MAX "
        "observations. The AG community publishes those parameters in Celsius. "
        "No unit conversion is performed.",
        "The dry-day threshold is compared with PRECTOTCORR in the unit NASA returned, "
        "which is millimeters per day for the AG community.",
    ]
    precipitation = coverage["PRECTOTCORR"]
    if indicators.total_precipitation is None:
        notes.append("total_precipitation is null because no PRECTOTCORR observations were returned.")
    elif not precipitation.complete:
        notes.append(
            "total_precipitation sums observed PRECTOTCORR values only. "
            f"{precipitation.days_missing} requested day(s) had no precipitation observation "
            "and were not treated as zero."
        )
    if indicators.dry_days is not None and not precipitation.complete:
        notes.append(
            "dry_days counts only days with an observed precipitation total. "
            "Days with missing precipitation are omitted, not classified as dry."
        )
    if indicators.hot_days is not None and not coverage["T2M_MAX"].complete:
        notes.append("hot_days ignores days where T2M_MAX was missing.")
    if indicators.cold_days is not None and not coverage["T2M_MIN"].complete:
        notes.append("cold_days ignores days where T2M_MIN was missing.")

    max_unit = units.get("T2M_MAX")
    min_unit = units.get("T2M_MIN")
    precip_unit = units.get("PRECTOTCORR")
    if max_unit and "C" not in max_unit.upper():
        notes.append(
            f"T2M_MAX was reported in '{max_unit}', so the hot-day threshold was applied "
            "numerically without converting units."
        )
    if min_unit and "C" not in min_unit.upper():
        notes.append(
            f"T2M_MIN was reported in '{min_unit}', so the cold-day threshold was applied "
            "numerically without converting units."
        )
    if precip_unit and "mm" not in precip_unit.lower():
        notes.append(
            f"PRECTOTCORR was reported in '{precip_unit}', so the dry-day threshold was applied "
            "numerically without converting units."
        )
    return notes


def _parse_power_date(raw_date: object) -> date | None:
    if not isinstance(raw_date, str) or len(raw_date) != 8 or not raw_date.isdigit():
        return None
    try:
        return datetime.strptime(raw_date, _DATE_FORMAT).date()
    except ValueError:
        return None


def _clean_value(raw_value: object, fill_value: float) -> float | None:
    if raw_value is None or isinstance(raw_value, bool):
        return None
    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        return None
    if math.isnan(value) or math.isinf(value):
        return None
    if math.isclose(value, fill_value, rel_tol=0.0, abs_tol=1e-6):
        return None
    return value


def _read_fill_value(payload: dict) -> float:
    header = payload.get("header")
    raw = -999.0
    if isinstance(header, dict) and "fill_value" in header:
        raw = header.get("fill_value", -999.0)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return -999.0


def _read_parameter_metadata(
    payload: dict,
    parameters: tuple[str, ...],
) -> tuple[dict[str, str], dict[str, str]]:
    units: dict[str, str] = {}
    long_names: dict[str, str] = {}
    metadata = payload.get("parameters")
    if not isinstance(metadata, dict):
        return units, long_names
    for name in parameters:
        item = metadata.get(name)
        if not isinstance(item, dict):
            continue
        unit = _text(item.get("units"))
        long_name = _text(item.get("longname"))
        if unit:
            units[name] = unit
        if long_name:
            long_names[name] = long_name
    return units, long_names


def _read_geometry(payload: dict) -> tuple[float | None, float | None, float | None]:
    geometry = payload.get("geometry")
    if not isinstance(geometry, dict):
        return None, None, None
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return None, None, None
    try:
        longitude = float(coordinates[0])
        latitude = float(coordinates[1])
    except (TypeError, ValueError):
        return None, None, None
    elevation = None
    if len(coordinates) >= 3 and coordinates[2] is not None:
        try:
            elevation = float(coordinates[2])
        except (TypeError, ValueError):
            elevation = None
    return longitude, latitude, elevation


def _read_messages(payload: dict) -> list[str]:
    messages: list[str] = []
    raw_messages = payload.get("messages")
    if isinstance(raw_messages, list):
        messages.extend(_message_text(item) for item in raw_messages)
    elif isinstance(raw_messages, str):
        messages.append(raw_messages)
    header = payload.get("header")
    if isinstance(header, dict):
        header_messages = header.get("messages")
        if isinstance(header_messages, list):
            messages.extend(_message_text(item) for item in header_messages)
    return [message for message in messages if message]


def _payload_error_message(payload: dict) -> str | None:
    for key in ("message", "reason", "error"):
        text = _text(payload.get(key))
        if text:
            return text
    messages = _read_messages(payload)
    if messages:
        return " ".join(messages)
    return None


def _message_text(item: object) -> str:
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, dict):
        for key in ("message", "description", "reason"):
            text = _text(item.get(key))
            if text:
                return text
        return ""
    if item is None:
        return ""
    return str(item).strip()


def _text(value: object) -> str | None:
    if isinstance(value, str):
        text = value.strip()
        return text or None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return None


def _json_number(value: object) -> float | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except TypeError:
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    if math.isnan(number) or math.isinf(number):
        return None
    return number
