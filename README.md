# BHARAT APEX Automotive

**Smart Manufacturing Operations Cockpit & Tier-1 Telematics Engine**  
*Chakan MIDC Industrial Complex (Pune, Maharashtra)*

Bharat Apex Automotive is a mission-critical SCADA operations cockpit and supply-chain telematics command center built for Tier-1 automotive component manufacturing. It delivers real-time line-stop penalty exposure modeling, customer buffer burn-down tracking, advanced planning and scheduling (APS), multi-tier BOM landed-cost valuation, GST E-Way Bill transit ledger with validity tracking, OpenStreetMap telematics with geofence arrivals, and GenAI-powered shop-floor advisory.

---

## Key Features

### 1. SCADA Operations Cockpit & Buffer Burn-Down
- **Real-Time Line-Stop Penalty Exposure**: Continuous calculation of OEM customer assembly line penalty risks ($₹25\text{L}$ to $₹50\text{L}$ per hour of line stop).
- **Buffer Burn-Down Tracker**: Hourly consumption and burn-down depletion tracking across primary OEM lines (Tata Motors Sanand EV, Mahindra Chakan, Maruti Suzuki Manesar, Hyundai Sriperumbudur, Bajaj Auto Waluj).
- **Threshold Alerting**: Status classification into `CRITICAL` ($< 3\text{h}$), `WARNING` ($3\text{h} - 6\text{h}$), and `HEALTHY` ($> 6\text{h}$).

### 2. Fleet Telematics & Highway Corridors (Leaflet + OpenStreetMap)
- **100% Free Open Basemap**: Built entirely with Leaflet and OpenStreetMap tiles. **No Google Maps API key or proprietary tokens required.**
- **Highway Corridors**: Real highway waypoints across Indian corridors (NH-48 Western Express, NH-44 South Corridor, Chakan–Waluj).
- **Simulation Engine**: Single-timer simulation loop supporting $1\times$, $5\times$, and $20\times$ speeds with pause/resume controls.
- **Geofence Arrival Events**: Pure Haversine distance helper monitoring truck entry into OEM plant geofences ($1.5\text{ km}$ default radius), triggering single-fire feed alerts, toast notifications, and `ARRIVED` status updates.
- **FASTag Green Corridor**: Priority bypass dispatch to expedite urgent parts shipments.

### 3. Advanced Planning & Scheduling (APS)
- **Station Load Balancing**: Visualizes cell load across CNC 5-Axis VMCs, gear hobbers, induction hardening cells, and coordinate measuring machines.
- **Heuristic Re-sequencing**: Dynamic line re-balancing and job rerouting across operational cells.
- **Stage Progression & Scrap Tracking**: Tracks jobs across `RAW_PREP`, `MACHINING`, `FABRICATION`, `ASSEMBLY`, and `FINAL_DISPATCH` with scrap logging.

### 4. 3-Level BOM & Landed Cost Valuation
- **Hierarchical Bill of Materials**: Complete 3-level tree structure for critical automotive assemblies.
- **Multi-Currency Landed Cost**: Real-time landed tariff and FX shock rollups across INR, USD, EUR, JPY, CNY, and GBP.
- **Safety Stock Deficit Alerts**: Immediate identification of below-safety items with Emergency Purchase Order workflow.

### 5. Supplier Hub & GST E-Way Bill Ledger
- **ASN & EWB Transmission**: Generates NIC-compliant JSON payloads with automated CGST, SGST, and IGST tax splits.
- **E-Way Bill Validity Countdown**: Calculates validity using the statutory $200\text{ km/day}$ rule (`EWB_KM_PER_DAY = 200`), featuring color-coded live countdown badges (Green $>12\text{h}$, Amber $<12\text{h}$, Red expired) and single-fire expiry warnings ($<2\text{h}$).

### 6. Foreign Exchange Risk & Hedging
- **Live ECB Rates**: Automatic exchange rate retrieval via Frankfurter API with offline fallback resilience.
- **FX Stress Testing**: Real-time currency shocks ($\pm 5\%$) to forecast imported component landed cost volatility.

### 7. "Ask the Plant" AI Assistant & Shift Handover
- **Gemini Function Calling**: Server-side `/api/ask` endpoint using `@google/genai` with tools strictly bound to pure calculation engines (`getBufferStatus`, `simulateTruckDelay`, `getLowStockItems`, `getMachineStatus`). The assistant is grounded strictly on verified telemetry data.
- **AI Shift Handover Briefing**: Summarizes shift incidents, equipment uptime, and prioritized actions for incoming shift supervisors.

### 8. Dynamic PDF Export Engine
- **Code-Split jsPDF**: Dynamically imports `jspdf` and `jspdf-autotable` on demand, keeping the primary bundle small.
- **Export Daily Shift Report**: Comprehensive audit report containing facility metadata, KPI summary, buffer status table, open work orders by stage, last 20 feed events, and the latest AI handover notes.
- **Export BOM**: Full landscape inventory valuation report with quantities, status, and landed cost.
- **Clean PDF Typographics**: Automatic replacement of Unicode Rupee symbols (`₹`) with `"Rs. "` for standard PDF font compatibility, complete with `"Demo data"` and page numbering on every page.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 19, TypeScript (~5.7), Vite 6 |
| **Styling & UI** | Tailwind CSS v4, Material Symbols, Custom Stitch SCADA Cockpit Design |
| **Mapping & GIS** | Leaflet 1.9, React-Leaflet 5, OpenStreetMap (CARTO fallback) |
| **Data Visualization** | Recharts 2 |
| **Document Generation** | jsPDF 4, jsPDF-AutoTable 5 (Dynamically loaded) |
| **Artificial Intelligence**| Google GenAI SDK (`@google/genai`), Gemini 2.5 Flash |
| **Testing** | Vitest 3 |

