# ❄️ Snowpack Tracker

A modern, high-performance dashboard for visualizing historical SNOTEL (Snow Telemetry) data. Compare current snow depth and SWE (Snow Water Equivalent) against decades of historical seasons to see how this year stacks up.

This project is a high-performance clone of the [OregonLive Snowpack Tracker](https://projects.oregonlive.com/weather/hood-snowpack/), rebuilt from the ground up with a modern full-stack architecture.

This project was coded with significant help from Gemini.

---

## ✨ Key Features

- **Deep Linking:** Every view is shareable. The currently selected station and hovered season are automatically synced to the URL (`?station=651:OR:SNTL&season=2024`).
- **Clustered Map Interface:** Explore over 6,000 SNOTEL stations across the western US with an optimized Leaflet map using marker clustering.
- **Modern Data Fetching:** Powered by `@tanstack/react-query` for instantaneous station switching via intelligent client-side caching.
- **Optimized Performance:** 90% main bundle reduction through Plotly code-splitting and partial distribution.
- **Intelligent Backend Cache:** A Node.js middleware layer proxies and transforms raw NRCS data, caching results in a local SQLite database for sub-millisecond response times.

---

## 🛠️ Tech Stack

### Frontend

- **React 19 + TypeScript + Vite**
- **Tailwind CSS v4** (Modern utility-first styling)
- **Plotly.js (Basic Distribution)** (Seasonal chart visualization)
- **React-Leaflet** (Interactive station map)

### Backend

- **Node.js + Express + TypeScript**
- **SQLite3** (High-performance local caching)
- **Pino** (Structured JSON logging)
- **Vitest** (Unit and API integration testing)

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js (v22+ recommended)
- npm

### 2. Installation

```bash
git clone https://github.com/your-username/snowpack.git
cd snowpack
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory (you can use `.env.example` as a template):

```env
# Server Configuration
PORT=3001
LOG_LEVEL=info

# Backend Caching
# Time (in seconds) the server will consider its own cache stale.
SERVER_CACHE_STALE_SECONDS=2592000

# Upstream API URL
# The source for NRCS SNOTEL data (Powderlines API).
UPSTREAM_API_URL=https://powderlines.kellysoftware.org/api/station

# Frontend Configuration
# The base URL for the backend API, accessed by the Vite client.
VITE_API_BASE_URL=http://localhost:3001
```

_Note: For running tests, a separate `.env.test` file is used to configure the test database and port._

### 4. Running the Project

```bash
# Start both client and server concurrently
npm run dev
```

The client will be available at `http://localhost:5173` and the API at `http://localhost:3001`.

---

## 📋 Available Scripts

- `npm run dev`: Start client and server in watch mode.
- `npm run build`: Production build and type checking for the entire project.
- `npm run test`: Run unit and API tests via Vitest.
- `npm run lint`: Run ESLint and Prettier checks across all files.
- `npm run format`: Automatically fix formatting issues.

---

## 📊 Data Sourcing & Transformation

The station metadata used by the map (`client/data/snotel-stations.json`) is derived from the [Powderlines Stations API](https://powderlines.kellysoftware.org/api/stations).

### Transformation Logic

The raw API data is transformed using the following mapping:

- `id`: Mapped from `triplet` (e.g., `301:CA:SNTL`).
- `name`: Preserved from `name`.
- `lat`: Mapped from `location.lat`.
- `lon`: Mapped from `location.lng`.
- `state`: Extracted from the `triplet` (the middle segment).

### Reproducing the Data

You can regenerate the station data using `curl` and `jq`:

```bash
curl https://powderlines.kellysoftware.org/api/stations | jq '[.[] | {id: .triplet, name: .name, lat: .location.lat, lon: .location.lng, state: (.triplet | split(":")[1])}]' > client/data/snotel-stations.json
```

---

## 📁 Project Structure

- `/client`: React frontend source and configuration.
- `/server`: Express backend, database logic, and API tests.
- `/public`: Static assets and Leaflet marker icons.
- `CREATION.md`: A detailed development log and roadmap of the project.

---

## 🎨 Attribution & Assets

This project uses the following third-party assets:

- **Map Icons:** Colored markers provided by [pointhi/leaflet-color-markers](https://github.com/pointhi/leaflet-color-markers) (MIT License).
- **Shadow Icon:** Marker shadow provided by the [Leaflet](https://leafletjs.com/) library (BSD-2-Clause License).
- **SNOTEL Data:** Station metadata and snow telemetry data sourced from the [NRCS SNOTEL network](https://www.nrcs.usda.gov/wps/portal/wcc/home/snowpack/snotel/) via the Powderlines API.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
