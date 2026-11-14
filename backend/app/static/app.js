/**
 * FIELDShift AI — NASA SMAP Level-4 Scientific & Agricultural Explorer
 * Multi-Page Architecture & Moroccan Darija (الدارجة المغربية) Explanation Engine
 */

// Application State
const AppState = {
  view: "welcome", // "welcome" | "choice" | "agri" | "sci"
  location: {
    city: "Ma Position Actuelle",
    lat: 33.8938,
    lon: -5.5516
  },
  year: "2025",
  agriData: null,
  sciData: null,
  activeSciCatFilter: "all",
  aiFocus: null, // { type: 'chart' | 'variable', id: string, name: string }
  lastVariable: null
};

let chartInstances = {};
let allVariablesCatalog = {};
const STORAGE_LOCATION_KEY = "fieldshift_smap_user_location";

document.addEventListener("DOMContentLoaded", () => {
  initNavTabs();
  initSubTabsInsideModes();
  initHeroActions();
  initChoiceViewControls();
  initAgriViewControls();
  initSciViewControls();
  initClassicPower();
  initDarijaDrawer();
  loadVariablesCatalog();
  initAiPageViewControls();

  // Restore saved location if present, else auto-detect GPS
  restoreSavedLocation();

  // Show welcome view first (clean, no clutter)
  showSmapView("welcome");
});

/* ==========================================================================
   Multi-View Page Switching Architecture
   ========================================================================== */
function showSmapView(viewName) {
  AppState.view = viewName;
  const views = ["welcome", "choice", "agri", "sci", "ai"];
  
  views.forEach(v => {
    const el = document.getElementById(`smap-view-${v}`);
    if (el) {
      if (v === viewName) {
        el.hidden = false;
        el.classList.add("active");
      } else {
        el.hidden = true;
        el.classList.remove("active");
      }
    }
  });

  // Trigger resize on visible Chart.js instances
  setTimeout(() => {
    Object.values(chartInstances).forEach(c => c && c.resize && c.resize());
  }, 60);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ==========================================================================
   Navigation Tabs (SMAP Explorer vs NASA POWER vs Catalog)
   ========================================================================== */
function initNavTabs() {
  const tabs = document.querySelectorAll(".main-nav .tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const targetId = `tab-${tab.dataset.tab}`;
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add("active");
    });
  });

  // Error dismiss button
  const errDismiss = document.getElementById("btn-error-dismiss");
  if (errDismiss) {
    errDismiss.addEventListener("click", () => {
      document.getElementById("smap-error").hidden = true;
    });
  }
}

function initSubTabsInsideModes() {
  document.querySelectorAll(".v-tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const parent = btn.closest(".smap-view-page");
      if (!parent) return;

      parent.querySelectorAll(".v-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const targetId = btn.dataset.vsub;
      parent.querySelectorAll(".v-sub-content").forEach(c => c.classList.remove("active"));
      const target = document.getElementById(targetId);
      if (target) target.classList.add("active");

      setTimeout(() => {
        Object.values(chartInstances).forEach(c => c && c.resize && c.resize());
      }, 50);
    });
  });
}

/* ==========================================================================
   VUE 1 : ACCUEIL & ENTRÉE (Hero Actions)
   ========================================================================== */
function initHeroActions() {
  const btnStart = document.getElementById("btn-hero-start");
  if (btnStart) {
    btnStart.addEventListener("click", () => {
      updateChoiceLocationDisplay();
      showSmapView("choice");

      // Auto-request GPS if user hasn't explicitly set a location yet
      const saved = localStorage.getItem(STORAGE_LOCATION_KEY);
      if (!saved && "geolocation" in navigator) {
        getUserLocation({ autoFetch: false, userTriggered: false });
      }
    });
  }
}

/* ==========================================================================
   VUE 2 : SÉLECTION DE LOCALISATION & CHOIX DU MODE
   ========================================================================== */
function initChoiceViewControls() {
  // GPS Button
  const btnGps = document.getElementById("choice-btn-gps");
  if (btnGps) {
    btnGps.addEventListener("click", () => {
      getUserLocation({ autoFetch: false, userTriggered: true });
    });
  }

  // Quick preset chips
  document.querySelectorAll(".city-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".city-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");

      AppState.location.city = chip.dataset.city;
      AppState.location.lat = parseFloat(chip.dataset.lat);
      AppState.location.lon = parseFloat(chip.dataset.lon);

      saveLocation(AppState.location);
      updateChoiceLocationDisplay();
    });
  });

  // Search input & button
  const btnSearch = document.getElementById("choice-btn-search");
  const inputSearch = document.getElementById("choice-search-city");
  
  const handleSearch = async () => {
    const q = inputSearch.value.trim();
    if (!q) return;

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        AppState.location.lat = parseFloat(item.lat);
        AppState.location.lon = parseFloat(item.lon);
        AppState.location.city = item.display_name.split(",").slice(0, 2).join(",").trim();

        document.querySelectorAll(".city-chip").forEach(c => c.classList.remove("active"));
        saveLocation(AppState.location);
        updateChoiceLocationDisplay();
      } else {
        alert("Localité non trouvée. Veuillez préciser le nom de la ville.");
      }
    } catch (e) {
      console.warn("Geocoding search error:", e);
    }
  };

  if (btnSearch) btnSearch.addEventListener("click", handleSearch);
  if (inputSearch) {
    inputSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    });
  }

  // Year select
  const selectYear = document.getElementById("choice-year-select");
  if (selectYear) {
    selectYear.addEventListener("change", () => {
      AppState.year = selectYear.value;
      // sync with agri & sci year selects
      syncYearSelects(AppState.year);
    });
  }

  // Button 1: Mode Agricole
  const btnAgri = document.getElementById("btn-choose-agri");
  if (btnAgri) {
    btnAgri.addEventListener("click", async () => {
      await loadAndDisplayAgriMode();
    });
  }

  // Button 2: Mode Scientifique
  const btnSci = document.getElementById("btn-choose-sci");
  if (btnSci) {
    btnSci.addEventListener("click", async () => {
      await loadAndDisplaySciMode();
    });
  }

  // Button 3: Mode Conseiller IA & Plan d'Action
  const btnAi = document.getElementById("btn-choose-ai");
  if (btnAi) {
    btnAi.addEventListener("click", async () => {
      await loadAndDisplayAiMode();
    });
  }

  // Back to welcome
  const btnBackWelcome = document.getElementById("btn-back-to-welcome");
  if (btnBackWelcome) {
    btnBackWelcome.addEventListener("click", () => {
      showSmapView("welcome");
    });
  }
}

function updateChoiceLocationDisplay() {
  const cityEl = document.getElementById("choice-display-city");
  const coordsEl = document.getElementById("choice-display-coords");
  if (cityEl) cityEl.textContent = AppState.location.city;
  if (coordsEl) coordsEl.textContent = `Coordonnées : ${AppState.location.lat.toFixed(4)}°N, ${AppState.location.lon.toFixed(4)}°W (EASE-Grid 2.0 ~9-11 km)`;

  const aiLocEl = document.getElementById("ai-page-current-loc");
  const aiStripEl = document.getElementById("ai-strip-city");
  if (aiLocEl) aiLocEl.textContent = `📍 ${AppState.location.city}`;
  if (aiStripEl) aiStripEl.textContent = `📍 ${AppState.location.city} (${AppState.location.lat.toFixed(4)}°N, ${AppState.location.lon.toFixed(4)}°W)`;

  syncAiContextStrip();
}

function syncYearSelects(yearVal) {
  ["choice-year-select", "agri-year-select", "sci-year-select", "ai-page-year-select"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = yearVal;
  });
  syncAiContextStrip();
}

function saveLocation(loc) {
  try {
    localStorage.setItem(STORAGE_LOCATION_KEY, JSON.stringify(loc));
  } catch (e) {
    console.warn("Failed to store location:", e);
  }
}

function restoreSavedLocation() {
  try {
    const saved = localStorage.getItem(STORAGE_LOCATION_KEY);
    if (saved) {
      const loc = JSON.parse(saved);
      if (loc && loc.lat && loc.lon) {
        AppState.location.lat = parseFloat(loc.lat);
        AppState.location.lon = parseFloat(loc.lon);
        AppState.location.city = loc.city || `${AppState.location.lat.toFixed(4)}, ${AppState.location.lon.toFixed(4)}`;
      }
    }
  } catch (e) {
    console.warn("Error reading stored location:", e);
  }
  updateChoiceLocationDisplay();
}

