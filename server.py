import json
import os
import re
from urllib.parse import urljoin, quote

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data", "series.json")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = FastAPI(title="KısaDizim API & Stream Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_series():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_series(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class EpisodeModel(BaseModel):
    episode: int
    title: str
    video_url: str
    duration: str = "01:30"


class SeriesModel(BaseModel):
    id: str
    title: str
    slug: str
    description: str
    cover: str
    banner: str = ""
    category: str
    tags: list[str] = ["Dublajlı"]
    rating: str = "9.8"
    views: str = "100K"
    total_episodes: int = 1
    featured: bool = False
    episodes: list[EpisodeModel] = []


# ==========================================
# Frontend Page Routes
# ==========================================
@app.get("/")
async def index_page():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/dizi")
async def dizi_page():
    return FileResponse(os.path.join(STATIC_DIR, "dizi.html"))


@app.get("/izle")
async def izle_page():
    return FileResponse(os.path.join(STATIC_DIR, "izle.html"))


@app.get("/admin")
async def admin_page():
    return FileResponse(os.path.join(STATIC_DIR, "admin.html"))


# ==========================================
# REST API Endpoints
# ==========================================
@app.get("/api/series")
async def get_series(category: str = None, search: str = None, tag: str = None):
    series = load_series()
    if category and category.lower() != "tümü":
        series = [s for s in series if s.get("category", "").lower() == category.lower()]
    if tag:
        series = [s for s in series if tag.lower() in [t.lower() for t in s.get("tags", [])]]
    if search:
        q = search.lower().strip()
        series = [
            s
            for s in series
            if q in s.get("title", "").lower()
            or q in s.get("description", "").lower()
            or q in s.get("category", "").lower()
        ]
    return series


@app.get("/api/series/{series_id}")
async def get_single_series(series_id: str):
    series = load_series()
    for s in series:
        if s.get("id") == series_id or s.get("slug") == series_id:
            return s
    raise HTTPException(status_code=404, detail="Dizi bulunamadı")


@app.post("/api/series")
async def create_series(data: SeriesModel):
    series = load_series()
    for s in series:
        if s.get("id") == data.id:
            raise HTTPException(status_code=400, detail="Bu ID ile bir dizi zaten var")
    new_item = data.dict()
    if not new_item.get("banner"):
        new_item["banner"] = new_item["cover"]
    new_item["total_episodes"] = len(new_item.get("episodes", []))
    series.insert(0, new_item)
    save_series(series)
    return {"success": True, "series": new_item}


@app.delete("/api/series/{series_id}")
async def delete_series(series_id: str):
    series = load_series()
    filtered = [s for s in series if s.get("id") != series_id and s.get("slug") != series_id]
    if len(filtered) == len(series):
        raise HTTPException(status_code=404, detail="Dizi bulunamadı")
    save_series(filtered)
    return {"success": True, "message": "Dizi silindi"}


@app.post("/api/series/{series_id}/episodes")
async def add_episode(series_id: str, ep: EpisodeModel):
    series = load_series()
    found = False
    for s in series:
        if s.get("id") == series_id or s.get("slug") == series_id:
            s["episodes"].append(ep.dict())
            s["total_episodes"] = len(s["episodes"])
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Dizi bulunamadı")
    save_series(series)
    return {"success": True, "episodes": s["episodes"]}


@app.get("/api/categories")
async def get_categories():
    series = load_series()
    cats = set(["Tümü"])
    for s in series:
        if s.get("category"):
            cats.add(s["category"])
    return list(cats)


# ==========================================
# Streaming CORS Reverse Proxy for Video / M3U8
# ==========================================
@app.get("/api/proxy")
def video_proxy(url: str = Query(..., description="Target M3U8 or video URL")):
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Geçersiz URL şeması")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": "https://dramadizilerim.com/",
    }

    try:
        resp = requests.get(url, headers=headers, stream=True, timeout=15)
        content_type = resp.headers.get("content-type", "")

        # If it's an HLS M3U8 playlist, rewrite relative chunk URLs to route via proxy
        if "mpegurl" in content_type or "m3u8" in url or resp.text.startswith("#EXTM3U"):
            content = resp.text
            base_url = url.rsplit("/", 1)[0] + "/"

            def rewrite_url(match):
                chunk_url = match.group(0).strip()
                if chunk_url.startswith("#") or not chunk_url:
                    return chunk_url
                full_chunk_url = urljoin(base_url, chunk_url)
                return f"/api/proxy?url={quote(full_chunk_url)}"

            lines = []
            for line in content.splitlines():
                if line.startswith("#") or not line.strip():
                    lines.append(line)
                else:
                    lines.append(rewrite_url(re.match(r".+", line)))

            rewritten_playlist = "\n".join(lines)
            return Response(
                content=rewritten_playlist,
                media_type="application/vnd.apple.mpegurl",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache",
                },
            )

        # For binary video files & TS chunks
        def stream_generator():
            try:
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        yield chunk
            except Exception:
                pass

        return StreamingResponse(
            stream_generator(),
            media_type=content_type or "video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600",
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Proxy hatası: {str(e)}")


# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn

    print("🚀 KısaDizim sunucusu başlatılıyor: http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
