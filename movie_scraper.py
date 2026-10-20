import os
import json
import re
import time
import logging
from curl_cffi import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MovieScraper")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
BASE_URL = "https://filmmakinesi.to"

GENRES = [
    {"name": "Aksiyon", "slug": "aksiyon", "path": "/tur/aksiyon-fmy54y/film/", "icon": "fa-fire"},
    {"name": "Macera", "slug": "macera", "path": "/tur/macera-fm1/film/", "icon": "fa-compass"},
    {"name": "Bilim Kurgu", "slug": "bilim-kurgu", "path": "/tur/bilim-kurgu-fmy58w/film/", "icon": "fa-rocket"},
    {"name": "Komedi", "slug": "komedi", "path": "/tur/komedi-fm1/film/", "icon": "fa-face-laugh-beam"},
    {"name": "Korku", "slug": "korku", "path": "/tur/korku-fm2/film/", "icon": "fa-ghost"},
    {"name": "Gerilim", "slug": "gerilim", "path": "/tur/gerilim-fm1/film/", "icon": "fa-skull"},
    {"name": "Dram", "slug": "dram", "path": "/tur/dram-fm1/film/", "icon": "fa-masks-theater"},
    {"name": "Animasyon", "slug": "animasyon", "path": "/tur/animasyon-fm2/film/", "icon": "fa-wand-magic-sparkles"},
    {"name": "Fantastik", "slug": "fantastik", "path": "/tur/fantastik-fm1/film/", "icon": "fa-dragon"},
    {"name": "Polisiye", "slug": "polisiye", "path": "/tur/polisiye/film/", "icon": "fa-shield-halved"},
    {"name": "Gizem", "slug": "gizem", "path": "/tur/gizem/film/", "icon": "fa-user-secret"},
    {"name": "Romantik", "slug": "romantik", "path": "/tur/romantik-fm1/film/", "icon": "fa-heart"},
    {"name": "Aile", "slug": "aile", "path": "/tur/aile-fm2/film/", "icon": "fa-people-roof"},
    {"name": "Savaş", "slug": "savas", "path": "/tur/savas-fm1/film/", "icon": "fa-jet-fighter"},
    {"name": "Tarih", "slug": "tarih", "path": "/tur/tarih-fm1/film/", "icon": "fa-landmark"},
    {"name": "Biyografi", "slug": "biyografi", "path": "/tur/biyografi/film/", "icon": "fa-book-open"},
    {"name": "Belgesel", "slug": "belgesel", "path": "/tur/belgesel/film/", "icon": "fa-earth-americas"},
    {"name": "Suç", "slug": "suc", "path": "/tur/polisiye/film/", "icon": "fa-handcuffs"},
    {"name": "Spor", "slug": "spor", "path": "/tur/spor/film/", "icon": "fa-trophy"},
    {"name": "Western", "slug": "western", "path": "/tur/western-fm1/film/", "icon": "fa-hat-cowboy"},
]

def get_movies_file():
    root_json = os.path.join(BASE_DIR, "movies.json")
    if os.path.exists(root_json):
        return root_json
    return os.path.join(DATA_DIR, "movies.json")

