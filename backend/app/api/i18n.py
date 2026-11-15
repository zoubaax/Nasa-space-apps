"""FastAPI route for Dynamic i18n Translation."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_i18n_service
from app.models.i18n import TranslationRequest, TranslationResponse
from app.services.i18n_service import I18nTranslationService

router = APIRouter(prefix="/api/i18n", tags=["i18n"])


@router.post("/translate", response_model=TranslationResponse)
async def translate_strings(
    request: TranslationRequest,
    service: I18nTranslationService = Depends(get_i18n_service),
) -> TranslationResponse:
    """Translate UI dictionary strings dynamically using Gemini AI with local disk caching."""
    return await service.translate(request)
