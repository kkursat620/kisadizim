import concurrent.futures
import json
import os
import re
import threading
import time
from urllib.parse import unquote
import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://dramadizilerim.com/",
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data", "series.json")
CONFIG_FILE = os.path.join(BASE_DIR, "data", "config.json")

# ========================================================
# GLOBAL SYNC & AUTOPILOT STATE
# ========================================================
sync_state = {
    "is_running": False,
    "current_index": 0,
    "total_target": 0,
    "current_title": "",
    "success_count": 0,
    "error_count": 0,
    "logs": [],
}

autopilot_state = {
    "enabled": True,
    "interval_minutes": 10,
    "last_check": "Henüz kontrol edilmedi",
    "new_added_count": 0,
    "logs": [],
}

stop_requested = False


def log_sync(msg):
    timestamp = time.strftime("%H:%M:%S")
    entry = f"[{timestamp}] {msg}"
    sync_state["logs"].insert(0, entry)
    if len(sync_state["logs"]) > 100:
        sync_state["logs"].pop()
    print(entry)


def log_autopilot(msg):
    timestamp = time.strftime("%H:%M:%S")
    entry = f"[{timestamp}] [AI Oto-Pilot] {msg}"
    autopilot_state["logs"].insert(0, entry)
    if len(autopilot_state["logs"]) > 50:
        autopilot_state["logs"].pop()
    print(entry)


def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                autopilot_state["enabled"] = data.get("autopilot_enabled", True)
                autopilot_state["interval_minutes"] = data.get("interval_minutes", 10)
        except Exception:
            pass


def save_config():
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "autopilot_enabled": autopilot_state["enabled"],
                "interval_minutes": autopilot_state["interval_minutes"]
            }, f, indent=2)
    except Exception:
        pass


