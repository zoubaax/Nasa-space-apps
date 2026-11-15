"""Base agent abstraction and execution contract for FieldShift AI specialists."""

from __future__ import annotations

from abc import ABC, abstractmethod
import json
import logging
import re
import time
from typing import Any

import httpx

from app.core.config import Settings
from app.models.agents import AgentContext, AgentRole

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Abstract contract that every specialized domain sub-agent must implement."""

    agent_id: str
    agent_name: str
    avatar: str
    role: AgentRole

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @abstractmethod
    async def run(self, context: AgentContext) -> Any:
        """Executes domain-specific analysis and returns a typed specialist report."""
        pass

    async def _call_gemini(
        self,
        prompt: str,
        *,
        system_instruction: str | None = None,
        temperature: float = 0.1,
        response_mime: str = "application/json",
    ) -> dict[str, Any] | None:
        """Helper to invoke Google Gemini AI with strict response formatting and error handling."""
        if not self._settings.gemini_api_key:
            return None

        contents = []
        if system_instruction:
            contents.append({"role": "user", "parts": [{"text": f"SYSTEM INSTRUCTION:\n{system_instruction}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood. I will strictly follow these instructions and adhere to real observations."}]})

        contents.append({"role": "user", "parts": [{"text": prompt}]})

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": response_mime,
                "topP": 0.95,
            },
        }

        candidate_models = [self._settings.gemini_model, "gemini-flash-lite-latest", "gemini-2.5-flash"]
        for model_name in candidate_models:
            url = f"{self._settings.gemini_base_url}/models/{model_name}:generateContent?key={self._settings.gemini_api_key}"
            try:
                async with httpx.AsyncClient(timeout=self._settings.gemini_timeout_seconds) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                            cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text.strip(), flags=re.MULTILINE)
                            cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)
                            try:
                                return json.loads(cleaned, strict=False)
                            except Exception:
                                m = re.search(r"\{.*\}", cleaned, re.DOTALL)
                                if m:
                                    return json.loads(m.group(0), strict=False)
                    else:
                        logger.warning("[%s] Model %s returned status %s", self.agent_id, model_name, resp.status_code)
            except Exception as exc:
                logger.warning("[%s] Gemini call failed with %s: %s", self.agent_id, model_name, exc)

        return None
