# Farmer's Eye: Professional UI/UX Architecture & Design System Plan
> **CRITICAL PROJECT INVARIANT**: **STRICTLY DO NOT TOUCH THE 3D EARTH GLOBE.**  
> The file `frontend/src/components/globe/EarthOrbitGlobe.jsx` (MapLibre GL 3D globe, orbit camera math, tile layers, and satellite trajectories) is **100% frozen and untouched**. All design improvements apply exclusively to the surrounding HUD, toolbars, telemetry docks, and simulation modals.

---

## 1. Executive Vision: From "Vibe-Coded" to Mission-Control Grade

The current frontend has powerful underlying data engines (NASA SMAP L4, NASA POWER, FAO-56 simulations), but the surrounding interface exhibits common "vibe-coded" AI artifacts:
- **Excessive, uniform neon cyan borders** (`border-cyan-500/30`, `shadow-[0_0_40px_rgba(6,182,212,0.2)]`) on every card.
- **Fragmented icon libraries** (mixing `react-icons/gi` and `react-icons/tb` with inconsistent stroke weights).
- **Arbitrary spacing & paddings** (`p-5`, `gap-2.5`, `max-w-sm`) without a disciplined 4px/8px grid.
- **Cluttered data cards** displaying raw text values instead of high-density scientific sparklines and status badges.
- **Heavy, viewport-blocking modals** that obscure the user's view of the field and globe.

### Target Aesthetic: Aerospace / Tactical Mission Control
Inspired by high-reliability geospatial platforms (Palantir Foundry, NASA Eyes on the Earth, Sentinel Hub, Linear):
- **Refined Dark Glass**: Deep neutral slate/zinc base (`bg-zinc-950/80` or `bg-slate-950/85`) with ultra-fine, crisp borders (`border-white/[0.08]` or `border-zinc-800/90`).
- **Tactical Semantic Accents**: Colors only convey meaningful physical and agronomic states, not decorative glow:
  - **Emerald (`emerald-400`)**: Optimal root-zone moisture / adequate irrigation.
  - **Amber (`amber-400`)**: Moderate water stress / thermal warning / dry spell.
  - **Rose (`rose-400`)**: Acute moisture deficit / frost danger / crop stress.
  - **Sky / Cyan (`sky-400`)**: Satellite telemetry & radar coverage (NASA SMAP).
- **Tabular Data-Density**: Monospace numbers (`tabular-nums font-mono tracking-tight`) for jitter-free live metric updates.
- **Modular Drawers & Docks**: Non-intrusive HUD elements that frame the central 3D Earth without obstructing it.

---

## 2. GitHub Model Context Protocol (MCP) Servers to Integrate

These MCP servers provide AI assistants with live access to production-tested UI design tokens, component registries, and accessibility standards:

### 1. `21st-dev/magic-mcp` (Magic MCP / 21st.dev)
* **GitHub Repository**: [`21st-dev/magic-mcp`](https://github.com/21st-dev/magic-mcp)
* **Capability**: Allows the agent to query a curated catalog of 10,000+ production-grade React + Tailwind + Framer Motion components (interactive badges, collapsible docks, live status indicators, spotlight search).
* **Configuration (`mcp.json`)**:
  ```json
  {
    "mcpServers": {
      "magic": {
        "command": "npx",
        "args": ["-y", "@21st-dev/magic-mcp"]
      }
    }
  }
  ```

### 2. `magicuidesign/mcp` (Magic UI MCP)
* **GitHub Repository**: [`magicuidesign/mcp`](https://github.com/magicuidesign/mcp)
* **Capability**: Gives the AI direct tools (`listRegistryItems`, `getRegistryItem`) to pull production-ready micro-components (Bento grid layouts, animated number tickers, smooth badge transitions, dock menus).
* **Configuration (`mcp.json`)**:
  ```json
  {
    "mcpServers": {
      "magicuidesign-mcp": {
        "command": "npx",
        "args": ["-y", "@magicuidesign/mcp@latest"]
      }
    }
  }
  ```

### 3. `jpisnice/shadcn-ui-mcp-server` & `@shadcn/mcp-server`
* **GitHub Repository**: [`jpisnice/shadcn-ui-mcp-server`](https://github.com/jpisnice/shadcn-ui-mcp-server)
* **Capability**: Supplies full component schemas, props, and variants for Radix UI primitives with Tailwind v4, ensuring proper keyboard navigation, focus management, and accessibility (WAI-ARIA).
* **Configuration (`mcp.json`)**:
  ```json
  {
    "mcpServers": {
      "shadcn-ui": {
        "command": "npx",
        "args": ["-y", "@jpisnice/shadcn-ui-mcp-server"]
      }
    }
  }
  ```

### 4. Figma MCP Plugin
* **Marketplace Identifier**: `antigravity-plugins-partners/plugin/figma`
* **Capability**: Connects Figma design files directly with Code Connect to generate pixel-precise Tailwind tokens (colors, font scales, border radiuses).

---

## 3. GitHub Agent Skills & Anti-Vibecoding Rules (`SKILL.md`)

To enforce consistent production quality across all UI turns, the following design-system rules are defined:

### Rule 1: The Strict 4px/8px Tactical Grid
* Eliminate arbitrary values (e.g. `p-[17px]`, `m-3.5`).
* All padding, margin, and gaps must follow standard Tailwind tokens: `p-2` (8px), `p-3` (12px), `p-4` (16px), `p-6` (24px).
* Component corners use unified radiuses: `rounded-lg` (8px) for buttons/badges, `rounded-xl` (12px) for sub-cards, `rounded-2xl` (16px) for master panels.

### Rule 2: Typography & Numeric Hierarchy
* **Telemetry & Numeric Values**: `font-mono tabular-nums text-zinc-100 tracking-tight font-semibold`.
* **Field Labels & Metadata**: `font-sans text-[11px] font-medium uppercase tracking-wider text-zinc-400`.
* **Section Headers**: `font-sans text-sm font-semibold text-zinc-200`.

### Rule 3: Single Cohesive Icon System
* Standardize on **Lucide React** (`lucide-react`) with a strict `1.5px` or `1.75px` stroke weight across the entire project.
* Deprecate the mixed usage of heavy game icons (`react-icons/gi`) and Tabler icons (`react-icons/tb`).

### Rule 4: Zero Layout Jitter
* All dynamic status indicators must reserve fixed widths (`tabular-nums`, `min-w-[60px]`).
* Loading states must render clean skeleton placeholders matching exact component dimensions, avoiding layout shifts.

---

## 4. Recommended Modern Tooling (React 19 + Tailwind v4 Compatible)

| Library / Tool | Primary Purpose in Farmer's Eye | Value Added |
| :--- | :--- | :--- |
| **Lucide React** (`lucide-react`) | Uniform icon set (1.5px stroke) | Eliminates mismatched icon styles; provides crisp aerospace & sensor icons. |
| **Tremor Raw** (`tremorlabs/tremor`) | High-density telemetry cards & sparklines | Purpose-built for data analytics dashboards with clean Tailwind styling. |
| **cmdk** (`pacocoursey/cmdk`) | Command palette for geosearch (`Ctrl+K`) | Replaces basic dropdown search with a fast, keyboard-navigable command bar. |
| **Framer Motion** (`motion/react`) | Physical spring animations | Adds smooth slide-over transitions for panels and drawers without performance hitches. |
| **Radix UI Primitives** | Accessible Dialog, Tooltip, Tabs | Replaces hand-rolled modals with rock-solid focus trapping and Escape-to-close behavior. |
| **Sonner** (`sonner`) | Tactical toast notifications | Clean, un-intrusive notifications for field lock, telemetry sync, and ESP32 ingestion. |

---

## 5. UI Architecture & Spatial Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [TOP BAR] Location & Command Bar (cmdk + Lucide)                             │
│  🔍 Search Field / Lat-Lng [Ctrl+K]  │  🇲🇦 Meknes (Saïss)  │  🌐 Darija / FR │
├──────────────────────────┬──────────────────────────┬────────────────────────┤
│ [LEFT HUD]               │                          │ [RIGHT TELEMETRY DOCK] │
│ MISSION STATUS           │      3D EARTH GLOBE      │ TABBED SENSOR CONSOLE  │
│ • Orbit: 20,000 km       │  ┌────────────────────┐  │ ┌────────────────────┐ │
│ • Lat/Lon: 33.89°N, 5.55°W│  │  EarthOrbitGlobe   │  │ │ Tab 1: Soil (SMAP) │ │
│ • Live Ping: Online      │  │  [STRICTLY FROZEN] │  │ │ Tab 2: Climate     │ │
│ • ESP32 Ingestion: Active│  │  MapLibre GL Canvas│  │ │ Tab 3: FAO-56 Water│ │
│                          │  └────────────────────┘  │ └────────────────────┘ │
│                          │                          │ [Run Simulation Action]│
├──────────────────────────┴──────────────────────────┴────────────────────────┤
│ [BOTTOM SLIDE-OVER] Virtual Agricultural Lab & Simulation Workbench          │
│ Expandable drawer with crop rotation scenarios, water deficit & AI verdicts  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Component-by-Component Upgrade Specifications

### 1. `LocationToolbar.jsx` $\rightarrow$ Tactical Command Bar
* **Current State**: Standard input box with basic absolute dropdown.
* **Target Design**:
  * Keyboard-accessible Command Palette (`cmdk`) triggered via `Ctrl+K` or clicking the search pill.
  * Recent Moroccan agricultural regions (Saïss, Gharb, Tadla, Souss, Chaouia) displayed as quick-filter chips.
  * Language toggle (Moroccan Darija 🇲🇦, French 🇫🇷, English 🇺🇸) styled as a refined segmented control.

### 2. `MissionHUD.jsx` $\rightarrow$ Aerospace Flight Deck
* **Current State**: Neon cyan card with spinning globe icon and fixed layout.
* **Target Design**:
  * Compact matte-glass pill (`bg-zinc-950/80 backdrop-blur-xl border border-zinc-800/80`).
  * Live telemetry readout with jitter-free tabular numbers:
    - Orbit altitude and ground speed.
    - Sub-satellite ground point coordinates.
    - ESP32 hardware telemetry status badge (`Online` / `Standby`).

### 3. `FieldTelemetryCard.jsx` $\rightarrow$ Modular Scientific Console
* **Current State**: Long, vertically overflowing card with mixed metrics and repeated cyan borders.
* **Target Design**:
  * **Header**: Field lock coordinates with reverse-geocoded province, EASE-Grid 2.0 cell resolution tag.
  * **Tabbed Navigation**:
    1. **Soil & Hydrology**: Dual gauge comparing **NASA SMAP Level-4** satellite root-zone moisture ($0\text{--}100\text{ cm}$) against real-time **ESP32 in-situ sensor readings**.
    2. **Agroclimatology**: NASA POWER metrics (accumulated rainfall, solar radiation, heatwave/frost days) formatted with compact Tremor Raw sparklines.
    3. **FAO-56 Irrigation Status**: Readily available water depletion bar ($p = 0.50$).
  * **Action Footer**: Prominent button to launch the Virtual Agricultural Simulation Workbench.

### 4. `RotationSimulationModal.jsx` $\rightarrow$ Slide-Over Tactical Workbench
* **Current State**: Centered modal covering the entire screen, completely hiding the Earth view.
* **Target Design**:
  * Smooth right-side slide-over drawer or resizable bottom workbench (using `Framer Motion`).
  * The user retains visual contact with their field on the 3D Earth while reviewing multi-plan crop rotation curves, soil water stress graphs, and AI tribunal verdicts.

---

## 7. Implementation Roadmap & Guardrails

1. **Safety Guarantee**:
   - `frontend/src/components/globe/EarthOrbitGlobe.jsx` is excluded from all edits and refactors.
   - MapLibre GL instance, shaders, terrain, camera projections, and satellite orbit calculations remain untouched.
2. **Phase 1: Dependencies & Design Tokens**
   - Install `lucide-react`, `cmdk`, and `motion`.
   - Configure uniform color and spacing tokens in `frontend/src/index.css`.
3. **Phase 2: HUD & Navigation Polish**
   - Upgrade `MissionHUD.jsx` and `LocationToolbar.jsx` to the matte-glass command bar pattern.
4. **Phase 3: Telemetry Console Refactor**
   - Modernize `FieldTelemetryCard.jsx` with tabbed architecture, Sparkline data visualization, and ESP32 telemetry slots.
5. **Phase 4: Simulation Workbench Transition**
   - Convert `RotationSimulationModal.jsx` to a non-intrusive slide-over drawer.