async function getUserLocation({ autoFetch = false, userTriggered = false } = {}) {
  const feedback = document.getElementById("choice-gps-feedback");
  const feedbackText = document.getElementById("choice-gps-status-text");

  if (!("geolocation" in navigator)) {
    if (userTriggered) alert("La géolocalisation GPS n'est pas supportée par votre navigateur.");
    return;
  }

  if (feedback && feedbackText) {
    feedback.hidden = false;
    feedbackText.textContent = "🛰️ Détection de vos coordonnées GPS en cours...";
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      AppState.location.lat = lat;
      AppState.location.lon = lon;

      let cityName = `Position GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`;

      // Try reverse geocoding via backend first
      try {
        const revRes = await fetch(`/api/smap-gee/reverse-geocode?latitude=${lat}&longitude=${lon}`);
        if (revRes.ok) {
          const revData = await revRes.json();
          if (revData && revData.city && !revData.city.startsWith("Coordonnées")) {
            cityName = revData.city;
          }
        }
      } catch (e) {
        console.warn("Backend reverse geocode failed:", e);
      }

      // Fallback to client reverse geocode if generic
      if (cityName.startsWith("Position GPS") || cityName.startsWith("Coordonnées")) {
        try {
          const directRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1`);
          if (directRes.ok) {
            const d = await directRes.json();
            const addr = d.address || {};
            const place = addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.county || addr.state;
            const country = addr.country || "";
            if (place) cityName = country ? `${place}, ${country}` : place;
          }
        } catch (e2) {
          console.warn("Client reverse geocode failed:", e2);
        }
      }

      AppState.location.city = cityName;
      saveLocation(AppState.location);
      updateChoiceLocationDisplay();

      if (feedback && feedbackText) {
        feedbackText.textContent = `✅ Position GPS active : ${cityName} (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°W)`;
      }

      // Mark chips inactive
      document.querySelectorAll(".city-chip").forEach(c => c.classList.remove("active"));
    },
    (err) => {
      console.warn("Geolocation denied or error:", err);
      if (feedback && feedbackText) {
        if (userTriggered) {
          feedback.hidden = false;
          feedbackText.textContent = `⚠️ Impossible d'obtenir votre position GPS (${err.message}). Veuillez sélectionner une ville manuellement.`;
        } else {
          feedback.hidden = true;
        }
      }
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

/* ==========================================================================
   VUE 3 : PAGE DÉDIÉE : MODE AGRICOLE (16 variables)
   ========================================================================== */
function initAgriViewControls() {
  // Back to choice
  const btnBack = document.getElementById("btn-back-from-agri");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      updateChoiceLocationDisplay();
      showSmapView("choice");
    });
  }

  // Switch to scientific mode directly
  const btnSwitch = document.getElementById("btn-switch-to-sci");
  if (btnSwitch) {
    btnSwitch.addEventListener("click", async () => {
      await loadAndDisplaySciMode();
    });
  }

  // Switch to AI Advisor mode directly
  const btnSwitchAi = document.getElementById("btn-switch-agri-to-ai");
  if (btnSwitchAi) {
    btnSwitchAi.addEventListener("click", async () => {
      await loadAndDisplayAiMode();
    });
  }

  // Year select
  const selectYear = document.getElementById("agri-year-select");
  if (selectYear) {
    selectYear.addEventListener("change", async () => {
      AppState.year = selectYear.value;
      syncYearSelects(AppState.year);
      await loadAndDisplayAgriMode(true);
    });
  }
}

async function loadAndDisplayAgriMode(forceReload = false) {
  // Update header info
  document.getElementById("agri-current-loc").textContent = `📍 ${AppState.location.city} (${AppState.location.lat.toFixed(4)}°N, ${AppState.location.lon.toFixed(4)}°W)`;
  document.getElementById("agri-year-select").value = AppState.year;

  // Check if we already have the exact data cached in memory
  const isCached = !forceReload && AppState.agriData && 
    AppState.agriData.location.requested_latitude === AppState.location.lat &&
    AppState.agriData.location.requested_longitude === AppState.location.lon &&
    AppState.agriData.year == AppState.year;

  if (!isCached) {
    const data = await fetchSmapApi({
      mode: "agricultural",
      year: AppState.year,
      lat: AppState.location.lat,
      lon: AppState.location.lon,
      city: AppState.location.city
    });
    if (!data) return;
    AppState.agriData = data;
  }

  renderAgriDashboard(AppState.agriData);
  showSmapView("agri");
}

function renderAgriDashboard(data) {
  // Status strip
  document.getElementById("agri-strip-cache").textContent = data.cached ? "Cache : Disque (HIT)" : "Cache : Requête GEE (MISS)";
  document.getElementById("agri-strip-obs").textContent = `${data.monthly_series.reduce((acc, m) => acc + m.observation_count, 0)} obs. 3h`;
  document.getElementById("agri-strip-time").textContent = `${data.processing_time_ms} ms`;

  // 1. Render 16 Summary Cards
  renderAgriCards(data);

  // 2. Render Charts
  renderAgriMoistureChart(data);
  renderAgriDroughtCharts(data);
  renderAgriWaterChart(data);

  // 3. Render Table
  renderAgriTable(data);
}

function renderAgriCards(data) {
  const container = document.getElementById("agri-cards-container");
  container.innerHTML = "";

  if (!data.summary_cards || data.summary_cards.length === 0) {
    container.innerHTML = `<p class="hint">Aucune carte agricole disponible.</p>`;
    return;
  }

  data.summary_cards.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = `smap-card ${card.status_tone || 'normal'}`;

    let changeHtml = `<span class="card-change">Stable</span>`;
    if (card.change_vs_previous_month_pct !== null) {
      const isPos = card.change_vs_previous_month_pct > 0;
      const sign = isPos ? "+" : "";
      const cls = isPos ? "positive" : "negative";
      changeHtml = `<span class="card-change ${cls}">${sign}${card.change_vs_previous_month_pct}% vs mois préc.</span>`;
    }

    cardEl.innerHTML = `
      <div class="card-top">
        <span class="card-title">${card.title}</span>
        <span class="card-tone-pill status-badge ${card.status_tone}">${card.status_tone}</span>
      </div>
      <div class="card-value-row">
        <span class="card-value">${card.value !== null ? card.value : '—'}</span>
        <span class="card-unit">${card.display_unit}</span>
      </div>
      <div class="card-bottom">
        ${changeHtml}
        <span class="card-darija-pill">💡 الشرح بالدارجة</span>
      </div>
    `;

    cardEl.addEventListener("click", () => {
      openDarijaDrawer(card.id, card.value, card.period, data.location.name);
    });

    container.appendChild(cardEl);
  });
}

function renderAgriMoistureChart(data) {
  destroyChart("agri-moisture");
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById("chart-agri-moisture");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const labels = data.monthly_series.map(m => m.month_name);

  const surfData = data.monthly_series.map(m => m.display_values["sm_surface"]);
  const rootData = data.monthly_series.map(m => m.display_values["sm_rootzone"]);
  const profData = data.monthly_series.map(m => m.display_values["sm_profile"]);

  chartInstances["agri-moisture"] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Surface (0-5 cm)",
          data: surfData,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.1)",
          fill: true,
          tension: 0.3,
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: "Zone Racinaire (0-100 cm)",
          data: rootData,
          borderColor: "#16a34a",
          backgroundColor: "rgba(22, 163, 74, 0.05)",
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: "Profil Total",
          data: profData,
          borderColor: "#9333ea",
          borderDash: [5, 5],
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} m³/m³`
          }
        }
      },
      scales: {
        y: {
          title: { display: true, text: "Humidité Volumétrique (m³/m³)" },
          min: 0,
          suggestedMax: 0.5
        }
      }
    }
  });

  // Agronomic insight
  const validRoot = rootData.filter(v => v !== null);
  if (validRoot.length > 0) {
    const avg = (validRoot.reduce((a, b) => a + b, 0) / validRoot.length).toFixed(3);
    const insightEl = document.getElementById("agri-insight-moisture");
    if (insightEl) {
      insightEl.textContent = `Humidité moyenne de la zone racinaire : ${avg} m³/m³. Les pics correspondent à la recharge hivernale, tandis que la baisse printanière indique la reprise végétative et l'absorption transpiratoire des cultures.`;
    }
  }
}

function renderAgriDroughtCharts(data) {
  destroyChart("agri-drought");
  destroyChart("agri-wetness");
  if (typeof Chart === "undefined") return;

  const labels = data.monthly_series.map(m => m.month_name);

  // 1. Drought percentiles
  const pctlCanvas = document.getElementById("chart-agri-drought-pctl");
  if (pctlCanvas) {
    const pctlData = data.monthly_series.map(m => m.display_values["sm_rootzone_pctl"]);
    chartInstances["agri-drought"] = new Chart(pctlCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Percentile Racinaire (%)",
          data: pctlData,
          backgroundColor: pctlData.map(v => {
            if (v === null) return "#cbd5e1";
            if (v < 20) return "#dc2626";
            if (v < 40) return "#f59e0b";
            return "#16a34a";
          }),
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 100,
            title: { display: true, text: "Percentile (%)" }
          }
        }
      }
    });
  }

  // 2. Wetness degree
  const wetCanvas = document.getElementById("chart-agri-wetness");
  if (wetCanvas) {
    const wetData = data.monthly_series.map(m => m.display_values["sm_rootzone_wetness"]);
    chartInstances["agri-wetness"] = new Chart(wetCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Saturation Sol (0-1)",
          data: wetData,
          borderColor: "#0284c7",
          backgroundColor: "rgba(2, 132, 199, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 1.0,
            title: { display: true, text: "Degré de Saturation (0 à 1)" }
          }
        }
      }
    });
  }
}

