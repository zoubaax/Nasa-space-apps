"""Agricultural indicator calculations. Inputs are fixtures, not NASA downloads."""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from app.core.config import CLIMATE_PARAMETERS
from app.models.climate import Indicators
from app.services.climate_analyzer import (
    INDICATOR_DEFINITIONS,
    missing_value_counts,
    normalize_power_payload,
    summarize,
    to_csv,
)
from tests.sample_payload import build_sample_payload

START = date(2025, 1, 1)
END = date(2025, 1, 3)


def _summary(**thresholds):
    series = normalize_power_payload(build_sample_payload(), start_date=START, end_date=END)
    result = summarize(
        series.frame,
        start_date=START,
        end_date=END,
        units=series.units,
        hot_day_celsius=thresholds.get("hot", 30),
        cold_day_celsius=thresholds.get("cold", 5),
        dry_day_precipitation_mm=thresholds.get("dry", 1),
    )
    return series, result


def test_indicator_math_skips_missing_observations() -> None:
    _series, result = _summary()
    indicators = result.indicators

    assert indicators.average_temperature == 15
    assert indicators.minimum_temperature == -1
    assert indicators.maximum_temperature == 36
    assert indicators.total_precipitation == 5
    assert indicators.average_relative_humidity == 60
    assert indicators.average_wind_speed == 3
    assert indicators.average_solar_radiation == 15
    assert indicators.dry_days == 1
    assert indicators.hot_days == 1
    assert indicators.cold_days == 2
    assert result.indicator_units["average_temperature"] == "C"
    assert result.indicator_units["total_precipitation"] == "mm/day"
    assert result.indicator_units["average_solar_radiation"] == "MJ/m^2/day"
    assert result.indicator_units["dry_days"] == "days"

    precipitation = next(
        item for item in result.coverage.parameters if item.parameter == "PRECTOTCORR"
    )
    assert precipitation.complete is False
    assert precipitation.days_with_values == 2
    assert precipitation.days_missing == 1
    assert any("not treated as zero" in note for note in result.notes)


def test_thresholds_change_day_counts() -> None:
    _series, result = _summary(hot=40, cold=-10, dry=0)

    assert result.indicators.hot_days == 0
    assert result.indicators.cold_days == 0
    assert result.indicators.dry_days == 0


def test_missing_temperature_is_not_estimated_from_min_and_max() -> None:
    frame = _frame(
        T2M=[None, None],
        T2M_MAX=[31.0, 10.0],
        T2M_MIN=[1.0, -4.0],
        PRECTOTCORR=[None, None],
    )
    result = summarize(
        frame,
        start_date=START,
        end_date=date(2025, 1, 2),
        units={"T2M_MAX": "C", "T2M_MIN": "C"},
        hot_day_celsius=30,
        cold_day_celsius=5,
        dry_day_precipitation_mm=1,
    )

    assert result.indicators.average_temperature is None
    assert result.indicators.minimum_temperature == -4
    assert result.indicators.maximum_temperature == 31
    assert result.indicators.total_precipitation is None
    assert result.indicators.dry_days is None
    assert result.indicators.hot_days == 1
    assert result.indicators.cold_days == 2


def test_zero_is_a_real_observation() -> None:
    frame = _frame(T2M=[0.0, 10.0], PRECTOTCORR=[0.0, 0.2])
    result = summarize(
        frame,
        start_date=START,
        end_date=date(2025, 1, 2),
        units={"T2M": "C", "PRECTOTCORR": "mm/day"},
        hot_day_celsius=30,
        cold_day_celsius=5,
        dry_day_precipitation_mm=1,
    )

    assert result.indicators.average_temperature == 5
    assert result.indicators.total_precipitation == pytest.approx(0.2)
    assert result.indicators.dry_days == 2


def test_absent_dates_are_reported_and_not_filled() -> None:
    series = normalize_power_payload(
        build_sample_payload(),
        start_date=START,
        end_date=date(2025, 1, 4),
    )
    result = summarize(
        series.frame,
        start_date=START,
        end_date=date(2025, 1, 4),
        units=series.units,
        hot_day_celsius=30,
        cold_day_celsius=5,
        dry_day_precipitation_mm=1,
    )

    assert result.coverage.returned_day_count == 3
    assert result.coverage.dates_not_returned == [date(2025, 1, 4)]
    assert result.indicators.average_temperature == 15
    counts = missing_value_counts(series.frame, requested_day_count=4)
    assert counts["T2M"] == 2


def test_definitions_cover_every_indicator() -> None:
    names = {item.name for item in INDICATOR_DEFINITIONS}
    assert names == set(Indicators.model_fields)
    assert len(INDICATOR_DEFINITIONS) == 10
    for item in INDICATOR_DEFINITIONS:
        assert item.parameter in CLIMATE_PARAMETERS
        assert item.formula
        assert "null" in item.missing_policy or "excluded" in item.missing_policy


def test_csv_leaves_missing_observations_blank() -> None:
    series = normalize_power_payload(build_sample_payload(), start_date=START, end_date=END)
    text = to_csv(series.frame)
    lines = text.splitlines()

    assert lines[0] == (
        "date,T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN"
    )
    assert "-999" not in text
    missing_temperature = lines[2].split(",")
    assert missing_temperature[0] == "2025-01-02"
    assert missing_temperature[1] == ""
    assert missing_temperature[7] == ""


def _frame(**columns) -> pd.DataFrame:
    count = len(next(iter(columns.values())))
    data = {
        "date": [f"2025-01-0{index + 1}" for index in range(count)],
    }
    for name in CLIMATE_PARAMETERS:
        data[name] = columns.get(name, [None] * count)
    return pd.DataFrame(data)