def load_series():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_series(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ========================================================
# STREAM & SUBTITLE EXTRACTION
# ========================================================
def extract_stream_and_sub(embed_url):
    try:
        clean_url = embed_url.replace("&amp;", "&")
        resp = requests.get(clean_url, headers=HEADERS, timeout=10)

        # 1. Video URL
        src_match = re.search(r'let source = "([^"]+)"', resp.text)
        stream = None
        if src_match:
            stream = src_match.group(1)
            if "hls_proxy.php?url=" in stream:
                inner_url = stream.split("hls_proxy.php?url=")[1].split("&")[0]
                stream = unquote(inner_url)

        # 2. Turkish Subtitle URL
        sub_url = ""
        cap_match = re.search(r'window\._captionUrl\s*=\s*"([^"]+)"', resp.text)
        if cap_match and cap_match.group(1):
            sub_raw = cap_match.group(1).replace("&amp;", "&")
            if sub_raw.startswith("http"):
                sub_url = sub_raw
            else:
                sub_url = f"https://dramadizilerim.com/{sub_raw.lstrip('/')}"

        return stream, sub_url
    except Exception:
        pass
    return None, ""


def scrape_single_series(url_or_slug):
    slug = url_or_slug.strip().rstrip("/").split("/")[-1]
    dizi_url = f"https://dramadizilerim.com/dizi/{slug}"
    izle_url = f"https://dramadizilerim.com/izle/{slug}?s=1&e=1"

    resp = requests.get(dizi_url, headers=HEADERS, timeout=15)
    if resp.status_code != 200:
        raise Exception(f"Dizi sayfası açılamadı ({resp.status_code})")

    title = slug.replace("-", " ").title()
    desc = "Harika bir dikey mini dizi."
    cover = ""
    category = "Romantik"
    rating = "9.8"
    views = "85.4K"

    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', resp.text, re.DOTALL):
        try:
            data = json.loads(m.group(1))
            if data.get("@type") == "TVSeries":
                title = data.get("name", title)
                desc = data.get("description", desc)
                img = data.get("image")
                if isinstance(img, list) and len(img) > 0:
                    cover = img[0]
                elif isinstance(img, str):
                    cover = img
                break
        except Exception:
            pass

    if "image_proxy.php?url=" in cover:
        try:
            cover = unquote(cover.split("image_proxy.php?url=")[1].split("&")[0])
        except Exception:
            pass

    cat_match = re.search(r'<a href="[^"]*/kategori/([^"/]+)"', resp.text)
    if cat_match:
        category = cat_match.group(1).capitalize()
    else:
        text_lower = (title + " " + desc).lower()
        if "alfa" in text_lower or "kurt" in text_lower:
            category = "Kurtadam"
        elif "milyarder" in text_lower or "holding" in text_lower or "patron" in text_lower:
            category = "Milyarder"
        elif "mafya" in text_lower:
            category = "Mafya"
        elif "intikam" in text_lower or "ihanet" in text_lower:
            category = "İntikam"
        elif "ejderha" in text_lower or "büyü" in text_lower:
            category = "Fantastik"

    watch_resp = requests.get(izle_url, headers=HEADERS, timeout=15)
    embed_urls = re.findall(r'(?:iframe src="|data-src=")(https://dramadizilerim\.com/embed\.php[^"]+)', watch_resp.text)

    if not embed_urls:
        single_m = re.search(r'embed\.php\?[^"\'>\s]+', watch_resp.text)
        if single_m:
            embed_urls = ["https://dramadizilerim.com/" + single_m.group(0)]

    episodes = []
    has_subtitles = False

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        future_to_ep = {
            executor.submit(extract_stream_and_sub, url): idx + 1
            for idx, url in enumerate(embed_urls)
        }
        for future in concurrent.futures.as_completed(future_to_ep):
            ep_num = future_to_ep[future]
            stream, sub = future.result()
            if stream:
                if sub:
                    has_subtitles = True
                episodes.append({
                    "episode": ep_num,
                    "title": f"Bölüm {ep_num}",
                    "video_url": stream,
                    "subtitle_url": sub,
                    "duration": "01:30"
                })

    episodes.sort(key=lambda x: x["episode"])

    is_dub = "dublaj" in title.lower() or "dublaj" in desc.lower()
    tags = ["HD", "Popüler"]
    if is_dub:
        tags.insert(0, "Dublajlı")
    elif has_subtitles:
        tags.insert(0, "Türkçe Altyazılı")
    else:
        tags.insert(0, "Altyazılı")

    return {
        "id": slug,
        "title": title,
        "slug": slug,
        "description": desc,
        "cover": cover or "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80",
        "banner": cover or "",
        "category": category,
        "tags": tags,
        "rating": rating,
        "views": views,
        "total_episodes": len(episodes),
        "featured": False,
        "episodes": episodes
    }


def get_popular_series_slugs():
    slugs = []
    try:
        resp = requests.get("https://dramadizilerim.com/sitemap.xml", headers=HEADERS, timeout=12)
        found = re.findall(r'<loc>https://dramadizilerim\.com/dizi/([^<]+)</loc>', resp.text)
        for s in found:
            if s not in slugs:
                slugs.append(s)
    except Exception as e:
        print("Sitemap hatası:", e)
    return slugs


# ========================================================
# BATCH SYNC ENGINE (Tüm Siteyi Çekme)
# ========================================================
def run_batch_sync(limit: int = 50, only_new: bool = True):
    global stop_requested
    stop_requested = False

    sync_state["is_running"] = True
    sync_state["success_count"] = 0
    sync_state["error_count"] = 0
    sync_state["current_index"] = 0
    sync_state["logs"] = []

    log_sync(f"Toplu Dizi Eşitleme başlatıldı. Hedef miktar: {limit if limit > 0 else 'TÜM DİZİLER'}")

    all_slugs = get_popular_series_slugs()
    series = load_series()
    existing_ids = set(s.get("id") for s in series)

    if only_new:
        target_slugs = [s for s in all_slugs if s not in existing_ids]
    else:
        target_slugs = all_slugs

    if limit > 0:
        target_slugs = target_slugs[:limit]

    sync_state["total_target"] = len(target_slugs)
    log_sync(f"Toplam {len(target_slugs)} yeni dizi taranacak.")

    for idx, slug in enumerate(target_slugs):
        if stop_requested:
            log_sync("Kullanıcı tarafından durduruldu.")
            break

        sync_state["current_index"] = idx + 1
        sync_state["current_title"] = slug

        log_sync(f"[{idx+1}/{len(target_slugs)}] '{slug}' taranıyor...")
        try:
            data = scrape_single_series(slug)
            if data and data.get("episodes"):
                # Reload current list to avoid overwriting concurrently
                current_db = load_series()
                # Remove if exists, then prepend
                current_db = [s for s in current_db if s.get("id") != data["id"]]
                current_db.insert(0, data)
                save_series(current_db)

                sync_state["success_count"] += 1
                log_sync(f"✓ Başarılı: {data['title']} ({len(data['episodes'])} bölüm)")
            else:
                sync_state["error_count"] += 1
                log_sync(f"✗ Bölüm bulunamadı: {slug}")
        except Exception as e:
            sync_state["error_count"] += 1
            log_sync(f"✗ Hata ({slug}): {str(e)}")

        time.sleep(1)  # Saygılı istek aralığı

    sync_state["is_running"] = False
    sync_state["current_title"] = "Tamamlandı"
    log_sync(f"İşlem bitti! Başarılı: {sync_state['success_count']}, Hata: {sync_state['error_count']}")


def stop_batch_sync():
    global stop_requested
    stop_requested = True
    sync_state["is_running"] = False
    log_sync("Durdurma talebi gönderildi.")


# ========================================================
# AI OTO-PİLOT (Arka Planda Otomatik Yeni Dizi Takipçisi)
# ========================================================
def autopilot_worker_loop():
    load_config()
    log_autopilot("AI Oto-Pilot servisi hazırlandı.")

    while True:
        try:
            if autopilot_state["enabled"]:
                autopilot_state["last_check"] = time.strftime("%Y-%m-%d %H:%M:%S")
                log_autopilot("dramadizilerim.com kontrol ediliyor: Yeni eklenen dizi var mı?")

                slugs = get_popular_series_slugs()
                current_db = load_series()
                existing_ids = set(s.get("id") for s in current_db)

                # Find newest slugs that don't exist in our DB
                new_slugs = [s for s in slugs[:30] if s not in existing_ids]

                if new_slugs:
                    log_autopilot(f"⚡ {len(new_slugs)} adet yeni dizi tespit edildi! Otomatik çekim başlatılıyor...")
                    for slug in new_slugs:
                        try:
                            log_autopilot(f"Yeni dizi çekiliyor: {slug}")
                            data = scrape_single_series(slug)
                            if data and data.get("episodes"):
                                current_db = load_series()
                                current_db.insert(0, data)
                                save_series(current_db)
                                autopilot_state["new_added_count"] += 1
                                log_autopilot(f"✓ Otomatik Eklendi: {data['title']} ({len(data['episodes'])} bölüm)")
                        except Exception as scrape_err:
                            log_autopilot(f"Çekim hatası ({slug}): {scrape_err}")
                else:
                    log_autopilot("Yeni dizi yok, tüm içerikler güncel.")

            # Sleep for interval minutes
            interval_sec = max(60, autopilot_state["interval_minutes"] * 60)
            time.sleep(interval_sec)

        except Exception as e:
            log_autopilot(f"Oto-pilot döngü hatası: {e}")
            time.sleep(60)


def start_autopilot_thread():
    t = threading.Thread(target=autopilot_worker_loop, daemon=True)
    t.start()
