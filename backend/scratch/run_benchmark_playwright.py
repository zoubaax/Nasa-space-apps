import time
from playwright.sync_api import sync_playwright

def run_benchmark():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True)
        pg = b.new_page()

        print("=== 1. TEST CACHE HIT (DONNÉES EN MÉMOIRE / DISQUE) ===")
        t0 = time.perf_counter()
        res_hit = pg.request.get('http://127.0.0.1:8000/api/smap-gee/timeseries?mode=agricultural&year=2025&latitude=35.7687&longitude=-5.8139')
        hit_duration = (time.perf_counter() - t0) * 1000
        data_hit = res_hit.json()
        print(f"Status: {res_hit.status}")
        print(f"Temps de réponse réel (Hit): {hit_duration:.2f} ms")
        print(f"Flag cached: {data_hit.get('cached')}")
        print(f"processing_time_ms initial archivé: {data_hit.get('processing_time_ms')} ms")

        print("\n=== 2. TEST DIRECT SERVICE GEE INTERNAL PROFILING ===")
        b.close()

if __name__ == "__main__":
    run_benchmark()
