// ==========================================
// DiziAlem (dizialem.com) - Dizi Detail Page JS
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const seriesId = params.get("id");

  if (!seriesId) {
    window.location.href = "/";
    return;
  }

  loadSeriesDetail(seriesId);
});

async function loadSeriesDetail(id) {
  // 1. Önce önbellekten anında render et (0 gecikme)
  try {
    const cached = localStorage.getItem("dizialem_series_cache");
    if (cached) {
      const list = JSON.parse(cached);
      const match = list.find((s) => s.id === id || s.slug === id);
      if (match) {
        renderSeriesData(match);
      }
    }
  } catch (e) {}

  // 2. Sunucudan en güncel veriyi çek
  try {
    const res = await fetch(`/api/series/${id}`);
    if (!res.ok) throw new Error("Dizi bulunamadı");
    const data = await res.json();
    renderSeriesData(data);
  } catch (err) {
    console.error("Dizi yüklenemedi:", err);
  }
}

function renderSeriesData(data) {
  document.title = `${data.title} - DiziAlem`;

    const hero = document.getElementById("detailHero");
    hero.style.backgroundImage = `url('${data.banner || data.cover}')`;

    document.getElementById("detailPoster").src = data.cover;
    document.getElementById("detailTitle").textContent = data.title;
    document.getElementById("detailDesc").textContent = data.description;
    document.getElementById("detailRating").textContent = data.rating || "9.8";
    document.getElementById("detailViews").textContent = data.views || "100K";

    const episodes = data.episodes || [];
    document.getElementById("detailEpCount").textContent = `${episodes.length} Bölüm`;

    // Badges
    const badgesContainer = document.getElementById("detailBadges");
    const isDubbed = data.tags && data.tags.includes("Dublajlı");
    badgesContainer.innerHTML = `
      <span class="badge ${isDubbed ? "badge-primary" : "badge-glass"}">
        ${isDubbed ? "Türkçe Dublaj" : "Altyazılı"}
      </span>
      <span class="badge badge-gold">${data.category}</span>
    `;

    // First Episode Button
    const firstEp = episodes[0] ? episodes[0].episode : 1;
    document.getElementById("watchFirstBtn").href = `/izle?id=${data.id}&ep=${firstEp}`;

    // Render Episodes
    const grid = document.getElementById("episodesGrid");
    if (episodes.length === 0) {
      grid.innerHTML = `<p style="color: var(--text-muted); grid-column: 1/-1;">Henüz bölüm eklenmemiş.</p>`;
      return;
    }

    grid.innerHTML = episodes
      .map(
        (ep) => `
        <a href="/izle?id=${data.id}&ep=${ep.episode}" class="ep-card">
          <i class="fas fa-play-circle"></i>
          <span class="ep-number">Bölüm ${ep.episode}</span>
          <span class="ep-duration">${ep.duration || "01:30"}</span>
        </a>
      `
      )
      .join("");
  } catch (err) {
    console.error("Detay yükleme hatası:", err);
    document.querySelector(".main-container").innerHTML = `
      <div style="text-align: center; padding: 60px; color: var(--text-muted);">
        <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--primary); margin-bottom: 16px;"></i>
        <h2>Dizi Bulunamadı</h2>
        <p style="margin: 12px 0 24px;">Aradığınız dizi mevcut değil veya kaldırılmış olabilir.</p>
        <a href="/" class="btn-cta"><i class="fas fa-arrow-left"></i> Ana Sayfaya Dön</a>
      </div>
    `;
  }
}
