// ==========================================
// KısaDizim - Vertical Video Player JS
// ==========================================

let currentSeries = null;
let currentEpNumber = 1;
let hlsInstance = null;
let autoNextTimer = null;
let lastTapTime = 0;
let singleTapTimeout = null;

// Speeds cycle
const speeds = [1, 1.25, 1.5, 2];
let currentSpeedIndex = 0;

// DOM Elements
const video = document.getElementById("videoPlayer");
const viewport = document.getElementById("playerViewport");
const progressContainer = document.getElementById("progressContainer");
const progressFill = document.getElementById("progressFill");
const timeDisplay = document.getElementById("timeDisplay");
const btnPrevEp = document.getElementById("btnPrevEp");
const btnNextEp = document.getElementById("btnNextEp");
const drawer = document.getElementById("episodeDrawer");
const drawerList = document.getElementById("drawerList");
const btnOpenDrawer = document.getElementById("btnOpenDrawer");
const btnCloseDrawer = document.getElementById("btnCloseDrawer");
const btnSpeed = document.getElementById("btnSpeed");
const speedText = document.getElementById("speedText");
const btnMute = document.getElementById("btnMute");
const muteIcon = document.getElementById("muteIcon");
const btnFullscreen = document.getElementById("btnFullscreen");
const backBtn = document.getElementById("backBtn");
const autoNextToast = document.getElementById("autoNextToast");
const countdownSec = document.getElementById("countdownSec");
const cancelAutoNextBtn = document.getElementById("cancelAutoNextBtn");

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const seriesId = params.get("id");
  currentEpNumber = parseInt(params.get("ep")) || 1;

  if (!seriesId) {
    window.location.href = "/";
    return;
  }

  loadSeriesAndPlay(seriesId, currentEpNumber);
  setupPlayerInteractions();
  setupKeyboardControls();
  setupTouchSwipes();
});

async function loadSeriesAndPlay(seriesId, epNum) {
  try {
    const res = await fetch(`/api/series/${seriesId}`);
    if (!res.ok) throw new Error("Dizi bulunamadı");
    currentSeries = await res.json();
    currentEpNumber = epNum;

    document.getElementById("playerSeriesTitle").textContent = currentSeries.title;
    backBtn.onclick = () => (window.location.href = `/dizi?id=${currentSeries.id}`);

    renderDrawerList();
    playEpisode(currentEpNumber);
  } catch (err) {
    console.error("Dizi oynatıcı hatası:", err);
    alert("Dizi yüklenirken bir hata oluştu.");
    window.location.href = "/";
  }
}

function playEpisode(epNum) {
  clearAutoNext();
  currentEpNumber = epNum;

  const episodes = currentSeries.episodes || [];
  const epData = episodes.find((e) => e.episode === epNum) || episodes[0];

  if (!epData) {
    alert("Bu bölüm bulunamadı.");
    return;
  }

  // Update URL state without page reload
  history.replaceState(null, "", `/izle?id=${currentSeries.id}&ep=${epNum}`);
  document.title = `${currentSeries.title} - Bölüm ${epNum} | KısaDizim`;

  // Update UI Titles & Episode Nav Buttons
  document.getElementById("playerEpTitle").textContent = epData.title || `Bölüm ${epNum}`;
  btnPrevEp.disabled = epNum <= 1;
  btnNextEp.disabled = epNum >= episodes.length;

  highlightDrawerItem(epNum);

  // Clear previous subtitle tracks
  const oldTracks = video.querySelectorAll("track");
  oldTracks.forEach((t) => t.remove());

  // Attach Turkish Subtitle Track if available
  if (epData.subtitle_url) {
    let subUrl = epData.subtitle_url;
    subUrl = `/api/proxy?url=${encodeURIComponent(subUrl)}`;

    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = "Türkçe";
    track.srclang = "tr";
    track.src = subUrl;
    track.default = true;
    track.setAttribute("default", "true");

    track.addEventListener("load", function () {
      console.log("[Player] Türkçe altyazı başarıyla yüklendi.");
      if (track.track) {
        track.track.mode = "showing";
      }
    });

    video.appendChild(track);
    if (track.track) {
      track.track.mode = "showing";
    }
  }

  // Video Source Resolution
  let streamUrl = epData.video_url;
  if (streamUrl.includes(".m3u8") && !streamUrl.includes("localhost") && !streamUrl.includes("127.0.0.1")) {
    streamUrl = `/api/proxy?url=${encodeURIComponent(streamUrl)}`;
  }

  // Load in HLS.js or native HTML5
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  if (streamUrl.includes(".m3u8")) {
    if (Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsInstance.loadSource(streamUrl);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch((e) => console.log("Otomatik oynatma kullanıcı etkileşimi bekliyor"));
        ensureSubtitlesActive();
      });
      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hlsInstance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hlsInstance.recoverMediaError();
              break;
            default:
              hlsInstance.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.play().catch(() => {});
      ensureSubtitlesActive();
    }
  } else {
    // MP4
    video.src = streamUrl;
    video.play().catch(() => {});
    ensureSubtitlesActive();
  }
}

