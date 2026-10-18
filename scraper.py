import concurrent.futures
import json
import os
import re
from urllib.parse import unquote, urlparse
import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://dramadizilerim.com/",
}

def extract_stream_from_embed(embed_url):
    try:
        clean_url = embed_url.replace("&amp;", "&")
        resp = requests.get(clean_url, headers=HEADERS, timeout=10)
        src_match = re.search(r'let source = "([^"]+)"', resp.text)
        if src_match:
            stream = src_match.group(1)
            # If it's a proxy link like hls_proxy.php?url=...
            if "hls_proxy.php?url=" in stream:
                inner_url = stream.split("hls_proxy.php?url=")[1].split("&")[0]
                stream = unquote(inner_url)
            return stream
    except Exception as e:
        pass
    return None

def scrape_single_series(url_or_slug):
    slug = url_or_slug.strip().rstrip("/").split("/")[-1]
    dizi_url = f"https://dramadizilerim.com/dizi/{slug}"
    izle_url = f"https://dramadizilerim.com/izle/{slug}?s=1&e=1"

    print(f"[*] Dizi bilgileri çekiliyor: {dizi_url}")
    resp = requests.get(dizi_url, headers=HEADERS, timeout=15)
    if resp.status_code != 200:
        raise Exception(f"Dizi sayfası açılamadı ({resp.status_code})")

    # Extract Metadata from Schema
    title = slug.replace("-", " ").title()
    desc = "Harika bir dikey mini dizi."
    cover = ""
    category = "Romantik"
    rating = "9.8"
    views = "85.4K"

    # Search for TVSeries schema
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
        except:
            pass

    # Clean cover URL if it was routed through dramadizilerim image_proxy
    if "image_proxy.php?url=" in cover:
        try:
            cover = unquote(cover.split("image_proxy.php?url=")[1].split("&")[0])
        except:
            pass

    # Extract Category / Genre if present in HTML
    cat_match = re.search(r'<a href="[^"]*/kategori/([^"/]+)"', resp.text)
    if cat_match:
        category = cat_match.group(1).capitalize()
    else:
        # Deduce from title/desc
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

    # Extract Watch Page to get all episode embeds
    print(f"[*] Bölümler taranıyor: {izle_url}")
    watch_resp = requests.get(izle_url, headers=HEADERS, timeout=15)
    embed_urls = re.findall(r'(?:iframe src="|data-src=")(https://dramadizilerim\.com/embed\.php[^"]+)', watch_resp.text)

    # Fallback to single episode if none found in regex
    if not embed_urls:
        single_m = re.search(r'embed\.php\?[^"\'>\s]+', watch_resp.text)
        if single_m:
            embed_urls = ["https://dramadizilerim.com/" + single_m.group(0)]

    print(f"[+] {len(embed_urls)} adet bölüm tespit edildi. Video akışları paralel olarak çözülüyor...")

    episodes = []
    # Fast multi-threaded stream extraction
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        future_to_ep = {
            executor.submit(extract_stream_from_embed, url): idx + 1
            for idx, url in enumerate(embed_urls)
        }
        for future in concurrent.futures.as_completed(future_to_ep):
            ep_num = future_to_ep[future]
            stream = future.result()
            if stream:
                episodes.append({
                    "episode": ep_num,
                    "title": f"Bölüm {ep_num}",
                    "video_url": stream,
                    "duration": "01:30"
                })

    # Sort episodes by episode number
    episodes.sort(key=lambda x: x["episode"])

    is_dub = "dublaj" in title.lower() or "dublaj" in desc.lower()

    series_data = {
        "id": slug,
        "title": title,
        "slug": slug,
        "description": desc,
        "cover": cover or "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80",
        "banner": cover or "",
        "category": category,
        "tags": ["Dublajlı" if is_dub else "Altyazılı", "HD", "Popüler"],
        "rating": rating,
        "views": views,
        "total_episodes": len(episodes),
        "featured": False,
        "episodes": episodes
    }

    return series_data

def get_popular_series_slugs():
    """Fetches trending drama slugs from dramadizilerim.com sitemap and homepage"""
    slugs = []
    try:
        resp = requests.get("https://dramadizilerim.com/sitemap.xml", headers=HEADERS, timeout=10)
        found = re.findall(r'<loc>https://dramadizilerim\.com/dizi/([^<]+)</loc>', resp.text)
        for s in found:
            if s not in slugs:
                slugs.append(s)
    except Exception as e:
        print("Sitemap hatası:", e)
    return slugs
