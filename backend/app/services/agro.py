"""Turn a NASA POWER summary into recommendations and a rotation order.

Every statement cites a count or a total that POWER returned. Crop species and
yields are not produced.
"""

from __future__ import annotations

from app.models.agro import AgroRecommendation, AgroResponse, RotationStep
from app.models.climate import Indicators, SummaryResponse, ThresholdsUsed

_SOURCE = "Règles agronomiques appliquées à NASA POWER"


def advise(summary: SummaryResponse) -> AgroResponse:
    indicators = summary.indicators
    thresholds = summary.thresholds
    precip_days = _observed_days(summary, "PRECTOTCORR")
    recommendations = [
        _water(indicators, precip_days, thresholds),
        _heat(indicators, thresholds),
        _cold(indicators, thresholds),
    ]
    return AgroResponse(
        source=_SOURCE,
        nasa_source=summary.source,
        nasa_request_url=summary.nasa_request_url,
        location=summary.location,
        period=summary.period,
        cached=summary.cached,
        retrieved_at=summary.retrieved_at,
        indicators=indicators,
        indicator_units=summary.indicator_units,
        recommendations=recommendations,
        rotation=_rotation(recommendations[0].status),
        notes=[
            "Ces recommandations utilisent uniquement les observations NASA POWER de la période demandée.",
            "Aucune espèce cultivée et aucun rendement ne sont inventés.",
            "La rotation ordonne les contraintes observées. Ce n'est pas un calendrier cultural officiel.",
        ],
    )


def _water(
    indicators: Indicators,
    precip_days: int,
    thresholds: ThresholdsUsed,
) -> AgroRecommendation:
    rule = (
        f"Stress hydrique si au moins la moitié des jours de pluie observés "
        f"sont secs (PRECTOTCORR < {thresholds.dry_day_precipitation_mm}). "
        "Période humide si la moyenne observée atteint 5 mm/jour."
    )
    if indicators.total_precipitation is None or indicators.dry_days is None or precip_days == 0:
        return AgroRecommendation(
            code="water",
            status="insuffisant",
            rule=rule,
            observed="Aucune précipitation observée sur la période.",
            message="Pas assez de pluie observée pour recommander une conduite de l'eau.",
        )
    dry_fraction = indicators.dry_days / precip_days
    mean_daily = indicators.total_precipitation / precip_days
    observed = (
        f"{indicators.dry_days} jours secs sur {precip_days} jours de pluie observés, "
        f"total {indicators.total_precipitation} mm, moyenne {round(mean_daily, 2)} mm/jour."
    )
    if dry_fraction >= 0.5:
        return AgroRecommendation(
            code="water",
            status="stress_hydrique",
            rule=rule,
            observed=observed,
            message="La période observée est sèche. Limiter les cultures à fort besoin en eau et prévoir l'irrigation.",
        )
    if mean_daily >= 5:
        return AgroRecommendation(
            code="water",
            status="humide",
            rule=rule,
            observed=observed,
            message="La période observée est humide. Surveiller le drainage avant d'enchaîner une culture sensible à l'excès d'eau.",
        )
    return AgroRecommendation(
        code="water",
        status="moderee",
        rule=rule,
        observed=observed,
        message="La pluie observée est modérée. Garder une réserve pour les jours secs déjà comptés.",
    )


def _heat(indicators: Indicators, thresholds: ThresholdsUsed) -> AgroRecommendation:
    rule = f"Chaleur signalée dès qu'un jour a T2M_MAX >= {thresholds.hot_day_celsius}."
    if indicators.hot_days is None or indicators.maximum_temperature is None:
        return AgroRecommendation(
            code="heat",
            status="insuffisant",
            rule=rule,
            observed="Température maximale non observée.",
            message="Pas assez de températures maximales pour juger la chaleur.",
        )
    observed = (
        f"{indicators.hot_days} jours chauds, maximum observé {indicators.maximum_temperature}."
    )
    if indicators.hot_days > 0:
        return AgroRecommendation(
            code="heat",
            status="chaleur",
            rule=rule,
            observed=observed,
            message="Des jours chauds sont observés. Éviter les opérations sensibles à la chaleur sur ces journées.",
        )
    return AgroRecommendation(
        code="heat",
        status="sans_chaleur",
        rule=rule,
        observed=observed,
        message="Aucun jour chaud n'est observé avec le seuil demandé.",
    )


def _cold(indicators: Indicators, thresholds: ThresholdsUsed) -> AgroRecommendation:
    rule = f"Froid signalé dès qu'un jour a T2M_MIN <= {thresholds.cold_day_celsius}."
    if indicators.cold_days is None or indicators.minimum_temperature is None:
        return AgroRecommendation(
            code="cold",
            status="insuffisant",
            rule=rule,
            observed="Température minimale non observée.",
            message="Pas assez de températures minimales pour juger le froid.",
        )
    observed = (
        f"{indicators.cold_days} jours froids, minimum observé {indicators.minimum_temperature}."
    )
    if indicators.cold_days > 0:
        return AgroRecommendation(
            code="cold",
            status="froid",
            rule=rule,
            observed=observed,
            message="Des jours froids sont observés. Protéger les jeunes cultures sur ces journées.",
        )
    return AgroRecommendation(
        code="cold",
        status="sans_froid",
        rule=rule,
        observed=observed,
        message="Aucun jour froid n'est observé avec le seuil demandé.",
    )


def _rotation(water_status: str) -> list[RotationStep]:
    sequences = {
        "stress_hydrique": (
            "Réduire les cultures à fort besoin en eau pendant la période sèche observée.",
            "Insérer une culture de couverture ou une courte jachère.",
            "Reprendre une culture principale seulement si une période suivante compte moins de jours secs.",
        ),
        "humide": (
            "Installer la culture principale pendant la période humide observée.",
            "Prévoir le drainage avant la culture suivante.",
            "Enchaîner avec une culture moins sensible à l'excès d'eau.",
        ),
        "moderee": (
            "Garder la culture principale sur cette pluviométrie modérée.",
            "Prévoir une culture de rupture pour ne pas répéter la même contrainte.",
            "Réserver l'irrigation aux jours secs déjà observés.",
        ),
    }
    actions = sequences.get(
        water_status,
        ("Attendre une période avec des précipitations observées avant de fixer une rotation.",),
    )
    return [RotationStep(order=index, action=action) for index, action in enumerate(actions, start=1)]


def _observed_days(summary: SummaryResponse, parameter: str) -> int:
    for item in summary.coverage.parameters:
        if item.parameter == parameter:
            return item.days_with_values
    return 0
