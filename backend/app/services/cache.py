"""File cache for raw NASA JSON, normalized CSV, and geocoding results."""

from __future__ import annotations

import hashlib
import json
import logging
import math
import re
from datetime import date
from pathlib import Path

logger = logging.getLogger(__name__)


class FileCache:
    """Store cache files under ``data/raw``, ``data/processed``, and ``data/geocode``."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.raw_dir = root / "raw"
        self.processed_dir = root / "processed"
        self.geocode_dir = root / "geocode"
        self.smap_dir = root / "smap"
        self.smap_gee_dir = root / "smap_gee"
        for directory in (self.raw_dir, self.processed_dir, self.geocode_dir, self.smap_dir, self.smap_gee_dir):
            directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def climate_key(
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
        parameters: tuple[str, ...] | list[str],
        community: str,
        time_standard: str,
    ) -> str:
        identity = "|".join(
            [
                community,
                time_standard,
                f"{latitude:.4f}",
                f"{longitude:.4f}",
                start_date.isoformat(),
                end_date.isoformat(),
                ",".join(parameters),
            ]
        )
        digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
        return (
            f"{latitude:.4f}_{longitude:.4f}_"
            f"{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}_{digest}"
        )

    @staticmethod
    def geocode_key(city: str) -> str:
        normalized = " ".join(city.casefold().split())
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]

    def raw_path(self, key: str) -> Path:
        return self.raw_dir / f"{key}.json"

    def meta_path(self, key: str) -> Path:
        return self.raw_dir / f"{key}.meta.json"

    def csv_path(self, key: str) -> Path:
        return self.processed_dir / f"{key}.csv"

    def geocode_path(self, city: str) -> Path:
        return self.geocode_dir / f"{self.geocode_key(city)}.json"

    @staticmethod
    def reverse_geocode_key(latitude: float, longitude: float) -> str:
        return f"rev_{latitude:.4f}_{longitude:.4f}"

    def reverse_geocode_path(self, latitude: float, longitude: float) -> Path:
        return self.geocode_dir / f"{self.reverse_geocode_key(latitude, longitude)}.json"

    def smap_path(self, key: str) -> Path:
        return self.smap_dir / f"{key}.json"

    def smap_gee_path(self, key: str) -> Path:
        return self.smap_gee_dir / f"{key}.json"

    @staticmethod
    def smap_gee_key(
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
        mode: str,
        scale: int,
    ) -> str:
        identity = f"{latitude:.4f}|{longitude:.4f}|{start_date.isoformat()}|{end_date.isoformat()}|{mode}|{scale}"
        digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
        return f"smap_gee_{latitude:.4f}_{longitude:.4f}_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}_{mode}_{digest}"

    def find_matching_raw(
        self,
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
    ) -> Path | None:
        """Find an existing NASA POWER raw file on the native MERRA-2 / GEOS grid (0.5° lat × 0.625° lon)."""
        start_str = start_date.strftime("%Y%m%d")
        end_str = end_date.strftime("%Y%m%d")
        best_path: Path | None = None
        best_dist = float("inf")
        best_dlat = 0.0
        best_dlon = 0.0

        # Native NASA POWER grid cell half-dimensions
        max_dlat = 0.25
        max_dlon = 0.3125

        pattern = re.compile(r"^([+-]?\d+\.\d+)_([+-]?\d+\.\d+)_(\d{8})_(\d{8})_[0-9a-f]+\.json$")
        for file_path in self.raw_dir.glob("*.json"):
            if file_path.name.endswith(".meta.json"):
                continue
            m = pattern.match(file_path.name)
            if not m:
                continue
            f_lat, f_lon, f_start, f_end = float(m.group(1)), float(m.group(2)), m.group(3), m.group(4)
            if f_start == start_str and f_end == end_str:
                dlat = abs(latitude - f_lat)
                dlon = abs(longitude - f_lon)
                if dlat <= max_dlat and dlon <= max_dlon:
                    dist = math.hypot(dlat, dlon)
                    if dist < best_dist:
                        best_dist = dist
                        best_dlat = dlat
                        best_dlon = dlon
                        best_path = file_path
        if best_path:
            logger.info("Found native-grid matching NASA POWER cache: %s (cell delta: lat=%.4f°, lon=%.4f°)", best_path.name, best_dlat, best_dlon)
        return best_path

    def find_nearest_raw(
        self,
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
    ) -> Path | None:
        """Find the geographically closest NASA POWER raw file for the requested date window."""
        start_str = start_date.strftime("%Y%m%d")
        end_str = end_date.strftime("%Y%m%d")
        best_path: Path | None = None
        best_dist = float("inf")

        pattern = re.compile(r"^([+-]?\d+\.\d+)_([+-]?\d+\.\d+)_(\d{8})_(\d{8})_[0-9a-f]+\.json$")
        for file_path in self.raw_dir.glob("*.json"):
            if file_path.name.endswith(".meta.json"):
                continue
            m = pattern.match(file_path.name)
            if not m:
                continue
            f_lat, f_lon, f_start, f_end = float(m.group(1)), float(m.group(2)), m.group(3), m.group(4)
            if f_start == start_str and f_end == end_str:
                dlat = abs(latitude - f_lat)
                dlon = abs(longitude - f_lon)
                dist = math.hypot(dlat, dlon)
                if dist < best_dist:
                    best_dist = dist
                    best_path = file_path
        if best_path:
            logger.info("Found nearest regional NASA POWER cache: %s (delta=%.2f°)", best_path.name, best_dist)
        return best_path

    def find_matching_smap_gee(
        self,
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
        mode: str,
    ) -> Path | None:
        """Find an existing NASA SMAP GEE cache file on the native EASE-Grid 2.0 (~9 km pixel, half-radius <= 4.5 km)."""
        start_str = start_date.strftime("%Y%m%d")
        end_str = end_date.strftime("%Y%m%d")
        best_path: Path | None = None
        best_dist_km = float("inf")

        # EASE-Grid 2.0 Global 9 km (M09): Maximum distance to cell center is half the diagonal (~6.4 km) or nominal half-width (4.5 km)
        max_pixel_radius_km = 5.0

        pattern = re.compile(r"^smap_gee_([+-]?\d+\.\d+)_([+-]?\d+\.\d+)_(\d{8})_(\d{8})_([a-z]+)_[0-9a-f]+\.json$")
        for file_path in self.smap_gee_dir.glob("smap_gee_*.json"):
            m = pattern.match(file_path.name)
            if not m:
                continue
            f_lat, f_lon, f_start, f_end, f_mode = float(m.group(1)), float(m.group(2)), m.group(3), m.group(4), m.group(5)
            if f_start == start_str and f_end == end_str and f_mode == mode:
                # Approximate geodesic distance on WGS84
                dlat_km = (latitude - f_lat) * 110.9
                dlon_km = (longitude - f_lon) * 111.3 * math.cos(math.radians((latitude + f_lat) / 2.0))
                dist_km = math.hypot(dlat_km, dlon_km)
                if dist_km <= max_pixel_radius_km and dist_km < best_dist_km:
                    best_dist_km = dist_km
                    best_path = file_path
        if best_path:
            logger.info("Found native EASE-Grid 2.0 matching SMAP cache: %s (distance=%.2f km within 9-km pixel)", best_path.name, best_dist_km)
        return best_path

    def find_nearest_smap_gee(
        self,
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
        mode: str = "agricultural",
    ) -> Path | None:
        """Find the geographically closest SMAP GEE cache file for the requested date window."""
        start_str = start_date.strftime("%Y%m%d")
        end_str = end_date.strftime("%Y%m%d")
        best_path: Path | None = None
        best_dist_km = float("inf")

        pattern = re.compile(r"^smap_gee_([+-]?\d+\.\d+)_([+-]?\d+\.\d+)_(\d{8})_(\d{8})_([a-z]+)_[0-9a-f]+\.json$")
        for file_path in self.smap_gee_dir.glob("smap_gee_*.json"):
            m = pattern.match(file_path.name)
            if not m:
                continue
            f_lat, f_lon, f_start, f_end, f_mode = float(m.group(1)), float(m.group(2)), m.group(3), m.group(4), m.group(5)
            if f_start == start_str and f_end == end_str and f_mode == mode:
                dlat_km = (latitude - f_lat) * 110.9
                dlon_km = (longitude - f_lon) * 111.3 * math.cos(math.radians((latitude + f_lat) / 2.0))
                dist_km = math.hypot(dlat_km, dlon_km)
                if dist_km < best_dist_km:
                    best_dist_km = dist_km
                    best_path = file_path
        if best_path:
            logger.info("Found nearest regional SMAP GEE cache: %s (distance=%.2f km)", best_path.name, best_dist_km)
        return best_path

    def read_json(self, path: Path) -> dict | None:
        if not path.is_file():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            logger.warning("Ignoring unreadable cache file %s", path.name)
            return None
        if not isinstance(payload, dict):
            logger.warning("Ignoring cache file %s because it is not a JSON object", path.name)
            return None
        return payload

    def read_text(self, path: Path) -> str | None:
        if not path.is_file():
            return None
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            logger.warning("Ignoring unreadable cache file %s", path.name)
            return None

    def write_bytes(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".tmp")
        temporary.write_bytes(data)
        temporary.replace(path)

    def write_json(self, path: Path, payload: dict) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.write_bytes(path, encoded)

    def write_text(self, path: Path, text: str) -> None:
        self.write_bytes(path, text.encode("utf-8"))
