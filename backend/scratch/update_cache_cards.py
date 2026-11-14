import sys
import glob
import json
from unittest.mock import MagicMock

sys.path.insert(0, 'nasa-power-service')
from app.services.smap_gee import SmapGeeService
from app.services.smap_dictionary import AGRICULTURAL_VARIABLE_IDS, ALL_VARIABLE_IDS
from app.models.smap_gee import MonthlyObservationPoint

svc = SmapGeeService(MagicMock(), MagicMock(), MagicMock())
for path in glob.glob('nasa-power-service/data/smap_gee/*.json'):
    with open(path, 'r', encoding='utf-8') as f:
        d = json.load(f)
    mode = d.get('mode', 'agricultural')
    bands = AGRICULTURAL_VARIABLE_IDS if mode == 'agricultural' else ALL_VARIABLE_IDS
    series = [MonthlyObservationPoint.model_validate(m) for m in d['monthly_series']]
    cards = svc._compute_summary_cards(series, d['location']['name'], band_names=bands)
    d['summary_cards'] = [c.model_dump(mode='json') for c in cards]
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(d, f, indent=2)
    print(f"Updated {path}: {len(d['summary_cards'])} cards (mode={mode})")
