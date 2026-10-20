// DiziAlem Movies Page Frontend Controller
let allMovies = [];
let filteredMovies = [];
let allGenres = [];
let currentGenre = "all";
let currentSort = "popular";
let currentQuickFilter = "all";
let searchQuery = "";

document.addEventListener("DOMContentLoaded", () => {
  initUrlParams();
  setupEventListeners();
  loadGenres();
  loadMovies();
});

function initUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("genre")) {
    currentGenre = params.get("genre");
  }
  if (params.get("search")) {
    searchQuery = params.get("search");
    const searchInput = document.getElementById("movieSearchInput");
    if (searchInput) searchInput.value = searchQuery;
  }
  if (params.get("sort")) {
    currentSort = params.get("sort");
    const sortSelect = document.getElementById("movieSortSelect");
    if (sortSelect) sortSelect.value = currentSort;
  }
}

function setupEventListeners() {
  // Main search bar
  const searchInput = document.getElementById("movieSearchInput");
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchQuery = e.target.value.trim();
        applyFilters();
      }, 250);
    });
  }

  // Genre sidebar search
  const genreFilterInput = document.getElementById("genreFilterInput");
  if (genreFilterInput) {
    genreFilterInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      const items = document.querySelectorAll(".genre-item");
      items.forEach((item) => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? "flex" : "none";
      });
    });
  }

  // Sort select
  const sortSelect = document.getElementById("movieSortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      currentSort = e.target.value;
      applyFilters();
    });
  }

  // Quick filter chips
  const chips = document.querySelectorAll(".filter-chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentQuickFilter = chip.getAttribute("data-filter");
      applyFilters();
    });
  });

  // Reset filters button
  const resetBtn = document.getElementById("resetMovieFiltersBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      currentGenre = "all";
      currentQuickFilter = "all";
      searchQuery = "";
      if (searchInput) searchInput.value = "";
      chips.forEach((c) => c.classList.remove("active"));
      const firstChip = document.querySelector('.filter-chip[data-filter="all"]');
      if (firstChip) firstChip.classList.add("active");
      highlightActiveGenre();
      applyFilters();
    });
  }
}

async function loadGenres() {
  try {
    const res = await fetch("/api/movies/genres");
    if (!res.ok) throw new Error("Türler yüklenemedi");
    const data = await res.json();
    allGenres = data.genres || [];

    const totalMovies = data.total_movies || 0;
    const countAllEl = document.getElementById("countAll");
    if (countAllEl) countAllEl.textContent = totalMovies;
    const sidebarTotalBadge = document.getElementById("sidebarTotalBadge");
    if (sidebarTotalBadge) sidebarTotalBadge.textContent = totalMovies;

    renderGenreList();
  } catch (err) {
    console.error("Genre load error:", err);
  }
}

function renderGenreList() {
  const listEl = document.getElementById("genreList");
  if (!listEl) return;

  // Clear existing extra items except the first "Tüm Filmler"
  const allItem = listEl.querySelector('.genre-item[data-genre="all"]');
  listEl.innerHTML = "";
  if (allItem) {
    listEl.appendChild(allItem);
    allItem.onclick = () => selectGenre("all");
  }

  allGenres.forEach((g) => {
    const li = document.createElement("li");
    li.className = `genre-item ${currentGenre.toLowerCase() === g.slug.toLowerCase() || currentGenre.toLowerCase() === g.name.toLowerCase() ? "active" : ""}`;
    li.setAttribute("data-genre", g.slug);
    li.innerHTML = `
      <div class="genre-left">
        <i class="fas ${g.icon || "fa-film"} genre-icon"></i>
        <span class="genre-name">${escapeHtml(g.name)}</span>
      </div>
      <span class="genre-count">${g.count}</span>
    `;
    li.onclick = () => selectGenre(g.slug, g.name);
    listEl.appendChild(li);
  });

  highlightActiveGenre();
}

function selectGenre(slug, name) {
  currentGenre = slug;
  highlightActiveGenre();

  const titleEl = document.getElementById("genreHeadingText");
  if (titleEl) {
    titleEl.textContent = slug === "all" ? "Tüm Filmler" : (name || slug) + " Filmleri";
  }

  // Update URL without reload
  const url = new URL(window.location);
  if (slug === "all") {
    url.searchParams.delete("genre");
  } else {
    url.searchParams.set("genre", slug);
  }
  window.history.pushState({}, "", url);

  applyFilters();
}

