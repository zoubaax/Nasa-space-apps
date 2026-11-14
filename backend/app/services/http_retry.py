"""HTTP GET helper that retries only transient failures."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

import httpx

from app.core.exceptions import ClimateServiceError

logger = logging.getLogger(__name__)

_MESSAGE_LIMIT = 400


@dataclass(frozen=True)
class RetryPolicy:
    service_name: str
    max_retries: int
    base_seconds: float
    max_seconds: float
    timeout_error: type[ClimateServiceError]
    rate_limit_error: type[ClimateServiceError]
    network_error: type[ClimateServiceError]
    http_error: type[ClimateServiceError]


def extract_message(response: httpx.Response, limit: int = _MESSAGE_LIMIT) -> str:
    """Read a short error message from a JSON or text body."""
    text = ""
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if isinstance(payload, dict):
        for key in ("message", "reason", "error"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                text = value.strip()
                break
        if not text:
            messages = payload.get("messages")
            if isinstance(messages, list):
                parts = [str(item).strip() for item in messages if str(item).strip()]
                text = " ".join(parts)
    if not text:
        text = " ".join(response.text.split())
    if len(text) > limit:
        return text[:limit].rstrip() + "..."
    return text


def _retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("Retry-After")
    if raw is None:
        return None
    try:
        seconds = float(raw.strip())
    except ValueError:
        return None
    if seconds < 0:
        return None
    return seconds


async def get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict[str, str],
    headers: dict[str, str],
    policy: RetryPolicy,
    timeout: float | httpx.Timeout | None = None,
) -> httpx.Response:
    """GET a URL, retrying timeouts, connection errors, HTTP 408/429, and 5xx responses.

    Completed 4xx responses other than 408 and 429 are returned immediately so
    invalid requests are not sent again.
    """
    attempts = policy.max_retries + 1
    delay = max(policy.base_seconds, 0.0)

    for attempt in range(attempts):
        try:
            response = await client.get(url, params=params, headers=headers, timeout=timeout)
        except httpx.TimeoutException as exc:
            if attempt == attempts - 1:
                raise policy.timeout_error(
                    f"{policy.service_name} timed out after {attempts} attempts.",
                    details={"attempts": attempts},
                ) from exc
            logger.warning(
                "%s timeout on attempt %s/%s",
                policy.service_name,
                attempt + 1,
                attempts,
            )
            await asyncio.sleep(delay)
            delay = _next_delay(delay, policy.max_seconds)
            continue
        except httpx.RequestError as exc:
            if attempt == attempts - 1:
                raise policy.network_error(
                    f"Could not reach {policy.service_name} after {attempts} attempts "
                    f"({exc.__class__.__name__}).",
                    details={"attempts": attempts},
                ) from exc
            logger.warning(
                "%s network error on attempt %s/%s: %s",
                policy.service_name,
                attempt + 1,
                attempts,
                exc.__class__.__name__,
            )
            await asyncio.sleep(delay)
            delay = _next_delay(delay, policy.max_seconds)
            continue

        status = response.status_code
        if status < 400:
            return response
        if status not in {408, 429} and status < 500:
            return response

        message = extract_message(response)
        if attempt == attempts - 1:
            details = {"upstream_status": status, "attempts": attempts}
            if status == 429:
                suffix = f" {message}" if message else ""
                raise policy.rate_limit_error(
                    f"{policy.service_name} rate limit exceeded after {attempts} attempts.{suffix}",
                    details=details,
                )
            suffix = f" {message}" if message else ""
            raise policy.http_error(
                f"{policy.service_name} returned HTTP {status} after {attempts} attempts.{suffix}",
                details=details,
            )

        retry_after = _retry_after_seconds(response)
        sleep_for = delay if retry_after is None else min(retry_after, policy.max_seconds)
        logger.warning(
            "%s HTTP %s on attempt %s/%s; retrying in %.2fs",
            policy.service_name,
            status,
            attempt + 1,
            attempts,
            sleep_for,
        )
        await asyncio.sleep(max(sleep_for, 0.0))
        delay = _next_delay(delay, policy.max_seconds)

    raise policy.network_error(
        f"Could not reach {policy.service_name}.",
        details={"attempts": attempts},
    )


def _next_delay(current: float, maximum: float) -> float:
    if maximum <= 0:
        return 0.0
    return min(max(current, 0.0) * 2, maximum)