function renderAgriWaterChart(data) {
  destroyChart("agri-water");
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById("chart-agri-water-flux");
  if (!canvas) return;

  const labels = data.monthly_series.map(m => m.month_name);
  const etData = data.monthly_series.map(m => m.display_values["evapotranspiration"]);
  const infData = data.monthly_series.map(m => m.display_values["infiltration"]);
  const runData = data.monthly_series.map(m => m.display_values["surface_runoff"]);

  chartInstances["agri-water"] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Évapotranspiration (ET)",
          data: etData,
          backgroundColor: "#f97316",
          borderRadius: 4
        },
        {
          label: "Infiltration Sol",
          data: infData,
          backgroundColor: "#16a34a",
          borderRadius: 4
        },
        {
          label: "Ruissellement Surface",
          data: runData,
          backgroundColor: "#3b82f6",
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          title: { display: true, text: "Flux (mm/jour)" },
          min: 0
        }
      }
    }
  });
}

function renderAgriTable(data) {
  const tbody = document.getElementById("tbody-agri-summary");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!data.annual_summary || data.annual_summary.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">Aucune donnée disponible.</td></tr>`;
    return;
  }

  data.annual_summary.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${item.name_fr}</strong> <small style="color:#64748b">(${item.variable_id})</small></td>
      <td><strong>${item.mean !== null ? item.mean : '—'}</strong></td>
      <td>${item.min !== null ? item.min : '—'}</td>
      <td>${item.max !== null ? item.max : '—'}</td>
      <td>${item.display_unit}</td>
      <td><span class="status-badge ${item.completeness_pct >= 90 ? 'optimal' : 'warning'}">${item.completeness_pct}%</span></td>
      <td>${item.seasonal_trend || '—'}</td>
      <td><button type="button" class="btn-sm" style="font-family:var(--font-arabic);font-weight:700">💡 الشرح بالدارجة</button></td>
    `;

    tr.addEventListener("click", () => {
      openDarijaDrawer(item.variable_id, item.mean, "Moyenne annuelle", data.location.name);
    });

    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   VUE 4 : PAGE DÉDIÉE : MODE SCIENTIFIQUE (46 variables)
   ========================================================================== */
function initSciViewControls() {
  // Back to choice
  const btnBack = document.getElementById("btn-back-from-sci");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      updateChoiceLocationDisplay();
      showSmapView("choice");
    });
  }

  // Switch to agricultural mode directly
  const btnSwitch = document.getElementById("btn-switch-to-agri");
  if (btnSwitch) {
    btnSwitch.addEventListener("click", async () => {
      await loadAndDisplayAgriMode();
    });
  }

  // Switch to AI Advisor mode directly
  const btnSwitchAi = document.getElementById("btn-switch-sci-to-ai");
  if (btnSwitchAi) {
    btnSwitchAi.addEventListener("click", async () => {
      await loadAndDisplayAiMode();
    });
  }

  // Year select
  const selectYear = document.getElementById("sci-year-select");
  if (selectYear) {
    selectYear.addEventListener("change", async () => {
      AppState.year = selectYear.value;
      syncYearSelects(AppState.year);
      await loadAndDisplaySciMode(true);
    });
  }

  // Cross comparator button
  const btnCross = document.getElementById("sci-btn-update-cross");
  if (btnCross) {
    btnCross.addEventListener("click", () => {
      if (AppState.sciData) renderSciCrossChart(AppState.sciData);
    });
  }

  // Table search
  const tableSearch = document.getElementById("sci-table-search");
  if (tableSearch) {
    tableSearch.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll("#tbody-sci-detailed tr").forEach(r => {
        r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }

  // Table exports
  const btnCsv = document.getElementById("sci-btn-export-csv");
  if (btnCsv) {
    btnCsv.addEventListener("click", () => exportTableToCSV(AppState.sciData));
  }
  const btnJson = document.getElementById("sci-btn-export-json");
  if (btnJson) {
    btnJson.addEventListener("click", () => exportTableToJSON(AppState.sciData));
  }
}

async function loadAndDisplaySciMode(forceReload = false) {
  // Update header info
  document.getElementById("sci-current-loc").textContent = `📍 ${AppState.location.city} (${AppState.location.lat.toFixed(4)}°N, ${AppState.location.lon.toFixed(4)}°W)`;
  document.getElementById("sci-year-select").value = AppState.year;

  const isCached = !forceReload && AppState.sciData && 
    AppState.sciData.location.requested_latitude === AppState.location.lat &&
    AppState.sciData.location.requested_longitude === AppState.location.lon &&
    AppState.sciData.year == AppState.year;

  if (!isCached) {
    const data = await fetchSmapApi({
      mode: "scientific",
      year: AppState.year,
      lat: AppState.location.lat,
      lon: AppState.location.lon,
      city: AppState.location.city
    });
    if (!data) return;
    AppState.sciData = data;
  }

  renderSciDashboard(AppState.sciData);
  showSmapView("sci");
}

function renderSciDashboard(data) {
  // Status strip
  document.getElementById("sci-strip-cache").textContent = data.cached ? "Cache : Disque (HIT)" : "Cache : Requête GEE (MISS)";
  document.getElementById("sci-strip-obs").textContent = `46 variables · ${data.monthly_series.reduce((acc, m) => acc + m.observation_count, 0)} obs. 3h`;
  document.getElementById("sci-strip-time").textContent = `${data.processing_time_ms} ms`;

  // 1. Build Category Chips & Render 46 Cards
  renderSciCategoryChips(data);
  renderSciCards(data, AppState.activeSciCatFilter);

  // 2. Charts
  renderSciTempChart(data);
  renderSciFluxChart(data);
  populateSciCrossSelectors(data);
  renderSciCrossChart(data);

  // 3. Detailed Full Table
  renderSciDetailedTable(data);
}

function renderSciCategoryChips(data) {
  const container = document.getElementById("sci-category-filter-chips");
  if (!container) return;

  const categories = {
    all: { name: `Toutes (${data.summary_cards.length})` },
    soil_moisture: { name: "💧 Humidité du Sol" },
    soil_wetness: { name: "🌊 Saturation" },
    anomalies: { name: "🌵 Sécheresse & Anomalies" },
    soil_temperature: { name: "🌡️ Températures Multicouches" },
    evapotranspiration: { name: "☁️ Évapotranspiration" },
    water_fluxes: { name: "💧 Flux Hydriques" },
    vegetation: { name: "🌿 Végétation" },
    energy_fluxes: { name: "⚡ Bilan Radiatif & Énergie" },
    biogeochemistry: { name: "🌱 Carbone / GPP" },
    ancillary: { name: "🛰️ Données Auxiliaires" }
  };

  container.innerHTML = "";
  Object.entries(categories).forEach(([key, val]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `cat-filter-chip ${key === AppState.activeSciCatFilter ? 'active' : ''}`;
    chip.textContent = val.name;
    chip.dataset.cat = key;

    chip.addEventListener("click", () => {
      container.querySelectorAll(".cat-filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      AppState.activeSciCatFilter = key;
      renderSciCards(data, key);
    });

    container.appendChild(chip);
  });
}

function renderSciCards(data, catFilter) {
  const container = document.getElementById("sci-cards-container");
  if (!container) return;
  container.innerHTML = "";

  const filteredCards = data.summary_cards.filter(c => {
    if (!catFilter || catFilter === "all") return true;
    return c.category === catFilter;
  });

  if (filteredCards.length === 0) {
    container.innerHTML = `<p class="hint">Aucune variable dans cette catégorie.</p>`;
    return;
  }

  filteredCards.forEach(card => {
    const cardEl = document.createElement("div");
    cardEl.className = `smap-card ${card.status_tone || 'normal'}`;

    let changeHtml = `<span class="card-change">Stable</span>`;
    if (card.change_vs_previous_month_pct !== null) {
      const isPos = card.change_vs_previous_month_pct > 0;
      const sign = isPos ? "+" : "";
      const cls = isPos ? "positive" : "negative";
      changeHtml = `<span class="card-change ${cls}">${sign}${card.change_vs_previous_month_pct}% vs mois préc.</span>`;
    }

    cardEl.innerHTML = `
      <div class="card-top">
        <span class="card-title">${card.title}</span>
        <span class="card-tone-pill status-badge ${card.status_tone}">${card.category}</span>
      </div>
      <div class="card-value-row">
        <span class="card-value">${card.value !== null ? card.value : '—'}</span>
        <span class="card-unit">${card.display_unit}</span>
      </div>
      <div class="card-bottom">
        ${changeHtml}
        <span class="card-darija-pill">💡 الشرح بالدارجة</span>
      </div>
    `;

    cardEl.addEventListener("click", () => {
      openDarijaDrawer(card.id, card.value, card.period, data.location.name);
    });

    container.appendChild(cardEl);
  });
}

function renderSciTempChart(data) {
  destroyChart("sci-temp");
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById("chart-sci-temp");
  if (!canvas) return;

  const labels = data.monthly_series.map(m => m.month_name);
  const tSurf = data.monthly_series.map(m => m.display_values["temp_surface"]);
  const tL1 = data.monthly_series.map(m => m.display_values["temp_layer1"]);
  const tL2 = data.monthly_series.map(m => m.display_values["temp_layer2"]);
  const tL3 = data.monthly_series.map(m => m.display_values["temp_layer3"]);
  const tL4 = data.monthly_series.map(m => m.display_values["temp_layer4"]);
  const tBed = data.monthly_series.map(m => m.display_values["temp_bedrock"]);

  chartInstances["sci-temp"] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Surface", data: tSurf, borderColor: "#ef4444", tension: 0.3, pointRadius: 3 },
        { label: "Couche 1 (0-10 cm)", data: tL1, borderColor: "#f97316", tension: 0.3, pointRadius: 3 },
        { label: "Couche 2 (10-20 cm)", data: tL2, borderColor: "#eab308", tension: 0.3, pointRadius: 3 },
        { label: "Couche 3 (20-40 cm)", data: tL3, borderColor: "#10b981", tension: 0.3, pointRadius: 3 },
        { label: "Couche 4 (40-100 cm)", data: tL4, borderColor: "#06b6d4", tension: 0.3, pointRadius: 3 },
        { label: "Bedrock (Roche Mère)", data: tBed, borderColor: "#6366f1", borderDash: [4, 4], tension: 0.3, pointRadius: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { title: { display: true, text: "Température (°C)" } }
      }
    }
  });
}

function renderSciFluxChart(data) {
  destroyChart("sci-flux");
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById("chart-sci-flux");
  if (!canvas) return;

  const labels = data.monthly_series.map(m => m.month_name);
  const netRad = data.monthly_series.map(m => m.display_values["net_downward_radiation"]);
  const latHeat = data.monthly_series.map(m => m.display_values["latent_heat_flux"]);
  const sensHeat = data.monthly_series.map(m => m.display_values["sensible_heat_flux"]);

  chartInstances["sci-flux"] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Rayonnement Net Descendant", data: netRad, borderColor: "#dc2626", fill: false, tension: 0.3 },
        { label: "Chaleur Latente (Évaporation)", data: latHeat, borderColor: "#2563eb", fill: false, tension: 0.3 },
        { label: "Chaleur Sensible", data: sensHeat, borderColor: "#eab308", fill: false, tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { title: { display: true, text: "Flux Énergétique (W/m²)" } }
      }
    }
  });
}

function populateSciCrossSelectors(data) {
  const sel1 = document.getElementById("sci-select-y1");
  const sel2 = document.getElementById("sci-select-y2");
  if (!sel1 || !sel2) return;

  const vars = data.variables || [];
  sel1.innerHTML = "";
  sel2.innerHTML = "";

  vars.forEach(v => {
    const opt1 = document.createElement("option");
    opt1.value = v.id;
    opt1.textContent = `${v.name_fr} (${v.display_unit})`;
    sel1.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = v.id;
    opt2.textContent = `${v.name_fr} (${v.display_unit})`;
    sel2.appendChild(opt2);
  });

  if (vars.some(v => v.id === "sm_rootzone")) sel1.value = "sm_rootzone";
  if (vars.some(v => v.id === "evapotranspiration")) sel2.value = "evapotranspiration";
}

function renderSciCrossChart(data) {
  destroyChart("sci-cross");
  if (typeof Chart === "undefined") return;

  const canvas = document.getElementById("chart-sci-cross");
  if (!canvas) return;

  const sel1 = document.getElementById("sci-select-y1");
  const sel2 = document.getElementById("sci-select-y2");
  const id1 = sel1 ? sel1.value : "sm_rootzone";
  const id2 = sel2 ? sel2.value : "evapotranspiration";

  const v1Meta = data.variables.find(v => v.id === id1) || { name_fr: id1, display_unit: "" };
  const v2Meta = data.variables.find(v => v.id === id2) || { name_fr: id2, display_unit: "" };

  const labels = data.monthly_series.map(m => m.month_name);
  const data1 = data.monthly_series.map(m => m.display_values[id1]);
  const data2 = data.monthly_series.map(m => m.display_values[id2]);

  chartInstances["sci-cross"] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${v1Meta.name_fr} (${v1Meta.display_unit})`,
          data: data1,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.1)",
          yAxisID: "y1",
          tension: 0.3,
          pointRadius: 4
        },
        {
          label: `${v2Meta.name_fr} (${v2Meta.display_unit})`,
          data: data2,
          borderColor: "#16a34a",
          backgroundColor: "rgba(22, 163, 74, 0.1)",
          yAxisID: "y2",
          tension: 0.3,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y1: {
          type: "linear",
          position: "left",
          title: { display: true, text: `${v1Meta.name_fr} (${v1Meta.display_unit})` }
        },
        y2: {
          type: "linear",
          position: "right",
          title: { display: true, text: `${v2Meta.name_fr} (${v2Meta.display_unit})` },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function renderSciDetailedTable(data) {
  const thead = document.getElementById("thead-sci-detailed");
  const tbody = document.getElementById("tbody-sci-detailed");
  if (!thead || !tbody) return;

  thead.innerHTML = "";
  tbody.innerHTML = "";

  const activeVars = data.variables.map(v => v.id);

  // Build header row
  const headerTr = document.createElement("tr");
  headerTr.innerHTML = `<th>Mois</th><th>Obs</th>`;
  activeVars.forEach(vid => {
    const v = data.variables.find(item => item.id === vid);
    const th = document.createElement("th");
    th.innerHTML = `${v ? v.name_fr : vid} <br><small style="color:#64748b;font-weight:400">${v ? v.display_unit : ''}</small>`;
    headerTr.appendChild(th);
  });
  thead.appendChild(headerTr);

  // Build data rows
  data.monthly_series.forEach(pt => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${pt.month_name}</strong></td><td><span class="status-badge optimal">${pt.observation_count}</span></td>`;

    activeVars.forEach(vid => {
      const val = pt.display_values[vid];
      const td = document.createElement("td");
      td.textContent = val !== null ? val : '—';
      td.title = "Cliquez pour l'explication en Darija";
      td.style.cursor = "pointer";
      td.addEventListener("click", () => {
        openDarijaDrawer(vid, pt.raw_values[vid], `${pt.month_name} ${pt.year}`, data.location.name);
      });
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   Generic API Fetch Helper
   ========================================================================== */
async function fetchSmapApi({ mode, year, lat, lon, city, refresh = false }) {
  const loader = document.getElementById("smap-loader");
  const loaderText = document.getElementById("smap-loader-text");
  const errorBox = document.getElementById("smap-error");

  if (loader) {
    loader.hidden = false;
    if (loaderText) {
      loaderText.textContent = `Interrogation de Google Earth Engine pour ${city || 'vos coordonnées'} (NASA/SMAP/SPL4SMGP/008)...`;
    }
  }
  if (errorBox) errorBox.hidden = true;

  let url = `/api/smap-gee/timeseries?mode=${mode}&scale=11000&refresh=${refresh}&year=${year}`;
  if (lat && lon) {
    url += `&latitude=${lat}&longitude=${lon}`;
  }
  if (city) {
    url += `&city=${encodeURIComponent(city)}`;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || `Erreur HTTP ${res.status}`);
    }

    return data;
  } catch (err) {
    console.error("API Fetch error:", err);
    if (errorBox) {
      errorBox.hidden = false;
      document.getElementById("error-title").textContent = "Échec d'extraction satellite";
      document.getElementById("error-message").textContent = err.message;
    }
    return null;
  } finally {
    if (loader) loader.hidden = true;
  }
}

/* ==========================================================================
   Table Export Utilities
   ========================================================================== */
function exportTableToCSV(data) {
  if (!data) return;
  const vars = data.variables.map(v => v.id);
  const headers = ["Mois", "Annee", "Obs_Count", "Statut", ...vars];

  let csv = headers.join(",") + "\n";
  data.monthly_series.forEach(pt => {
    const row = [
      pt.month_name,
      pt.year,
      pt.observation_count,
      pt.quality_status,
      ...vars.map(v => pt.display_values[v] !== null ? pt.display_values[v] : "")
    ];
    csv += row.join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NASA_SMAP_L4_${data.location.requested_latitude}_${data.location.requested_longitude}.csv`;
  a.click();
}

function exportTableToJSON(data) {
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NASA_SMAP_L4_${data.location.requested_latitude}_${data.location.requested_longitude}.json`;
  a.click();
}

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    chartInstances[key] = null;
  }
}

/* ==========================================================================
   Moroccan Darija Drawer (الدارجة المغربية)
   ========================================================================== */
function initDarijaDrawer() {
  const drawer = document.getElementById("darija-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  const closeBtn = document.getElementById("btn-close-drawer");

  const closeDrawer = () => {
    drawer.classList.remove("open");
    backdrop.classList.remove("active");
  };

  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (backdrop) backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
}

async function openDarijaDrawer(varId, value, period, locationName) {
  const drawer = document.getElementById("darija-drawer");
  const backdrop = document.getElementById("drawer-backdrop");

  try {
    const valParam = (value !== null && value !== undefined) ? `&value=${value}` : "";
    const periodParam = period ? `&period=${encodeURIComponent(period)}` : "";
    const locParam = locationName ? `&location=${encodeURIComponent(locationName)}` : "";

    const res = await fetch(`/api/smap-gee/explain?variable=${varId}${valParam}${periodParam}${locParam}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.message || "Erreur de chargement");

    // Populate drawer elements
    document.getElementById("drawer-var-title").textContent = `${data.name_fr} (${data.variable_id})`;
    document.getElementById("drawer-var-en").textContent = data.name_en;
    document.getElementById("drawer-val-number").textContent = data.display_value;
    document.getElementById("drawer-val-period").textContent = data.period;
    document.getElementById("drawer-val-loc").textContent = data.location_name;

    document.getElementById("drawer-q1-what").textContent = data.what;
    document.getElementById("drawer-q2-why").textContent = data.why_agri;
    document.getElementById("drawer-q3-val").textContent = data.interpretation;
    document.getElementById("drawer-q4-unit").textContent = data.unit_explanation;
    document.getElementById("drawer-q5-source").textContent = data.source;
    document.getElementById("drawer-q6-trend").textContent = data.temporal_change;
    document.getElementById("drawer-q7-allowed").textContent = data.conclusions_allowed;
    document.getElementById("drawer-q8-forbidden").textContent = data.conclusions_forbidden;
    document.getElementById("drawer-caveat-text").textContent = data.caveat_note;

    AppState.lastVariable = {
      id: varId,
      name_fr: data.name_fr,
      name_en: data.name_en,
      display_value: data.display_value
    };

    drawer.classList.add("open");
    backdrop.classList.add("active");

  } catch (err) {
    console.warn("Failed to load Darija explanation:", err);
  }
}

/* ==========================================================================
   Catalogue des 46 Variables (Tab 3)
   ========================================================================== */
async function loadVariablesCatalog() {
  const filterRow = document.getElementById("catalog-category-filters");
  if (!filterRow) return;

  try {
    const res = await fetch("/api/smap-gee/variables");
    const data = await res.json();
    allVariablesCatalog = data;

    filterRow.innerHTML = `<button type="button" class="preset-btn active" data-cat="all">Toutes (${data.total_variables})</button>`;
    filterRow.innerHTML += `<button type="button" class="preset-btn" data-cat="agri">🌾 Agricoles (${data.agricultural_count})</button>`;

    Object.entries(data.categories).forEach(([catKey, catMeta]) => {
      filterRow.innerHTML += `<button type="button" class="preset-btn" data-cat="${catKey}">${catMeta.name_fr}</button>`;
    });

    renderCatalogGrid("all");

    filterRow.querySelectorAll(".preset-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        filterRow.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderCatalogGrid(btn.dataset.cat);
      });
    });

  } catch (err) {
    console.warn("Could not load catalog:", err);
  }
}