function ensureSubtitlesActive() {
  setTimeout(() => {
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = "showing";
    }
  }, 200);
}

// ==========================================
// Video Event Handlers & Progress
// ==========================================
video.addEventListener("timeupdate", () => {
  if (!video.duration) return;
  const progressPercent = (video.currentTime / video.duration) * 100;
  progressFill.style.width = `${progressPercent}%`;

  const cur = formatTime(video.currentTime);
  const dur = formatTime(video.duration);
  timeDisplay.textContent = `${cur} / ${dur}`;
});

video.addEventListener("play", () => {
  ensureSubtitlesActive();
});

video.addEventListener("ended", () => {
  const episodes = currentSeries.episodes || [];
  if (currentEpNumber < episodes.length) {
    startAutoNext(currentEpNumber + 1);
  }
});

function formatTime(seconds) {
  if (isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Progress Bar Scrubbing
progressContainer.addEventListener("click", (e) => {
  const rect = progressContainer.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  if (video.duration) {
    video.currentTime = pos * video.duration;
  }
});

// ==========================================
// Taps & Double Tap Gesture (Seek 10s / Play-Pause)
// ==========================================
function setupPlayerInteractions() {
  viewport.addEventListener("click", (e) => {
    if (e.target.closest("button") || e.target.closest(".episode-drawer") || e.target.closest(".progress-container")) {
      return;
    }

    const currentTime = Date.now();
    const tapInterval = currentTime - lastTapTime;

    const rect = viewport.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const isLeft = clickX < rect.width / 2;

    if (tapInterval < 280 && tapInterval > 0) {
      clearTimeout(singleTapTimeout);
      singleTapTimeout = null;

      if (isLeft) {
        seekVideo(-10);
        showRipple("seekLeft");
      } else {
        seekVideo(10);
        showRipple("seekRight");
      }
      lastTapTime = 0;
    } else {
      clearTimeout(singleTapTimeout);
      singleTapTimeout = setTimeout(() => {
        togglePlay();
        singleTapTimeout = null;
      }, 250);
      lastTapTime = currentTime;
    }
  });

  btnPrevEp.onclick = () => playEpisode(currentEpNumber - 1);
  btnNextEp.onclick = () => playEpisode(currentEpNumber + 1);

  btnSpeed.onclick = () => {
    currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
    const newSpeed = speeds[currentSpeedIndex];
    video.playbackRate = newSpeed;
    speedText.textContent = `${newSpeed}x`;
  };

  btnMute.onclick = () => {
    video.muted = !video.muted;
    muteIcon.className = video.muted ? "fas fa-volume-mute" : "fas fa-volume-up";
  };

  btnFullscreen.onclick = () => {
    if (!document.fullscreenElement) {
      viewport.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  btnOpenDrawer.onclick = () => drawer.classList.add("open");
  btnCloseDrawer.onclick = () => drawer.classList.remove("open");
}

function togglePlay() {
  const indicator = document.getElementById("centerTapIndicator");
  const icon = indicator.querySelector("i");

  if (video.paused) {
    video.play();
    icon.className = "fas fa-play";
  } else {
    video.pause();
    icon.className = "fas fa-pause";
  }

  indicator.classList.add("show");
  setTimeout(() => indicator.classList.remove("show"), 500);
}

function seekVideo(seconds) {
  if (video.duration) {
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  }
}

function showRipple(id) {
  const el = document.getElementById(id);
  el.classList.add("active");
  setTimeout(() => el.classList.remove("active"), 400);
}

// ==========================================
// Keyboard Controls
// ==========================================
function setupKeyboardControls() {
  document.addEventListener("keydown", (e) => {
    const key = e.key;
    if (key === " " || key === "k" || key === "K") {
      e.preventDefault();
      togglePlay();
    } else if (key === "ArrowLeft") {
      e.preventDefault();
      seekVideo(-10);
      showRipple("seekLeft");
    } else if (key === "ArrowRight") {
      e.preventDefault();
      seekVideo(10);
      showRipple("seekRight");
    } else if (key === "ArrowUp") {
      e.preventDefault();
      if (currentEpNumber > 1) playEpisode(currentEpNumber - 1);
    } else if (key === "ArrowDown") {
      e.preventDefault();
      const episodes = currentSeries.episodes || [];
      if (currentEpNumber < episodes.length) playEpisode(currentEpNumber + 1);
    } else if (key === "f" || key === "F") {
      btnFullscreen.click();
    } else if (key === "m" || key === "M") {
      btnMute.click();
    }
  });
}

// ==========================================
// Touch Swipes
// ==========================================
function setupTouchSwipes() {
  let touchStartY = 0;
  let touchEndY = 0;

  viewport.addEventListener("touchstart", (e) => {
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  viewport.addEventListener("touchend", (e) => {
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
  }, { passive: true });

  function handleSwipe() {
    const diff = touchStartY - touchEndY;
    const threshold = 70;

    if (diff > threshold) {
      const episodes = currentSeries.episodes || [];
      if (currentEpNumber < episodes.length) {
        playEpisode(currentEpNumber + 1);
      }
    } else if (diff < -threshold) {
      if (currentEpNumber > 1) {
        playEpisode(currentEpNumber - 1);
      }
    }
  }
}

// ==========================================
// Episode Drawer List
// ==========================================
function renderDrawerList() {
  const episodes = currentSeries.episodes || [];
  drawerList.innerHTML = episodes
    .map(
      (ep) => `
      <button class="drawer-item ${ep.episode === currentEpNumber ? "active" : ""}" data-ep="${ep.episode}">
        Bölüm ${ep.episode}
      </button>
    `
    )
    .join("");

  drawerList.addEventListener("click", (e) => {
    const item = e.target.closest(".drawer-item");
    if (!item) return;
    const ep = parseInt(item.dataset.ep);
    playEpisode(ep);
    drawer.classList.remove("open");
  });
}

function highlightDrawerItem(epNum) {
  drawerList.querySelectorAll(".drawer-item").forEach((item) => {
    const ep = parseInt(item.dataset.ep);
    if (ep === epNum) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

// ==========================================
// Auto-Next Toast Countdown
// ==========================================
function startAutoNext(nextEpNum) {
  let secondsLeft = 3;
  countdownSec.textContent = secondsLeft;
  autoNextToast.style.display = "flex";

  autoNextTimer = setInterval(() => {
    secondsLeft--;
    countdownSec.textContent = secondsLeft;
    if (secondsLeft <= 0) {
      clearAutoNext();
      playEpisode(nextEpNum);
    }
  }, 1000);

  cancelAutoNextBtn.onclick = () => clearAutoNext();
}

function clearAutoNext() {
  if (autoNextTimer) {
    clearInterval(autoNextTimer);
    autoNextTimer = null;
  }
  autoNextToast.style.display = "none";
}
