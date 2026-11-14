"""Schema-shaped NASA POWER document used only by unit tests.

The numbers in this module are synthetic fixtures. They are not NASA
observations, and the application never reads this file at runtime.
"""

from __future__ import annotations


def build_sample_payload() -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [-5.84, 35.76, 18.0]},
        "properties": {
            "parameter": {
                "T2M": {
                    "20241231": 100.0,
                    "20250101": 10.0,
                    "20250102": -999,
                    "20250103": 20.0,
                },
                "T2M_MAX": {
                    "20241231": 100.0,
                    "20250101": 15.0,
                    "20250102": 36.0,
                    "20250103": 25.0,
                },
                "T2M_MIN": {
                    "20250101": 5.0,
                    "20250102": -1.0,
                    "20250103": 12.0,
                },
                "PRECTOTCORR": {
                    "20250101": 0.0,
                    "20250102": 5.0,
                    "20250103": -999.0,
                },
                "RH2M": {"20250101": 50.0, "20250102": 60.0, "20250103": 70.0},
                "WS2M": {"20250101": 2.0, "20250102": 4.0, "20250103": 3.0},
                "ALLSKY_SFC_SW_DWN": {
                    "20250101": 10.0,
                    "20250102": -999.0,
                    "20250103": 20.0,
                },
            }
        },
        "header": {
            "title": "NASA/POWER CERES/MERRA2 Native Resolution Daily Data",
            "fill_value": -999,
            "start": "20250101",
            "end": "20250103",
        },
        "parameters": {
            "T2M": {"units": "C", "longname": "Temperature at 2 Meters"},
            "T2M_MAX": {"units": "C", "longname": "Temperature at 2 Meters Maximum"},
            "T2M_MIN": {"units": "C", "longname": "Temperature at 2 Meters Minimum"},
            "PRECTOTCORR": {"units": "mm/day", "longname": "Precipitation Corrected"},
            "RH2M": {"units": "%", "longname": "Relative Humidity at 2 Meters"},
            "WS2M": {"units": "m/s", "longname": "Wind Speed at 2 Meters"},
            "ALLSKY_SFC_SW_DWN": {
                "units": "MJ/m^2/day",
                "longname": "All Sky Surface Shortwave Downward Irradiance",
            },
        },
        "messages": ["Grid cell note"],
    }