function renderCatalogGrid(catFilter) {
  const container = document.getElementById("catalog-cards-container");
  if (!container) return;
  container.innerHTML = "";

  const vars = Object.values(allVariablesCatalog.variables || {});
  const filtered = vars.filter(v => {
    if (catFilter === "all") return true;
    if (catFilter === "agri") return v.is_agricultural;
    return v.category === catFilter;
  });

  filtered.forEach(v => {
    const card = document.createElement("div");
    card.className = `smap-card catalog-card ${v.is_agricultural ? 'optimal' : 'normal'}`;
    card.innerHTML = `
      <div class="card-top">
        <span class="card-title">${v.name_fr}</span>
        <span class="card-tone-pill status-badge ${v.is_agricultural ? 'optimal' : 'info'}">${v.is_agricultural ? 'Agricole' : 'Scientifique'}</span>
      </div>
      <div style="font-size:0.85rem;color:#475569;margin:0.5rem 0">
        <code>${v.id}</code> · <strong>${v.display_unit}</strong>
      </div>
      <div class="card-bottom">
        <span style="font-size:0.75rem;color:#64748b">${v.name_en}</span>
        <span class="card-darija-pill">💡 الشرح بالدارجة</span>
      </div>
    `;

    card.addEventListener("click", () => {
      openDarijaDrawer(v.id, null, "Catalogue officiel", "Maroc");
    });

    container.appendChild(card);
  });
}

