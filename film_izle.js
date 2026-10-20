// DiziAlem Cinema Movie Player Controller
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const movieId = params.get("id") || params.get("slug");

  if (!movieId) {
    window.location.href = "/filmler";
    return;
  }

  loadMovieDetail(movieId);
  setupCinemaControls();
});

let currentMovie = null;

async function loadMovieDetail(movieId) {
  const loadingOverlay = document.getElementById("playerLoading");
  try {
    const res = await fetch(`/api/movies/${encodeURIComponent(movieId)}`);
    if (!res.ok) throw new Error("Film bulunamadı");
    const movie = await res.json();
    currentMovie = movie;

    renderMovieDetails(movie);
    renderPlayer(movie);
    loadRelatedMovies(movie.category || (movie.genres && movie.genres[0]) || "", movie.id);
  } catch (err) {
    console.error("Film yükleme hatası:", err);
    if (loadingOverlay) {
      loadingOverlay.innerHTML = `
        <div style="text-align: center; color: #ff4d6d; padding: 20px;">
          <i class="fas fa-triangle-exclamation" style="font-size: 3rem; margin-bottom: 12px;"></i>
          <h3>Film Yüklenemedi</h3>
          <p style="color: #aaa; margin-top: 8px;">Bu film şu anda yayında olmayabilir veya kaldırılmış olabilir.</p>
          <a href="/filmler" class="btn-primary" style="display: inline-block; margin-top: 15px; padding: 10px 20px; border-radius: 8px;">
            <i class="fas fa-arrow-left"></i> Filmlere Dön
          </a>
        </div>
      `;
    }
  }
}

function renderMovieDetails(movie) {
  document.title = `${movie.title} - Full HD Film İzle | DiziAlem`;

  const titleEl = document.getElementById("movieDetailTitle");
  const imdbEl = document.getElementById("movieDetailImdb");
  const yearEl = document.getElementById("movieDetailYear");
  const durEl = document.getElementById("movieDetailDuration");
  const descEl = document.getElementById("movieDetailDesc");
  const genresEl = document.getElementById("movieDetailGenres");

  if (titleEl) titleEl.textContent = movie.title;
  if (imdbEl) imdbEl.innerHTML = `<i class="fas fa-star"></i> ${movie.imdb || "7.5"}`;
  if (yearEl) yearEl.textContent = movie.year || "2026";
  if (durEl) durEl.innerHTML = `<i class="far fa-clock"></i> ${movie.duration || "110 dk"}`;
  if (descEl) descEl.textContent = movie.description || "Film hakkında detaylı açıklama bulunmamaktadır.";

  if (genresEl && movie.genres && movie.genres.length > 0) {
    genresEl.innerHTML = movie.genres
      .map(
        (g) => `
        <a href="/filmler?genre=${encodeURIComponent(g)}" class="genre-tag-pill">
          <i class="fas fa-tag"></i> ${escapeHtml(g)}
        </a>
      `
      )
      .join("");
  }
}

function renderPlayer(movie) {
  const iframe = document.getElementById("cinemaIframe");
  const loadingOverlay = document.getElementById("playerLoading");

  if (!iframe) return;

  if (movie.embed_url) {
    iframe.src = movie.embed_url;
    iframe.onload = () => {
      if (loadingOverlay) loadingOverlay.style.display = "none";
    };
    // Hide overlay after timeout as fallback
    setTimeout(() => {
      if (loadingOverlay) loadingOverlay.style.display = "none";
    }, 2500);
  } else {
    if (loadingOverlay) {
      loadingOverlay.innerHTML = `
        <p style="color: #ffb400;">Film video kaynağı hazırlanıyor, lütfen sayfayı yenileyiniz...</p>
      `;
    }
  }
}

function setupCinemaControls() {
  const lightsBtn = document.getElementById("cinemaLightsBtn");
  const dimmer = document.getElementById("cinemaDimmer");
  const frameBox = document.getElementById("playerFrameBox");

  let isLightsOff = false;

  if (lightsBtn && dimmer && frameBox) {
    lightsBtn.addEventListener("click", () => {
      isLightsOff = !isLightsOff;
      if (isLightsOff) {
        dimmer.classList.add("active");
        frameBox.classList.add("cinema-highlight");
        lightsBtn.innerHTML = '<i class="far fa-lightbulb"></i> <span>Işıkları Aç</span>';
        lightsBtn.classList.add("active");
      } else {
        dimmer.classList.remove("active");
        frameBox.classList.remove("cinema-highlight");
        lightsBtn.innerHTML = '<i class="fas fa-lightbulb"></i> <span>Işıkları Kapat</span>';
        lightsBtn.classList.remove("active");
      }
    });

    dimmer.addEventListener("click", () => {
      if (isLightsOff) {
        lightsBtn.click();
      }
    });
  }

  // Share button
  const shareBtn = document.getElementById("copyShareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const origHtml = shareBtn.innerHTML;
        shareBtn.innerHTML = '<i class="fas fa-check" style="color: #00e676;"></i> Kopyalandı!';
        setTimeout(() => {
          shareBtn.innerHTML = origHtml;
        }, 2000);
      } catch (e) {
        alert("Bağlantı: " + window.location.href);
      }
    });
  }
}

async function loadRelatedMovies(category, currentId) {
  const gridEl = document.getElementById("relatedMoviesGrid");
  if (!gridEl) return;

  try {
    const res = await fetch(`/api/movies?limit=8${category ? "&genre=" + encodeURIComponent(category) : ""}`);
    if (!res.ok) return;
    const data = await res.json();
    const list = (data.movies || []).filter((m) => m.id !== currentId).slice(0, 6);

    if (list.length === 0) {
      gridEl.parentElement.style.display = "none";
      return;
    }

    gridEl.innerHTML = list
      .map((m) => {
        const detailUrl = `/film-izle?id=${encodeURIComponent(m.id || m.slug)}`;
        const poster = m.poster || "/static/img/logo.png";
        const imdb = m.imdb || "7.5";
        const title = escapeHtml(m.title || "Film");
        const year = m.year || "2026";
        const cat = escapeHtml(m.category || (m.genres && m.genres[0]) || "Film");

        return `
        <article class="movie-card">
          <a href="${detailUrl}" class="movie-card-link">
            <div class="movie-poster-box">
              <img src="${poster}" alt="${title}" loading="lazy" class="movie-poster-img" onerror="this.src='/static/img/logo.png'">
              <div class="movie-overlay-play">
                <div class="play-icon-glow"><i class="fas fa-play"></i></div>
              </div>
              <div class="movie-top-badges">
                <span class="badge-imdb-card"><i class="fas fa-star"></i> ${imdb}</span>
                <span class="badge-hd-card">1080p</span>
              </div>
            </div>
            <div class="movie-card-info">
              <h3 class="movie-card-title">${title}</h3>
              <div class="movie-card-meta">
                <span>${year}</span>
                <span class="meta-dot">•</span>
                <span>${cat}</span>
              </div>
            </div>
          </a>
        </article>
      `;
      })
      .join("");
  } catch (e) {
    console.error("Related movies error:", e);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
