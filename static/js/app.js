// ==========================================
// KısaDizim - Homepage Application JS
// ==========================================

let allSeries = [];
let currentCategory = "Tümü";

document.addEventListener("DOMContentLoaded", () => {
  initApp();
  setupSearch();
  setupCategories();
});

async function initApp() {
  try {
    const res = await fetch("/api/series");
    allSeries = await res.json();
    renderHero(allSeries);
    renderGrid(allSeries);
  } catch (err) {
    console.error("Diziler yüklenirken hata:", err);
    document.getElementById("dramaGrid").innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: var(--primary); margin-bottom: 12px;"></i>
        <p>Diziler yüklenemedi. Sunucunun çalıştığından emin olun.</p>
      </div>
    `;
  }
}

function renderHero(seriesList) {
  if (!seriesList || seriesList.length === 0) return;
  const featured = seriesList.find((s) => s.featured) || seriesList[0];
  const heroSection = document.getElementById("heroSection");
  heroSection.style.backgroundImage = `url('${featured.banner || featured.cover}')`;
  heroSection.style.display = "flex";

  document.getElementById("heroTitle").textContent = featured.title;
  document.getElementById("heroDesc").textContent = featured.description;
  document.getElementById("heroCategory").textContent = featured.category;

  const firstEp = featured.episodes && featured.episodes[0] ? featured.episodes[0].episode : 1;
  document.getElementById("heroPlayBtn").href = `/izle?id=${featured.id}&ep=${firstEp}`;
  document.getElementById("heroDetailBtn").href = `/dizi?id=${featured.id}`;
}

function renderGrid(seriesList) {
  const grid = document.getElementById("dramaGrid");
  const countEl = document.getElementById("seriesCount");

  if (!seriesList || seriesList.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-muted);">
        <i class="fas fa-film" style="font-size: 2.5rem; opacity: 0.3; margin-bottom: 12px;"></i>
        <p>Bu kategoride veya aramaya uygun dizi bulunamadı.</p>
      </div>
    `;
    countEl.textContent = "0 Dizi";
    return;
  }

  countEl.textContent = `${seriesList.length} Dizi Listeleniyor`;

  grid.innerHTML = seriesList
    .map((s) => {
      const epCount = s.total_episodes || (s.episodes ? s.episodes.length : 0);
      const isDubbed = s.tags && s.tags.includes("Dublajlı");
      const firstEp = s.episodes && s.episodes[0] ? s.episodes[0].episode : 1;

      return `
        <article class="drama-card">
          <div class="card-poster-wrap">
            <img src="${s.cover}" alt="${s.title}" class="card-poster" loading="lazy">
            <span class="badge ${isDubbed ? "badge-primary" : "badge-glass"} badge-top-left">
              ${isDubbed ? "Türkçe Dublaj" : "Altyazılı"}
            </span>
            <span class="badge badge-gold badge-top-right">
              <i class="fas fa-star"></i> ${s.rating || "9.8"}
            </span>
            
            <a href="/izle?id=${s.id}&ep=${firstEp}" class="poster-overlay" aria-label="${s.title} İzle">
              <div class="play-hover-btn">
                <i class="fas fa-play"></i>
              </div>
            </a>
          </div>

          <div class="card-info">
            <a href="/dizi?id=${s.id}">
              <h3 class="card-title" title="${s.title}">${s.title}</h3>
            </a>
            <div class="card-meta">
              <span><i class="fas fa-layer-group"></i> ${epCount} Bölüm</span>
              <span><i class="fas fa-eye"></i> ${s.views || "10K"}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function setupCategories() {
  const bar = document.getElementById("categoryBar");
  bar.addEventListener("click", (e) => {
    const pill = e.target.closest(".cat-pill");
    if (!pill) return;

    bar.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");

    currentCategory = pill.dataset.cat;
    filterSeries();
  });
}

function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  let timeout = null;

  searchInput.addEventListener("input", (e) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      filterSeries();
    }, 200);
  });
}

function filterSeries() {
  const query = document.getElementById("searchInput").value.toLowerCase().trim();

  let filtered = allSeries;

  if (currentCategory && currentCategory !== "Tümü") {
    filtered = filtered.filter(
      (s) => s.category && s.category.toLowerCase() === currentCategory.toLowerCase()
    );
  }

  if (query) {
    filtered = filtered.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        (s.description && s.description.toLowerCase().includes(query)) ||
        (s.category && s.category.toLowerCase().includes(query))
    );
  }

  renderGrid(filtered);
}