/* ==========================================================================
   Classic NASA POWER / CMR Handlers (Tab 2)
   ========================================================================== */
function initClassicPower() {
  const form = document.querySelector("#query-form");
  if (!form) return;

  const sourceInput = document.querySelector("#source");
  const endpointInput = document.querySelector("#endpoint");
  const endpointField = document.querySelector("#endpoint-field");
  const thresholds = document.querySelector("#thresholds");
  const callBox = document.querySelector("#call");
  const idle = document.querySelector("#idle");
  const errorBox = document.querySelector("#error");
  const output = document.querySelector("#output");
  const rawBlock = document.querySelector("#raw-block");
  const raw = document.querySelector("#raw");

  const CATALOGUE_SET = new Set(["SPL3SMP_E", "SPL4SMGP", "GPM_3IMERGDF", "HLSL30"]);

  const syncSource = () => {
    const src = sourceInput.value;
    const isCat = CATALOGUE_SET.has(src);
    endpointField.hidden = src !== "power";
    thresholds.hidden = isCat || (src === "power" && endpointInput.value !== "summary");
  };

  sourceInput.addEventListener("change", syncSource);
  endpointInput.addEventListener("change", syncSource);
  syncSource();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    idle.hidden = true;
    errorBox.hidden = true;
    output.replaceChildren();
    rawBlock.hidden = true;

    const endpoint = endpointInput.value;
    const isCat = CATALOGUE_SET.has(sourceInput.value);
    const isAgro = sourceInput.value === "agro";
    const path = isCat ? "/api/catalogue" : (isAgro ? "/api/agro" : (endpoint === "summary" ? "/api/climate/summary" : (endpoint === "export" ? "/api/climate/export" : "/api/climate")));

    const params = new URLSearchParams();
    const city = document.querySelector("#city").value.trim();
    const lat = document.querySelector("#latitude").value.trim();
    const lon = document.querySelector("#longitude").value.trim();
    if (city) params.set("city", city);
    if (lat && lon) { params.set("latitude", lat); params.set("longitude", lon); }
    params.set("start_date", document.querySelector("#start-date").value);
    params.set("end_date", document.querySelector("#end-date").value);
    if (isCat) params.set("product", sourceInput.value);
    if (document.querySelector("#refresh").checked) params.set("refresh", "true");

    const fullUrl = `${path}?${params.toString()}`;
    const started = performance.now();

    try {
      const response = await fetch(fullUrl);
      const bodyText = await response.text();
      const elapsed = Math.round(performance.now() - started);

      callBox.hidden = false;
      document.querySelector("#status").textContent = response.status;
      document.querySelector("#elapsed").textContent = `${elapsed} ms`;
      document.querySelector("#request-url").textContent = fullUrl;

      if (!response.ok) {
        errorBox.hidden = false;
        errorBox.textContent = `Erreur HTTP ${response.status}: ${bodyText.slice(0, 300)}`;
      } else {
        rawBlock.hidden = false;
        raw.textContent = bodyText;
      }
    } catch (e) {
      errorBox.hidden = false;
      errorBox.textContent = `Erreur réseau: ${e.message}`;
    } finally {
      button.disabled = false;
    }
  });
}

/* ==========================================================================
   VUE 5 : PAGE DÉDIÉE : CONSEILLER IA & PLAN D'ACTION (Page 3)
   ========================================================================== */

function syncAiContextStrip() {
  const locEl = document.getElementById("ai-page-current-loc");
  const stripEl = document.getElementById("ai-strip-city");
  const yearEl = document.getElementById("ai-page-year-select");

  if (locEl && AppState.location) locEl.textContent = `📍 ${AppState.location.city}`;
  if (stripEl && AppState.location) stripEl.textContent = `📍 ${AppState.location.city} (${AppState.location.lat.toFixed(4)}°N, ${AppState.location.lon.toFixed(4)}°W)`;
  if (yearEl && AppState.year) yearEl.value = AppState.year;
}

function isArabicScript(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text || "");
}

function formatAiMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin:0.6rem 0 0.3rem;font-weight:700;color:#0f172a">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin:0.8rem 0 0.4rem;font-weight:800;color:#0f172a">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h3 style="margin:0.9rem 0 0.45rem;font-weight:800;color:#0f172a">$1</h3>');

  // Bold, italic, code
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.*?)`/g, '<code style="background:#f1f5f9;padding:0.1rem 0.35rem;border-radius:3px;font-size:0.85em">$1</code>');

  // Blockquotes
  html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gim, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:0.75rem 0">');

  // Markdown Table conversion
  const lines = html.split("\n");
  let inTable = false;
  let tableHtml = "";
  let outLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      if (line.replace(/[\s|:-]/g, "") === "") {
        continue;
      }
      const cells = line.slice(1, -1).split("|").map(c => c.trim());
      if (!inTable) {
        inTable = true;
        tableHtml = '<table><thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      } else {
        tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
    } else {
      if (inTable) {
        inTable = false;
        tableHtml += '</tbody></table>';
        outLines.push(tableHtml);
        tableHtml = "";
      }
      outLines.push(lines[i]);
    }
  }
  if (inTable) {
    tableHtml += '</tbody></table>';
    outLines.push(tableHtml);
  }

  html = outLines.join("\n");

  // Bullet lists
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gms, '<ul style="margin:0.4rem 0;padding-inline-start:1.25rem">$1</ul>');

  // Paragraphs
  html = html.split(/\n{2,}/).map(para => {
    para = para.trim();
    if (!para) return "";
    if (para.startsWith("<h") || para.startsWith("<table") || para.startsWith("<ul") || para.startsWith("<blockquote") || para.startsWith("<hr")) {
      return para;
    }
    return `<p style="margin:0 0 0.5rem">${para.replace(/\n/g, '<br>')}</p>`;
  }).join("\n");

  return html;
}

function initAiPageViewControls() {
  // Back to choice
  const btnBack = document.getElementById("btn-back-from-ai");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      updateChoiceLocationDisplay();
      showSmapView("choice");
    });
  }

  // Direct page switches
  const btnSwitchAgri = document.getElementById("btn-switch-ai-to-agri");
  if (btnSwitchAgri) {
    btnSwitchAgri.addEventListener("click", async () => {
      await loadAndDisplayAgriMode();
    });
  }

  const btnSwitchSci = document.getElementById("btn-switch-ai-to-sci");
  if (btnSwitchSci) {
    btnSwitchSci.addEventListener("click", async () => {
      await loadAndDisplaySciMode();
    });
  }

  // Year select
  const selectYear = document.getElementById("ai-page-year-select");
  if (selectYear) {
    selectYear.addEventListener("change", async () => {
      AppState.year = selectYear.value;
      syncYearSelects(AppState.year);
      await runVirtualLabSimulation("none");
    });
  }

  // Virtual Lab controls
  initVirtualLabControls();

  // Prompt chips
  const promptChips = document.getElementById("ai-page-prompt-chips");
  const input = document.getElementById("ai-page-input-text");
  const form = document.getElementById("ai-page-chat-form");

  if (promptChips) {
    promptChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".ai-prompt-chip");
      if (!chip) return;
      const promptText = chip.dataset.prompt;
      if (promptText && input) {
        input.value = promptText;
        if (form) form.dispatchEvent(new Event("submit"));
      }
    });
  }

  // Chat form submit
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = input.value.trim();
      if (!msg) return;

      input.value = "";
      input.style.height = "auto";
      await executeAiPageChat(msg);
    });

    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          form.dispatchEvent(new Event("submit"));
        }
      });
      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
      });
    }
  }
}

/* ==========================================================================
   VIRTUAL AGRICULTURAL LABORATORY ENGINE (المختبر الزراعي الافتراضي المحاكي للمستقبل)
   ========================================================================== */
function initVirtualLabControls() {
  if (AppState.simControlsInitialized) return;
  AppState.simControlsInitialized = true;

  // 1. Lab sub-tabs switcher
  document.querySelectorAll(".sim-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sim-tab-btn").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      const targetTabId = btn.dataset.simtab;
      document.querySelectorAll(".sim-tab-panel").forEach(panel => {
        panel.classList.remove("active");
        panel.hidden = true;
      });
      const targetPanel = document.getElementById(targetTabId);
      if (targetPanel) {
        targetPanel.classList.add("active");
        targetPanel.hidden = false;
      }
    });
  });

  // 2. Climate Attack Shock buttons
  document.querySelectorAll(".shock-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".shock-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const shock = btn.dataset.shock || "none";
      await runVirtualLabSimulation(shock);
    });
  });

  // 3. Farmer simulation form submission
  const simForm = document.getElementById("sim-config-form");
  if (simForm) {
    simForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const activeShockBtn = document.querySelector(".shock-btn.active");
      const shock = activeShockBtn ? activeShockBtn.dataset.shock : "none";
      await runVirtualLabSimulation(shock);
    });
  }

  // 4. Soil sampling protocol accordion toggle
  const btnToggleProto = document.getElementById("btn-toggle-protocol");
  const protoContent = document.getElementById("protocol-accordion-content");
  const protoArrow = document.getElementById("protocol-arrow");
  if (btnToggleProto && protoContent) {
    btnToggleProto.addEventListener("click", () => {
      const isHidden = protoContent.hidden;
      protoContent.hidden = !isHidden;
      if (protoArrow) protoArrow.textContent = isHidden ? "▲" : "▼";
      if (isHidden) renderSoilSamplingProtocol();
    });
  }
}

async function loadAndDisplayAiMode(forceReload = false) {
  showSmapView("ai");
  syncAiContextStrip();
  initVirtualLabControls();

  if (!AppState.simulationData || forceReload) {
    await runVirtualLabSimulation("none");
  }
}

async function runVirtualLabSimulation(shockOverride = "none") {
  const statusLabel = document.getElementById("sim-run-status");
  const runBtn = document.getElementById("btn-run-simulation");

  if (statusLabel) statusLabel.hidden = false;
  if (runBtn) runBtn.disabled = true;

  const soilSelect = document.getElementById("sim-soil-select");
  const waterSelect = document.getElementById("sim-water-select");
  const budgetSelect = document.getElementById("sim-budget-select");
  const refYearSelect = document.getElementById("sim-ref-year-select");

  const soilType = soilSelect ? soilSelect.value : "limoneux_profond";
  const waterAccess = waterSelect ? waterSelect.value : "appoint";
  const budget = budgetSelect ? budgetSelect.value : "moyen";
  const compareYear = refYearSelect ? parseInt(refYearSelect.value) : 2023;
  const simYear = parseInt(AppState.year) || 2025;

  const payload = {
    location: {
      name: AppState.location.city,
      latitude: AppState.location.lat,
      longitude: AppState.location.lon
    },
    year: simYear,
    soil_type: soilType,
    water_access: waterAccess,
    budget: budget,
    climate_shock: shockOverride,
    historical_compare_year: compareYear
  };

  try {
    const res = await fetch("/api/ai/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Erreur serveur ${res.status}`);
    }

    const data = await res.json();
    AppState.simulationData = data;

    // Render all 4 Virtual Laboratories
    renderCropBattleLab(data);
    renderClimateAttackLab(data);
    renderFarmTimeMachine(data);
    renderScientificTribunal(data);
    renderSoilSamplingProtocol();

  } catch (err) {
    console.error("Virtual Lab simulation error:", err);
    alert(`تعذر تشغيل المحاكاة: ${err.message}`);
  } finally {
    if (statusLabel) statusLabel.hidden = true;
    if (runBtn) runBtn.disabled = false;
  }
}