---

## Getting Started

### Prerequisites
- Node.js 20+ installed
- npm 10+ installed

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/kushagra4798/Bharat_Apex.git
   cd Bharat_Apex
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Add your Gemini API key (optional for core features, required for AI Assistant and Handover):
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-2.5-flash
   ```

4. **Start the local development server:**
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:5173/`.

---

## Environment Variables

| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API key used by serverless endpoints (`/api/ask`, `/api/advisor`, `/api/handover`) | *None* | Optional (enables AI features) |
| `GEMINI_MODEL` | Gemini model identifier | `gemini-2.5-flash` | Optional |

> [!NOTE]
> Environment variables do NOT use the `VITE_` prefix because they are strictly accessed server-side in `/api` functions to protect API credentials.

---

## npm Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Vite local development server with API proxy middleware |
| `npm run build` | Compiles TypeScript (`tsc -b`) and builds production bundle (`vite build`) |
| `npm run test` | Executes unit test suite using Vitest |
| `npm run preview` | Previews the production build locally |

---

## Project Structure

```text
app/
├── api/                          # Serverless functions (Vercel / Local dev proxy)
│   ├── advisor.ts                # AI line-stop risk advisor endpoint
│   ├── ask.ts                    # "Ask the Plant" Gemini function-calling endpoint
│   ├── handover.ts               # Shift handover summarization endpoint
│   └── rates.ts                  # Live foreign exchange rates endpoint
├── src/
│   ├── components/               # UI and feature components
│   │   ├── AiAdvisor/            # Advisory panel & line-stop analyzer
│   │   ├── AskPlant/             # Slide-over AI chat assistant
│   │   ├── charts/               # Recharts components (Burn-Down, OEE, FX)
│   │   ├── layout/               # AppLayout, TopBar, Sidebar, MobileNav
│   │   ├── Maps/                 # Leaflet FleetLogisticsMap & OverviewMiniMap
│   │   ├── Modals/               # WorkOrder, Emergency PO, EDI/ASN, Expedite
│   │   └── ui/                   # SCADA Cards, DataTables, Badges, Toasts
│   ├── context/                  # Centralized BharatApex state provider & reducer
│   ├── data/                     # Seed datasets (corridors, trucks, buffers, BOM)
│   ├── hooks/                    # useSimulation, useToast, usePersistentState
│   ├── services/                 # Pure calculation functions, Haversine, PDF export
│   │   ├── calculations.ts       # Burn-down, validity, geofence, and what-if math
│   │   ├── haversine.ts          # Great-circle distance calculations
│   │   ├── pdfExportService.ts   # jsPDF & jspdf-autotable lazy export engine
│   │   ├── currencyService.ts    # FX conversions, rate fetching, formatting
│   │   └── askService.ts         # Client bridge for /api/ask
│   ├── types/                    # Core TypeScript domain models
│   ├── views/                    # 6 Cockpit Views (Overview, APS, BOM, EDI, FX, Fleet)
│   ├── App.tsx                   # Top-level view routing & modal manager
│   └── main.tsx                  # Application entry point
├── .env.example                  # Template for environment configuration
├── .gitignore                    # Version control ignore definitions
├── package.json                  # Dependencies and build scripts
├── tsconfig.json                 # TypeScript compiler configuration
└── vite.config.ts                # Vite build and dev server middleware setup
```

---

## Deploying to Vercel

1. Push your repository to GitHub.
2. Log in to [Vercel](https://vercel.com) and import the `Bharat_Apex` repository.
3. Configure the Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `.` (if repo root is `app`)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add Environment Variables:
   - `GEMINI_API_KEY`: Your Gemini API key.
   - `GEMINI_MODEL`: `gemini-2.5-flash` (or preferred model).
5. Click **Deploy**. The serverless endpoints in `api/` will be provisioned automatically as Vercel Serverless Functions.

---

## Known Limitations

- **NIC Portal Sandbox**: Generated E-Way Bill numbers, QR codes, and ASN JSON payloads are illustrative simulations structured per NIC schema specifications, but are not submitted to the live NIC government gateway.
- **External FX Fallback**: If the Frankfurter ECB API is unreachable or rate-limited, the system seamlessly falls back to cached baseline exchange rates (`isLiveRates: false`).
- **PDF Fonts**: Default standard PDF Helvetica fonts do not include Unicode glyphs for the Indian Rupee symbol (`₹`). The PDF generation engine systematically sanitizes currency strings to `"Rs. "` to guarantee proper cross-platform document rendering.

---

> **Demo data: E-Way Bill output is illustrative and not validated against the NIC portal.**