function highlightActiveGenre() {
  const items = document.querySelectorAll(".genre-item");
  items.forEach((item) => {
    const g = item.getAttribute("data-genre");
    if (g === currentGenre || (currentGenre === "all" && g === "all")) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

async function loadMovies() {
  const loadingEl = document.getElementById("moviesLoading");
  const emptyEl = document.getElementById("moviesEmpty");
  const gridEl = document.getElementById("movieCardsGrid");

  if (loadingEl) loadingEl.style.display = "block";
  if (emptyEl) emptyEl.style.display = "none";

  try {
    const res = await fetch("/api/movies?limit=100");
    if (!res.ok) throw new Error("Filmler yüklenemedi");
    const data = await res.json();
    allMovies = data.movies || [];

    if (allMovies.length > 0) {
      renderHeroFeatured(allMovies[0]);
    }

    applyFilters();
  } catch (err) {
    console.error("Movies load error:", err);
    if (loadingEl) loadingEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "block";
  }
}

function renderHeroFeatured(movie) {
  const heroSection = document.getElementById("movieHeroSection");
  if (!heroSection || !movie) return;

  const titleEl = document.getElementById("movieHeroTitle");
  const descEl = document.getElementById("movieHeroDesc");
  const imdbEl = document.getElementById("movieHeroImdb");
  const yearEl = document.getElementById("movieHeroYear");
  const catEl = document.getElementById("movieHeroCategory");
  const playBtn = document.getElementById("movieHeroPlayBtn");

  if (titleEl) titleEl.textContent = movie.title;
  if (descEl) descEl.textContent = movie.description || "En yeni ve yüksek puanlı vizyon filmi DiziAlem'de yayında.";
  if (imdbEl) imdbEl.innerHTML = `<i class="fas fa-star"></i> ${movie.imdb || "7.8"}`;
  if (yearEl) yearEl.textContent = movie.year || "2026";
  if (catEl) catEl.textContent = movie.category || (movie.genres && movie.genres[0]) || "Film";
  if (playBtn) playBtn.href = `/film-izle?id=${encodeURIComponent(movie.id || movie.slug)}`;

  if (movie.banner || movie.poster) {
    heroSection.style.backgroundImage = `linear-gradient(to right, rgba(8, 9, 13, 0.95) 25%, rgba(8, 9, 13, 0.45) 80%), url('${movie.banner || movie.poster}')`;
  }

  heroSection.style.display = "block";
}

function applyFilters() {
  let list = [...allMovies];

  // 1. Genre filter
  if (currentGenre && currentGenre !== "all") {
    const cgl = currentGenre.toLowerCase();
    list = list.filter((m) => {
      const genres = (m.genres || []).map((g) => g.toLowerCase());
      const cat = (m.category || "").toLowerCase();
      return genres.includes(cgl) || cat === cgl || genres.some((g) => g.includes(cgl));
    });
  }

  // 2. Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter((m) => {
      return (
        (m.title && m.title.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q)) ||
        (m.genres && m.genres.some((g) => g.toLowerCase().includes(q)))
      );
    });
  }

  // 3. Quick chip filter
  if (currentQuickFilter === "imdb7") {
    list = list.filter((m) => parseFloat(m.imdb || 0) >= 7.0);
  } else if (currentQuickFilter === "y2026") {
    list = list.filter((m) => m.year === "2026");
  } else if (currentQuickFilter === "dublaj") {
    list = list.filter((m) => (m.tags || []).some((t) => t.toLowerCase().includes("dublaj")));
  }

  // 4. Sorting
  if (currentSort === "imdb") {
    list.sort((a, b) => parseFloat(b.imdb || 0) - parseFloat(a.imdb || 0));
  } else if (currentSort === "year") {
    list.sort((a, b) => (b.year || "").localeCompare(a.year || ""));
  }

  filteredMovies = list;
  renderMovieCards();
}

function renderMovieCards() {
  const loadingEl = document.getElementById("moviesLoading");
  const emptyEl = document.getElementById("moviesEmpty");
  const gridEl = document.getElementById("movieCardsGrid");
  const countEl = document.getElementById("moviesCountBadge");

  if (loadingEl) loadingEl.style.display = "none";

  if (countEl) {
    countEl.textContent = `(${filteredMovies.length} Film)`;
  }

  if (filteredMovies.length === 0) {
    if (gridEl) gridEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    return;
  }

  if (emptyEl) emptyEl.style.display = "none";
  if (!gridEl) return;

  gridEl.innerHTML = filteredMovies
    .map((m) => {
      const detailUrl = `/film-izle?id=${encodeURIComponent(m.id || m.slug)}`;
      const poster = m.poster || "/static/img/logo.png";
      const imdb = m.imdb || "7.5";
      const title = escapeHtml(m.title || "Film");
      const year = m.year || "2026";
      const duration = m.duration || "110 dk";
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
            <div class="movie-bottom-badges">
              <span class="badge-audio-card"><i class="fas fa-volume-high"></i> TR Dublaj & Altyazı</span>
            </div>
          </div>
          <div class="movie-card-info">
            <h3 class="movie-card-title" title="${title}">${title}</h3>
            <div class="movie-card-meta">
              <span class="movie-meta-year">${year}</span>
              <span class="meta-dot">•</span>
              <span class="movie-meta-dur">${duration}</span>
              <span class="meta-dot">•</span>
              <span class="movie-meta-cat">${cat}</span>
            </div>
          </div>
        </a>
      </article>
    `;
    })
    .join("");
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
