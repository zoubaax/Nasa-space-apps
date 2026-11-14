import time
from playwright.sync_api import sync_playwright

def test_live_gee_timing():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True)
        pg = b.new_page()

        print("=== TEST LIVE GEE : EXTRACTION EN DIRECT D'UNE ANNÉE COMPLÈTE ===")
        # Query 2021 for Tanger (uncached)
        t0 = time.perf_counter()
        res = pg.request.get(
            'http://127.0.0.1:8000/api/smap-gee/timeseries?mode=agricultural&year=2021&latitude=35.7687&longitude=-5.8139&refresh=true',
            timeout=60000
        )
        elapsed = time.perf_counter() - t0
        data = res.json()

        print(f"Status HTTP: {res.status}")
        print(f"Durée totale observée: {elapsed:.2f} secondes ({elapsed*1000:.0f} ms)")
        print(f"Temps calculé côté backend GEE (processing_time_ms): {data.get('processing_time_ms')} ms")
        print(f"Nombre d'observations traitées: {sum(m.get('observation_count', 0) for m in data.get('monthly_series', []))} images")
        print(f"Mois extraits: {len(data.get('monthly_series', []))} mois")
        b.close()

if __name__ == "__main__":
    test_live_gee_timing()