def load_movies():
    mfile = get_movies_file()
    if not os.path.exists(mfile):
        return []
    try:
        with open(mfile, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading movies: {e}")
        return []

def save_movies(movies):
    os.makedirs(DATA_DIR, exist_ok=True)
    targets = [os.path.join(BASE_DIR, "movies.json"), os.path.join(DATA_DIR, "movies.json")]
    for t in targets:
        try:
            with open(t, "w", encoding="utf-8") as f:
                json.dump(movies, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Error saving movies to {t}: {e}")

def create_session():
    return requests.Session(impersonate="chrome124")

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', text)
    return text.replace('&amp;', '&').replace('&quot;', '"').replace('&#039;', "'").strip()

def scrape_movie_detail(movie_url_or_slug, session=None):
    if not session:
        session = create_session()
        
    if not movie_url_or_slug.startswith("http"):
        if movie_url_or_slug.startswith("/film/"):
            url = f"{BASE_URL}{movie_url_or_slug}"
            slug = movie_url_or_slug.strip('/').split('/')[-1]
        else:
            slug = movie_url_or_slug.strip('/')
            url = f"{BASE_URL}/film/{slug}/"
    else:
        url = movie_url_or_slug
        slug = url.strip('/').split('/')[-1]

    try:
        r = session.get(url, timeout=15)
        if r.status_code != 200:
            logger.warning(f"Failed to fetch {url}: HTTP {r.status_code}")
            return None
        html = r.text

        # Title
        title = ""
        schema_m = re.search(r'<script type="application/ld\+json">([\s\S]*?)</script>', html)
        schema_data = {}
        if schema_m:
            try:
                schema_data = json.loads(schema_m.group(1))
                title = schema_data.get("name", "")
            except:
                pass

        if not title:
            title_m = re.search(r'<h1[^>]*>([^<]+)</h1>', html) or re.search(r'<title>([^<\|]+)', html)
            if title_m:
                title = clean_text(title_m.group(1))
        if not title:
            title = slug.replace("-", " ").title()

        # Poster & Banner
        poster = ""
        img_field = schema_data.get("image")
        if isinstance(img_field, dict):
            poster = img_field.get("url", "")
        elif isinstance(img_field, str):
            poster = img_field
            
        if not poster:
            p_match = re.search(r'<img[^>]+src=["\']([^"\']+/uploads/postlar/afis/[^"\']+)["\']', html) or \
                      re.search(r'property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html)
            if p_match:
                poster = p_match.group(1)

        if isinstance(poster, str) and poster.startswith("/"):
            poster = BASE_URL + poster

        banner = poster
        b_match = re.search(r'<img[^>]+src=["\']([^"\']+/uploads/postlar/kapak/[^"\']+)["\']', html)
        if b_match:
            b_url = b_match.group(1)
            banner = BASE_URL + b_url if b_url.startswith("/") else b_url

        # Description
        desc = schema_data.get("description", "")
        if not desc:
            desc_m = re.search(r'class=["\'](?:description|ozet|film-ozet)[^"\']*["\']>([\s\S]*?)</div>', html)
            if desc_m:
                desc = clean_text(desc_m.group(1))

        # IMDB Score
        imdb = "7.5"
        imdb_m = re.search(r'class=["\']imdb-score["\'][^>]*>[\s\S]*?<span>([\d\.]+)</span>', html) or \
                 re.search(r'class=["\']rating["\'][^>]*>[\s\S]*?([\d\.]+)', html) or \
                 re.search(r'IMDb:\s*<b>([\d\.]+)</b>', html)
        if imdb_m:
            imdb = imdb_m.group(1).strip()

        # Genres
        genres = []
        type_block_m = re.search(r'<div class=["\']type["\']>\s*Tür:?([\s\S]*?)</div>', html, re.IGNORECASE)
        if type_block_m:
            g_matches = re.findall(r'<a[^>]*>([^<]+)</a>', type_block_m.group(1))
            for g in g_matches:
                cg = clean_text(g)
                if cg and cg not in genres:
                    genres.append(cg)

        if not genres:
            # Fallback
            fb_m = re.findall(r'Tür:\s*([A-Za-zÇĞİÖŞÜçğıöşü,\s]+)', html)
            if fb_m:
                for part in fb_m[0].split(','):
                    cp = clean_text(part)
                    if cp and len(cp) < 20 and cp not in genres:
                        genres.append(cp)

        if not genres:
            genres = ["Aksiyon", "Macera"]

        # Year & Duration
        year = "2026"
        year_m = re.search(r'(\b20[12]\d\b)', html)
        if year_m:
            year = year_m.group(1)

        duration = "110 Dakika"
        dur_m = re.search(r'(\d+)\s*Dakika', html, re.IGNORECASE) or re.search(r'Süre:\s*(\d+\s*dk)', html, re.IGNORECASE)
        if dur_m:
            duration = f"{dur_m.group(1)} Dakika" if "dk" not in dur_m.group(1) else dur_m.group(1)

        # Video Embed Player
        embed_url = ""
        iframe_m = re.search(r'<iframe[^>]+src=["\'](https://closeload\.filmmakinesi\.to/video/embed/[^"\']+)["\']', html)
        if iframe_m:
            embed_url = iframe_m.group(1)
        else:
            any_iframe = re.search(r'<iframe[^>]+src=["\']([^"\']+)["\']', html)
            if any_iframe:
                embed_url = any_iframe.group(1)

        tags = ["Full HD 1080p", "Türkçe Dublaj & Altyazılı"]

        movie = {
            "id": slug,
            "slug": slug,
            "title": title,
            "poster": poster,
            "banner": banner,
            "description": desc,
            "imdb": imdb,
            "year": year,
            "duration": duration,
            "genres": genres,
            "category": genres[0] if genres else "Aksiyon",
            "tags": tags,
            "embed_url": embed_url,
            "source_url": url,
            "views": "15K+",
            "rating": imdb
        }
        return movie
    except Exception as e:
        logger.error(f"Error scraping movie {movie_url_or_slug}: {e}")
        return None

def scrape_movie_list_from_page(url_or_path, session=None):
    if not session:
        session = create_session()

    url = url_or_path if url_or_path.startswith("http") else BASE_URL + url_or_path
    logger.info(f"Scraping movie list from {url}")

    try:
        r = session.get(url, timeout=15)
        if r.status_code != 200:
            return []
        html = r.text

        # Find movie paths
        links = re.findall(r'<a\s+[^>]*href=["\'](/film/[a-z0-9\-]+/)["\']', html)
        # Deduplicate while preserving order
        seen = set()
        deduped = []
        for l in links:
            if l not in seen and not l.endswith("/fragman/"):
                seen.add(l)
                deduped.append(l)

        return deduped
    except Exception as e:
        logger.error(f"Error fetching list from {url}: {e}")
        return []

def sync_popular_movies(limit=40):
    logger.info(f"Starting movie sync with limit={limit}...")
    session = create_session()
    existing = {m["id"]: m for m in load_movies()}
    
    # 1. Fetch from homepage
    film_paths = scrape_movie_list_from_page(BASE_URL, session)
    
    # 2. Fetch from top genres to get great variety
    top_genres = ["/tur/aksiyon-fmy54y/film/", "/tur/komedi-fm1/film/", "/tur/korku-fm2/film/", "/tur/bilim-kurgu-fmy58w/film/"]
    for tg in top_genres:
        if len(film_paths) >= limit:
            break
        more_paths = scrape_movie_list_from_page(tg, session)
        for p in more_paths:
            if p not in film_paths:
                film_paths.append(p)

    logger.info(f"Found {len(film_paths)} candidate movie links.")
    
    new_movies = []
    processed = 0
    
    for path in film_paths:
        if processed >= limit:
            break
            
        slug = path.strip('/').split('/')[-1]
        
        # If already exists and has valid embed_url, keep it
        if slug in existing and existing[slug].get("embed_url"):
            new_movies.append(existing[slug])
            processed += 1
            continue

        logger.info(f"Scraping detail for: {slug} ({processed + 1}/{min(len(film_paths), limit)})")
        m_detail = scrape_movie_detail(path, session)
        if m_detail:
            existing[slug] = m_detail
            new_movies.append(m_detail)
            processed += 1
            time.sleep(0.5)  # Respectful delay
        else:
            logger.warning(f"Failed to scrape: {slug}")

    # Combine existing and new, keeping order
    final_list = list(existing.values())
    save_movies(final_list)
    logger.info(f"Successfully synced {len(final_list)} movies.")
    return final_list
