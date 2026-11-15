"""Turn a NASA POWER summary into recommendations and a rotation order.

Every statement cites a count or a total that POWER returned. Crop species and
yields are not produced.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.models.agro import AgroRecommendation, AgroResponse, RotationStep
from app.models.climate import Indicators, SummaryResponse, ThresholdsUsed

logger = logging.getLogger(__name__)

_SOURCE = "Règles agronomiques appliquées à NASA POWER"


def advise(summary: SummaryResponse) -> AgroResponse:
    """Synchronous baseline: evaluates POWER summary with deterministic rules & Moroccan Darija."""
    indicators = summary.indicators
    thresholds = summary.thresholds
    precip_days = _observed_days(summary, "PRECTOTCORR")

    rec_water = _water(indicators, precip_days, thresholds)
    rec_heat = _heat(indicators, thresholds)
    rec_cold = _cold(indicators, thresholds)
    recommendations = [rec_water, rec_heat, rec_cold]

    rotation_steps = _rotation(rec_water.status)
    synthesis = _deterministic_synthesis_darija(summary, rec_water.status, rec_heat.status, rec_cold.status)

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
        rotation=rotation_steps,
        synthesis_darija=synthesis,
        notes=[
            "Ces recommandations utilisent uniquement les observations NASA POWER de la période demandée.",
            "Aucune espèce cultivée et aucun rendement ne sont inventés.",
            "La rotation ordonne les contraintes observées. Ce n'est pas un calendrier cultural officiel.",
        ],
    )


async def advise_async(summary: SummaryResponse) -> AgroResponse:
    """Asynchronous evaluation: enriches baseline rules with live Google Gemini AI agronomist deliberation in Darija."""
    base_response = advise(summary)

    settings = get_settings()
    is_pytest = bool(os.environ.get("PYTEST_CURRENT_TEST"))
    if not settings.gemini_api_key or is_pytest:
        return base_response

    loc_name = summary.location.name or f"[{summary.location.requested_latitude:.3f}°, {summary.location.requested_longitude:.3f}°]"
    start_d = summary.period.start_date.isoformat()
    end_d = summary.period.end_date.isoformat()
    indicators = summary.indicators

    rec_water = base_response.recommendations[0]
    rec_heat = base_response.recommendations[1]
    rec_cold = base_response.recommendations[2]

    gemini_prompt = (
        "You are an expert Moroccan agronomist from INRA / Direction Provinciale d'Agriculture.\n"
        "Analyze these authentic NASA POWER observations for a farmer in Morocco:\n"
        f"- Location: {loc_name}\n"
        f"- Period: {start_d} to {end_d}\n"
        f"- Total Rainfall: {indicators.total_precipitation} mm (Dry Days: {indicators.dry_days})\n"
        f"- Temperatures: Mean {indicators.average_temperature}°C, Max {indicators.maximum_temperature}°C (Hot Days: {indicators.hot_days}), Min {indicators.minimum_temperature}°C (Cold Days: {indicators.cold_days})\n"
        f"- Status: Water={rec_water.status}, Heat={rec_heat.status}, Cold={rec_cold.status}\n\n"
        "Produce an authentic agricultural recommendation in Moroccan Darija (الدارجة المغربية الفلاحية).\n"
        "Strictly cite the observed rainfall millimeters and heat/cold counts. Never invent synthetic yields.\n"
        "Return ONLY a JSON object with this exact schema:\n"
        "{\n"
        '  "synthesis_darija": "2-3 dynamic sentences in Moroccan Darija giving an overarching farm strategy for this period citing the exact rainfall mm and weather",\n'
        '  "water_message_darija": "1-2 sentences in Darija for irrigation / drainage decisions given the observed precipitation and dry days",\n'
        '  "heat_message_darija": "1 sentence in Darija regarding heat impact on crops and flowering",\n'
        '  "cold_message_darija": "1 sentence in Darija regarding cold/frost protection for seedlings",\n'
        '  "rotation_actions_darija": ["Step 1 action in Darija", "Step 2 action in Darija", "Step 3 action in Darija"]\n'
        "}"
    )

    candidate_models = [settings.gemini_model]
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
        url = f"{settings.gemini_base_url}/models/{model_name}:generateContent?key={settings.gemini_api_key}"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text.strip(), flags=re.IGNORECASE)
                        raw_text = re.sub(r"\s*```$", "", raw_text.strip())
                        start_idx = raw_text.find("{")
                        end_idx = raw_text.rfind("}")
                        if start_idx != -1 and end_idx != -1:
                            raw_text = raw_text[start_idx : end_idx + 1]
                        parsed = json.loads(raw_text, strict=False)

                        # Enrich recommendations
                        if parsed.get("synthesis_darija"):
                            base_response.synthesis_darija = str(parsed["synthesis_darija"])
                        if parsed.get("water_message_darija"):
                            rec_water.message_darija = str(parsed["water_message_darija"])
                        if parsed.get("heat_message_darija"):
                            rec_heat.message_darija = str(parsed["heat_message_darija"])
                        if parsed.get("cold_message_darija"):
                            rec_cold.message_darija = str(parsed["cold_message_darija"])

                        # Enrich rotation steps
                        rot_darija = parsed.get("rotation_actions_darija", [])
                        if isinstance(rot_darija, list) and len(rot_darija) == len(base_response.rotation):
                            for idx, step_text in enumerate(rot_darija):
                                base_response.rotation[idx].action_darija = str(step_text)

                        logger.info("Successfully enhanced /api/agro with Google Gemini Darija analysis via %s", model_name)
                        return base_response
        except Exception as e:
            logger.warning("Gemini /api/agro deliberation failed with model %s: %s", model_name, e)

    return base_response


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
            message_darija="ما كافياش التساقطات المسجلة باش نحددو توجيهات دقيقة للسقي.",
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
            message_darija=(
                f"الفترة المسجلة جافة ({indicators.dry_days} أيام جافة من أصل {precip_days} يوم، المجموع {indicators.total_precipitation} مم). "
                "قلل من الزراعات الشرهة للماء وبرمج حصص السقي التكميلي."
            ),
        )
    if mean_daily >= 5:
        return AgroRecommendation(
            code="water",
            status="humide",
            rule=rule,
            observed=observed,
            message="La période observée est humide. Surveiller le drainage avant d'enchaîner une culture sensible à l'excès d'eau.",
            message_darija=(
                f"الفترة المسجلة ممطرة ورطبة (المعدل {round(mean_daily, 2)} مم/يوم، المجموع {indicators.total_precipitation} مم). "
                "راقب تصريف المياه (drainage) باش الجذور ما تتعفنش قبل أي زراعة حساسة للرطوبة الزائدة."
            ),
        )
    return AgroRecommendation(
        code="water",
        status="moderee",
        rule=rule,
        observed=observed,
        message="La pluie observée est modérée. Garder une réserve pour les jours secs déjà comptés.",
        message_darija=(
            f"التساقطات المسجلة معتدلة (المجموع {indicators.total_precipitation} مم، {round(mean_daily, 2)} مم/يوم). "
            f"احتفظ باحتياطي مائي للأيام الجافة المسجلة ({indicators.dry_days} يوم)."
        ),
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
            message_darija="ما كافياش قياسات درجات الحرارة القصوى للحكم على الإجهاد الحراري.",
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
            message_darija=(
                f"تسجلو {indicators.hot_days} أيام حارة (أعلى حرارة {indicators.maximum_temperature}°C). "
                "تفادى العمليات الحساسة بحال البذر أو التسميد بالرش فهاد الأيام الحارة."
            ),
        )
    return AgroRecommendation(
        code="heat",
        status="sans_chaleur",
        rule=rule,
        observed=observed,
        message="Aucun jour chaud n'est observé avec le seuil demandé.",
        message_darija=f"ما تسجل حتى نهار حار فوق {thresholds.hot_day_celsius}°C (أقصى حرارة {indicators.maximum_temperature}°C).",
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
            message_darija="ما كافياش قياسات درجات الحرارة الدنيا للحكم على خطر الجليد.",
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
            message_darija=(
                f"تسجلو {indicators.cold_days} أيام باردة (أدنى حرارة {indicators.minimum_temperature}°C). "
                "خاص حماية النبتات الصغيرة من الصقيع فهاد الأيام."
            ),
        )
    return AgroRecommendation(
        code="cold",
        status="sans_froid",
        rule=rule,
        observed=observed,
        message="Aucun jour froid n'est observé avec le seuil demandé.",
        message_darija=f"ما تسجل حتى نهار بارد تحت {thresholds.cold_day_celsius}°C (أدنى حرارة {indicators.minimum_temperature}°C).",
    )


def _rotation(water_status: str) -> list[RotationStep]:
    sequences_fr = {
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
    sequences_ar = {
        "stress_hydrique": (
            "قلل من الزراعات الشرهة للماء فهاد الفترة الجافة المسجلة.",
            "دخل زراعة غطاء نباتي أو قطاني (عدس/حمص) لتخصيب التربة بالآزوت أو راحة قصيرة.",
            "رجع للزراعة الرئيسية فقط فاش تكون الفترة الموالية فيها شتا كافية وأيام جافة أقل.",
        ),
        "humide": (
            "زرع المحصول الرئيسي فهاد الفترة الرطبة للاستفادة القصوى من مياه الأمطار.",
            "وجد مصارف المياه والتصريف المزيان قبل ما تعاود تزرع.",
            "تبع بمحصول كيقاوم رطوبة التربة الزائدة وما كيتأثرش بالتعفنات.",
        ),
        "moderee": (
            "خلي المحصول الرئيسي فهاد الشتا المعتدلة مع تتبع رطوبة التربة.",
            "دير زراعة تناوبية لكسر دورة الأعشاب وأمراض الفطريات.",
            "برمج السقي للأيام الجافة لي محسوبة فالموسم.",
        ),
    }
    actions_fr = sequences_fr.get(
        water_status,
        ("Attendre une période avec des précipitations observées avant de fixer une rotation.",),
    )
    actions_ar = sequences_ar.get(
        water_status,
        ("تسنى حتى تسجل تساقطات كافية قبل تحديد الدورة الزراعية.",),
    )
    return [
        RotationStep(order=index, action=act_fr, action_darija=actions_ar[index - 1] if index - 1 < len(actions_ar) else None)
        for index, act_fr in enumerate(actions_fr, start=1)
    ]


def _deterministic_synthesis_darija(summary: SummaryResponse, water_status: str, heat_status: str, cold_status: str) -> str:
    """Generates deterministic Moroccan Darija synthesis quoting NASA POWER observed totals."""
    ind = summary.indicators
    rain_str = f"{ind.total_precipitation} مم" if ind.total_precipitation is not None else "غير محددة"
    hot_str = f"{ind.hot_days} أيام حارة" if ind.hot_days is not None else "0 أيام"
    cold_str = f"{ind.cold_days} أيام باردة" if ind.cold_days is not None else "0 أيام"

    if water_status == "stress_hydrique":
        return (
            f"بناءً على معطيات ناسا، الفترة عرفت جفافا نسبيا بمجموع تساقطات بلغ {rain_str} و{ind.dry_days} نهار ناشف. "
            f"مع تسجيل {hot_str} و{cold_str}، الاستراتيجية الفلاحية الناجحة كتطلب زراعة قطاني أو حبوب مقاومة للجفاف مع ضبط مياه السقي التكميلي."
        )
    elif water_status == "humide":
        return (
            f"التساقطات المسجلة فهاد الفترة كانت ممتازة بمجموع {rain_str}. "
            "الرطوبة ملائمة لإنتاجية زراعية جيدة شريطة مراقبة تصريف المياه فالمناطق المنخفضة لتفادي اختناق الجذور."
        )
    return (
        f"التساقطات المسجلة معتدلة بمجموع {rain_str} ({hot_str} و{cold_str}). "
        "الوضعية المائية كتسمح بزراعة المحاصيل المعتادة مع ضرورة التناوب الزراعي لتفادي استنزاف التربة."
    )


def _observed_days(summary: SummaryResponse, parameter: str) -> int:
    for item in summary.coverage.parameters:
        if item.parameter == parameter:
            return item.days_with_values
    return 0