function renderCropBattleLab(data) {
  if (!data || !data.plans) return;

  const winner = data.plans.find(p => p.id === data.winner_plan_id) || data.plans[1] || data.plans[0];

  // 1. Top Winner Banner
  const titleEl = document.getElementById("battle-winner-title");
  const descEl = document.getElementById("battle-winner-desc");
  const scoreEl = document.getElementById("battle-winner-score");

  if (titleEl) titleEl.textContent = winner.name_ar;
  if (descEl) descEl.textContent = winner.summary_darija;
  if (scoreEl) scoreEl.textContent = Math.round(winner.resilience_score);

  // 2. Render 3 Plan Cards
  const plansContainer = document.getElementById("battle-plans-cards");
  if (plansContainer) {
    plansContainer.innerHTML = data.plans.map(p => {
      const isWinner = p.id === data.winner_plan_id;
      const stressFillClass = p.water_stress_risk_pct < 25 ? "fill-safe" : (p.water_stress_risk_pct < 50 ? "fill-moderate" : "fill-danger");

      return `
        <div class="plan-scorecard ${isWinner ? 'winner' : ''}">
          <div class="plan-card-header">
            <div class="plan-title-box">
              <h4>${isWinner ? '🏆 ' : ''}${p.name_ar}</h4>
              <p class="plan-title-sub">${p.name_fr}</p>
            </div>
            <div class="plan-resilience-badge">
              <span class="plan-res-val">${Math.round(p.resilience_score)}</span>
              <span class="plan-res-sub">الصمود</span>
            </div>
          </div>

          <div class="plan-metrics-grid">
            <div class="plan-metric-item">
              <span>💧 الاحتياج المائي : <strong>${p.water_need_mm} مم</strong></span>
              <div class="metric-bar-wrapper">
                <div class="metric-bar-fill fill-safe" style="width: ${Math.min(100, (p.water_need_mm / 450) * 100)}%"></div>
              </div>
            </div>
            <div class="plan-metric-item">
              <span>⚠️ خطر الإجهاد المائي : <strong>${p.water_stress_risk_pct}%</strong></span>
              <div class="metric-bar-wrapper">
                <div class="metric-bar-fill ${stressFillClass}" style="width: ${Math.min(100, p.water_stress_risk_pct)}%"></div>
              </div>
            </div>
            <div class="plan-metric-item">
              <span>🌱 صحة وخصوبة التربة : <strong>${p.soil_health_score}/100</strong></span>
              <div class="metric-bar-wrapper">
                <div class="metric-bar-fill fill-safe" style="width: ${p.soil_health_score}%"></div>
              </div>
            </div>
            <div class="plan-metric-item">
              <span>📈 استقرار الغلة والإنتاج : <strong>${p.yield_stability_score}/100</strong></span>
              <div class="metric-bar-wrapper">
                <div class="metric-bar-fill fill-safe" style="width: ${p.yield_stability_score}%"></div>
              </div>
            </div>
          </div>

          <div class="plan-summary-darija">
            <p>${p.summary_darija}</p>
          </div>

          <div class="plan-pro-con-grid">
            <div>
              <strong style="color:#166534">نقط القوة :</strong>
              <ul class="pro-list">
                ${(p.pros || []).map(item => `<li>${item}</li>`).join('')}
              </ul>
            </div>
            <div>
              <strong style="color:#991b1b">المخاطر :</strong>
              <ul class="con-list">
                ${(p.cons || []).map(item => `<li>${item}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Render Radar Chart
  renderSimRadarChart(data);
}

function renderSimRadarChart(data) {
  const canvas = document.getElementById("chart-sim-radar");
  if (!canvas || typeof Chart === "undefined") return;

  if (chartInstances["sim-radar"]) {
    chartInstances["sim-radar"].destroy();
  }

  const p1 = data.plans[0] || {};
  const p2 = data.plans[1] || {};
  const p3 = data.plans[2] || {};

  const labels = ["صمود الجفاف", "حفظ التربة", "ملائمة الميزانية", "توفير الماء", "استقرار الغلة"];

  const datasetP1 = [
    Math.max(5, 100 - (p1.water_stress_risk_pct || 0)),
    p1.soil_health_score || 40,
    p1.budget_fit_score || 70,
    Math.max(10, 100 - ((p1.water_deficit_mm || 0) * 0.4)),
    p1.yield_stability_score || 50
  ];

  const datasetP2 = [
    Math.max(5, 100 - (p2.water_stress_risk_pct || 0)),
    p2.soil_health_score || 80,
    p2.budget_fit_score || 85,
    Math.max(10, 100 - ((p2.water_deficit_mm || 0) * 0.4)),
    p2.yield_stability_score || 85
  ];

  const datasetP3 = [
    Math.max(5, 100 - (p3.water_stress_risk_pct || 0)),
    p3.soil_health_score || 95,
    p3.budget_fit_score || 90,
    Math.max(10, 100 - ((p3.water_deficit_mm || 0) * 0.4)),
    p3.yield_stability_score || 75
  ];

  chartInstances["sim-radar"] = new Chart(canvas.getContext("2d"), {
    type: "radar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "الخطة 1 : القمح كل عام",
          data: datasetP1,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.15)",
          borderWidth: 2,
          pointBackgroundColor: "#ef4444"
        },
        {
          label: "الخطة 2 : قمح - عدس - شعير",
          data: datasetP2,
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.25)",
          borderWidth: 2.5,
          pointBackgroundColor: "#10b981"
        },
        {
          label: "الخطة 3 : نظام بيئي وغطاء",
          data: datasetP3,
          borderColor: "#6366f1",
          backgroundColor: "rgba(99, 102, 241, 0.15)",
          borderWidth: 2,
          pointBackgroundColor: "#6366f1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            color: "#64748b",
            font: { size: 10 }
          },
          grid: {
            color: "#e2e8f0"
          },
          pointLabels: {
            font: {
              family: "Cairo",
              size: 11,
              weight: "bold"
            },
            color: "#1e293b"
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

function renderClimateAttackLab(data) {
  const summaryEl = document.getElementById("shock-impact-summary");
  const cardsContainer = document.getElementById("shock-cards-grid");

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem">
        <div>
          <h4 style="margin:0;font-size:1.05rem;color:#9a3412">🌪️ تقرير هجوم الصدمة المناخية : <strong>${data.shock_label}</strong></h4>
          <p style="margin:0.25rem 0 0;font-size:0.85rem;color:#7c2d12">
            تم تطبيق المحاكاة على تربة <strong>${data.soil_type_label}</strong> بحقلك بمعدل سقي <strong>${data.water_access_label}</strong>.
          </p>
        </div>
        <span class="crop-badge-fit" style="background:#ffedd5;color:#c2410c;border-color:#fed7aa">
          ⚡ محاكاة فيزيائية حقيقية
        </span>
      </div>
    `;
  }

  if (cardsContainer && data.plans) {
    cardsContainer.innerHTML = data.plans.map(p => {
      const isDangerous = p.water_stress_risk_pct > 50;
      return `
        <div class="tm-metric-card" style="border-left: 4px solid ${isDangerous ? '#ef4444' : '#10b981'}">
          <span class="tm-metric-label">${p.name_ar}</span>
          <div style="display:flex;justify-content:space-between;align-items:center;margin:0.4rem 0">
            <span class="tm-metric-val" style="color: ${isDangerous ? '#dc2626' : '#15803d'}">${p.water_stress_risk_pct}%</span>
            <span class="crop-badge-fit" style="background:${isDangerous ? '#fee2e2' : '#dcfce7'};color:${isDangerous ? '#991b1b' : '#166534'}">
              ${p.status_tag}
            </span>
          </div>
          <p style="font-size:0.8rem;color:#475569;margin:0.2rem 0">عجز مائي مسجل : <strong>${p.water_deficit_mm} مم</strong></p>
          <small style="color:#64748b;display:block;margin-top:0.3rem">${p.summary_darija.slice(0, 110)}...</small>
        </div>
      `;
    }).join('');
  }
}

function renderFarmTimeMachine(data) {
  const container = document.getElementById("tm-content-container");
  if (!container) return;

  const b = data.baseline_metrics || {};
  const winner = data.plans.find(p => p.id === data.winner_plan_id) || data.plans[1] || data.plans[0];
  const p1 = data.plans[0];

  const waterSaved = Math.max(0, Math.round((p1.water_need_mm || 440) - (winner.water_need_mm || 350)));
  const deficitSaved = Math.max(0, Math.round((p1.water_deficit_mm || 0) - (winner.water_deficit_mm || 0)));
  const irrSaved = Math.max(0, Math.round(b.irrigation_pumping_savings_mm || 0));
  const stressDiff = Math.max(0, Math.round((p1.water_stress_risk_pct || 50) - (winner.water_stress_risk_pct || 10)));
  const precipVal = b.annual_precipitation_mm !== undefined ? b.annual_precipitation_mm : (b.precip_annual_mm || 0);
  const smVal = b.rootzone_moisture_m3m3 !== undefined ? b.rootzone_moisture_m3m3 : (b.sm_rootzone_mean || 0);

  container.innerHTML = `
    <div class="tm-metrics-grid">
      <div class="tm-metric-card">
        <span class="tm-metric-label">التساقطات المسجلة تاريخياً (NASA POWER)</span>
        <span class="tm-metric-val">${precipVal} مم</span>
        <span class="tm-metric-diff diff-positive">بيانات حقيقية مرصودة</span>
      </div>

      <div class="tm-metric-card">
        <span class="tm-metric-label">رطوبة منطقة الجذور SMAP L4</span>
        <span class="tm-metric-val">${smVal} م³/م³</span>
        <span class="tm-metric-diff diff-positive">عمق 0-100 سم</span>
      </div>

      <div class="tm-metric-card">
        <span class="tm-metric-label">تقليص الطلب التبخري (${winner.name_ar.split(':')[0]})</span>
        <span class="tm-metric-val">-${waterSaved} مم</span>
        <span class="tm-metric-diff diff-positive">توفير -${waterSaved * 10} م³/هكتار (طلب تبخري ETc)</span>
      </div>

      <div class="tm-metric-card">
        <span class="tm-metric-label">تخفيض مؤشر الإجهاد المائي المحاكى</span>
        <span class="tm-metric-val">-${stressDiff}%</span>
        <span class="tm-metric-diff diff-positive">تقليص العجز: -${deficitSaved * 10} م³/هك</span>
      </div>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:1.25rem;direction:rtl;text-align:right;font-family:'Cairo',sans-serif">
      <h4 style="margin:0 0 0.5rem;font-size:1.05rem;color:#1e1b4b">
        💡 التحليل العكسي لآلة الزمن (Simulation Rétrospective)
      </h4>
      <p style="color:#334155;line-height:1.7;font-size:0.9rem;margin:0">
        لو كنتي فموسم حصاد (${data.year}) طبقتي <strong>${winner.name_ar}</strong> فبقعتك، 
        كنتي غادي تخفف الطلب التبخري الجوي بحوالي <strong>${waterSaved * 10} متر مكعب فكل هكتار</strong>، 
        وتقلص العجز المائي الصافي بمقدار <strong>${deficitSaved * 10} م³/هكتار</strong>، 
        مع تقليص سقي محاكى بمقدار <strong>${irrSaved * 10} م³/هكتار</strong> (تقدير رقمي غير معاير بعدادات ضخ ميدانية، و0 مم فالبور لغياب السقي أصلاً)، 
        بالإضافة لتثبيت حيوي للأزوت بفضل المحاصيل المتناوبة وتفادي انهيار الإنتاج الحاد الناتج عن زراعة القمح الأحادي المتواصل.
      </p>
    </div>
  `;
}

function renderScientificTribunal(data) {
  const grid = document.getElementById("tribunal-agents-grid");
  const supremeBox = document.getElementById("tribunal-supreme-box");

  if (grid && data.tribunal_verdicts) {
    grid.innerHTML = data.tribunal_verdicts.map(v => `
      <div class="tribunal-agent-card">
        <div class="tribunal-agent-header">
          <div class="tribunal-agent-avatar">${v.avatar}</div>
          <div>
            <span class="tribunal-agent-role">${v.agent_role}</span>
            <small class="tribunal-agent-name">${v.agent_name}</small>
          </div>
        </div>

        <div class="tribunal-evidence-chip">
          <strong>الدليل العلمي :</strong> ${v.key_evidence}
        </div>

        <div class="tribunal-verdict-text">
          <p>${v.argument_darija}</p>
        </div>
      </div>
    `).join('');
  }

  if (supremeBox) {
    supremeBox.innerHTML = `
      <div class="crop-reply-box" style="direction:rtl;text-align:right">
        ${formatAiMarkdown(data.overall_synthesis_darija)}
      </div>
      <div class="ai-bubble-meta" style="margin-top:1.25rem;display:flex;gap:0.6rem;justify-content:flex-start">
        <span class="source-tag" style="background:rgba(255,255,255,0.15);color:#ffffff;border:none">
          📡 ${data.sources_used ? data.sources_used.join(' · ') : 'NASA SMAP L4 · NASA POWER'}
        </span>
        <span class="valid-tag" style="background:#10b981;color:#ffffff;border:none">
          ✅ محكمة علمية مصادق عليها
        </span>
      </div>
    `;
  }
}

function renderSoilSamplingProtocol() {
  const container = document.getElementById("lab-plan-output");
  if (!container) return;

  container.innerHTML = `
    <div style="border-bottom:1px solid #cbd5e1;padding-bottom:0.75rem;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
      <div>
        <h4 style="font-weight:800;color:#1e1b4b;margin:0;font-size:1.05rem">🧪 بروتوكول التحاليل المخبرية المعتمد للموقع</h4>
        <small style="color:#64748b">Parcelle : <strong>${AppState.location.city}</strong> · Coordonnées : <strong>${AppState.location.lat.toFixed(4)}°N, ${AppState.location.lon.toFixed(4)}°W</strong></small>
      </div>
      <button type="button" class="btn-sm" onclick="window.print()" style="font-size:0.78rem">🖨️ طباعة الخطة</button>
    </div>

    <div class="lab-step-row">
      <div class="lab-step-badge">1</div>
      <div>
        <strong>الخطوة 1 : شبكة أخذ العينات GPS (Géoréférencement)</strong>
        <p style="margin:0.2rem 0;color:#475569">تقسيم القطعة الفلاحية إلى وحدات متجانسة (قطعة من 2 إلى 5 هكتار لكل عينة مركبة تتكون من 15 إلى 20 نقطة أخذ فرعية على شكل زيكزاك Z).</p>
      </div>
    </div>

    <div class="lab-step-row">
      <div class="lab-step-badge">2</div>
      <div>
        <strong>الخطوة 2 : عمق أخذ العينات (Double Horizon)</strong>
        <p style="margin:0.2rem 0;color:#475569">
          • <strong>الطبقة السطحية (0-20 سم) :</strong> لتقييم المهد الحبي، المادة العضوية، ودرجة الحموضة (pH).<br>
          • <strong>طبقة الجذور (20-40 سم و 40-60 سم) :</strong> لتقييم مخزون الماء الاحتياطي ومطابقته مع رطوبة SMAP L4 (sm_rootzone).
        </p>
      </div>
    </div>

    <div class="lab-step-row">
      <div class="lab-step-badge">3</div>
      <div>
        <strong>الخطوة 3 : التحاليل الفيزيائية والكيميائية الإلزامية بالمختبر</strong>
        <p style="margin:0.2rem 0;color:#475569">
          • <strong>قوام التربة (Texture) :</strong> نسبة الطين، الطمي، والرمل لتحديد سعة الاحتفاظ بالماء.<br>
          • <strong>الملوحة والحموضة :</strong> قياس الناقلية الكهربائية (CEe dS/m) ودرجة pH (eau/KCl).<br>
          • <strong>الكلس الفعال (Calcaire actif) :</strong> لتفادي تثبيت الفوسفور ونقص الحديد.<br>
          • <strong>الخصوبة الكيميائية N-P-K :</strong> الآزوت المعدني ($NO_3^-$)، الفوسفور القابل للامتصاص (Olsen)، والبوتاس القابل للتبادل ($K_2O$).
        </p>
      </div>
    </div>

    <div class="lab-step-row">
      <div class="lab-step-badge">4</div>
      <div>
        <strong>الخطوة 4 : المطابقة ومعايرة الأقمار الاصطناعية (NASA Calibration)</strong>
        <p style="margin:0.2rem 0;color:#475569">مقارنة نسبة رطوبة المختبر بالوزن مع قياس القمر الاصطناعي NASA SMAP لتحديد عتبات الري بالتدقيق لحقلك.</p>
      </div>
    </div>

    <div class="lab-step-row">
      <div class="lab-step-badge">5</div>
      <div>
        <strong>الخطوة 5 : تسليم بطاقة التسميد وجدولة الري</strong>
        <p style="margin:0.2rem 0;color:#475569">صياغة برنامج التسميد الأساسي (Fumure de fond) وجدول الري التكميلي قبل وضع البذور بالتربة.</p>
      </div>
    </div>
  `;
}

async function executeAiPageChat(userText) {
  const feed = document.getElementById("ai-page-messages");
  const sendBtn = document.getElementById("btn-ai-page-send");
  const langSelect = document.getElementById("ai-page-lang-select");

  if (!feed) return;

  // 1. Append User Bubble
  const userRow = document.createElement("div");
  userRow.className = "ai-bubble-row user";
  const isUserArabic = isArabicScript(userText);
  userRow.innerHTML = `
    <div class="ai-bubble-avatar">👤</div>
    <div class="ai-bubble-body">
      <div class="ai-bubble-content ${isUserArabic ? 'rtl-content' : ''}" ${isUserArabic ? 'dir="rtl"' : ''}>
        <p>${userText.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>
      </div>
    </div>
  `;
  feed.appendChild(userRow);
  feed.scrollTop = feed.scrollHeight;

  // 2. Append Assistant Placeholder
  const asstRow = document.createElement("div");
  asstRow.className = "ai-bubble-row assistant";
  asstRow.innerHTML = `
    <div class="ai-bubble-avatar">🤖</div>
    <div class="ai-bubble-body">
      <div class="ai-thinking-box" id="ai-active-thinking">
        <span class="thinking-dots">💭 تحليل بيانات ناسا لموقعك الفعلي واستشارة الأخصائيين<span>.</span><span>.</span><span>.</span></span>
      </div>
      <div class="ai-bubble-content" style="display:none"></div>
      <div class="ai-bubble-meta" style="display:none">
        <span class="source-tag">📡 NASA SMAP L4 · NASA POWER · FieldShift</span>
        <span class="valid-tag">✅ معطيات موثقة</span>
      </div>
    </div>
  `;
  feed.appendChild(asstRow);
  feed.scrollTop = feed.scrollHeight;

  const thinkingBox = asstRow.querySelector(".ai-thinking-box");
  const contentDiv = asstRow.querySelector(".ai-bubble-content");
  const metaDiv = asstRow.querySelector(".ai-bubble-meta");

  if (sendBtn) sendBtn.disabled = true;

  const payload = {
    message: userText,
    location: {
      name: AppState.location.city,
      latitude: AppState.location.lat,
      longitude: AppState.location.lon
    },
    year: parseInt(AppState.year) || 2025,
    mode: "agricultural",
    language: (langSelect && langSelect.value) ? langSelect.value : "auto"
  };

  let accumulatedText = "";

  try {
    const response = await fetch("/api/ai/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error("Streaming non supporté");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    contentDiv.style.display = "block";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const jsonStr = trimmed.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const evt = JSON.parse(jsonStr);
          if (evt.event === "meta") {
            if (evt.sources_used && evt.sources_used.length > 0) {
              const srcTag = metaDiv.querySelector(".source-tag");
              if (srcTag) srcTag.textContent = `📡 ${evt.sources_used.slice(0, 2).join(' · ')}`;
            }
          } else if (evt.event === "delta") {
            if (thinkingBox && thinkingBox.parentNode) {
              thinkingBox.remove();
            }
            accumulatedText += evt.content || "";
            const isRespArabic = isArabicScript(accumulatedText);
            if (isRespArabic) {
              contentDiv.classList.add("rtl-content");
              contentDiv.setAttribute("dir", "rtl");
            }
            contentDiv.innerHTML = formatAiMarkdown(accumulatedText) + '<span class="ai-cursor"></span>';
            feed.scrollTop = feed.scrollHeight;
          } else if (evt.event === "done") {
            const cursor = contentDiv.querySelector(".ai-cursor");
            if (cursor) cursor.remove();
            metaDiv.style.display = "flex";
          }
        } catch (parseErr) {
          console.warn("SSE parse error:", parseErr);
        }
      }
    }

    const finalCursor = contentDiv.querySelector(".ai-cursor");
    if (finalCursor) finalCursor.remove();
    metaDiv.style.display = "flex";

  } catch (streamErr) {
    console.warn("Streaming error, trying sync fallback:", streamErr);
    try {
      const syncRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const syncData = await syncRes.json();
      if (thinkingBox && thinkingBox.parentNode) thinkingBox.remove();
      contentDiv.style.display = "block";
      accumulatedText = syncData.reply || "Réponse non disponible";
      const isRespArabic = isArabicScript(accumulatedText);
      if (isRespArabic) {
        contentDiv.classList.add("rtl-content");
        contentDiv.setAttribute("dir", "rtl");
      }
      contentDiv.innerHTML = formatAiMarkdown(accumulatedText);
      metaDiv.style.display = "flex";
    } catch (fallbackErr) {
      if (thinkingBox && thinkingBox.parentNode) thinkingBox.remove();
      contentDiv.style.display = "block";
      contentDiv.innerHTML = `<p style="color:#b91c1c">⚠️ تعذر الاتصال بالذكاء الاصطناعي: ${fallbackErr.message}</p>`;
    }
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    feed.scrollTop = feed.scrollHeight;
  }
}

