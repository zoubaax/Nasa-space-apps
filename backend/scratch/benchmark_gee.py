import time
import urllib.request
import json

def test_perf():
    # 1. Test Cached call (Hit) for Tanger 2025
    url_cached = 'http://127.0.0.1:8000/api/smap-gee/timeseries?mode=agricultural&year=2025&latitude=35.7687&longitude=-5.8139'
    t0 = time.perf_counter()
    with urllib.request.urlopen(url_cached) as resp:
        data = json.loads(resp.read().decode())
    t_hit = (time.perf_counter() - t0) * 1000

    print("=== TEST 1: REQUÊTE AVEC CACHE DISQUE (HIT) ===")
    print(f"Temps réel de réponse HTTP: {t_hit:.2f} ms")
    print(f"Flag cached: {data.get('cached')}")
    print(f"Temps de calcul initial GEE (quand non mis en cache): {data.get('processing_time_ms')} ms")
    print(f"Observations agrégées: {sum(m.get('observation_count', 0) for m in data.get('monthly_series', []))} images 3h")

if __name__ == "__main__":
    test_perf()
