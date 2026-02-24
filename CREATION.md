# Creation

What Gemini told me to do.

## Phase 1: Scaffolding & Git Initialization

### Initialize the Project

```bash
# Initialize a new git repository
git init

# Create the React + TypeScript project in the current folder
npm create vite@latest . -- --template react-ts

# Install core dependencies
npm install
```

I ran `npm audit` and gemini suggested we override the minimatch library. No vulnerabilities after that.

### Install Libraries

We need Tailwind for styling, Recharts for the graph, Axios for data fetching, and date-fns for time formatting.

```bash
# Install dev dependencies for Tailwind
npm install -D postcss autoprefixer

# Initialize Tailwind config (using v4)
npm install @tailwindcss/vite

# Install runtime dependencies
npm install recharts axios date-fns lucide-react
```

Checked via `npm run build`

### Commit the Setup

```bash
git add .
git commit -m "Initial commit: Vite scaffold and dependencies"
```

## Phase 2: Styling

Complete since we used tailwind v4

## Phase 3:

Created `src/hooks/useSnowData.ts` to fetch data from the Powderlines API.

## Phase 4: Chart Component

Created `src/components/SnowpackChart.tsx` using Recharts.

- Implemented the `useSnowData` hook.
- Added the "Oregon Blue" custom color from Tailwind config.
- Disabled initial animation for instant data rendering.

## Phase 5: Assembly

Updated `src/App.tsx` to:

- Remove the default Vite boilerplate.
- Import and render the `SnowpackChart`.
- Add the header with the `MountainSnow` icon.

Deleted `src/App.css` as it is no longer needed with Tailwind utility classes.

## Later

Install prettier

```
npm install -D prettier eslint-config-prettier eslint-plugin-react
```

# To Do List

- [x] cache data locally (on the server) to avoid re-fetching
- [x] grab data back to the 1980s
- [x] graph yearly seasons from August 1, YearX-1 to July 31, YearX
- [x] add map component
- [x] select different locations
- [ ] add buttons to highlight 80s, 90s, 00s, 10s and 20s seasons

## Backend server

### 1. Install Dependencies

First, we'll need express for the server, cors to handle cross-origin requests in development, and concurrently and nodemon to make running both servers easy.

```bash
npm install express cors
npm install -D concurrently nodemon
```

### 2. Create the Server

Create a new file named server.js in the root of your project. This file contains the caching and proxying logic.

### N. Get SNOTEL sites

Raw data from https://powderlines.kellysoftware.org/api/stations was transformed.

## Code review

2026/02/23 7:52PM

Based on my review of the codebase, here are several areas for improvement and refactoring from a senior developer's perspective. These recommendations focus on architecture, performance, and maintainability.

### 1. Backend Architecture & Caching

- **Decouple and Modularize:** `server.js` currently handles database initialization, migrations, API proxying, and business logic. I recommend breaking this into modules:
  - `lib/db.js` for database connection and schema management.
  - `routes/` for API endpoint definitions.
  - `services/snowService.js` for the proxying and caching logic.
- **Robust Migrations:** Instead of manual `PRAGMA table_info` checks within the application code, use a dedicated migration tool or a separate initialization script.
- **Production Stability:** `node:sqlite` is currently experimental. For a production environment, consider switching to a more mature library like `better-sqlite3` or ensure the Node.js version is locked to one where this feature is stable.
- **Logging & Observability:** Replace `console.log` with a structured logger (e.g., `pino` or `winston`) to better track cache hits/misses and upstream API failures in production.

### 2. Frontend Data Management & Logic

- **Consolidate Season Logic:** There is a discrepancy between `src/lib/seasonUtils.ts` (starts season in August) and `src/hooks/useSnowData.ts` (starts in September). Furthermore, `seasonUtils.ts` has broken imports. This logic should be unified and move to a shared utility.
- **Offload Heavy Processing:** The complex data transformation (grouping 40 years of daily data) in `useSnowData` could be moved to the backend. This would reduce the client's CPU load and the amount of raw data sent over the wire.
- **Modern Data Fetching:** Replace the manual `useEffect` + `axios` implementation in `useSnowData` with `@tanstack/react-query`. This would provide built-in caching, better loading/error states, and easier management of stale data.

### 3. Component & UI/UX Refactoring

- **Bundle Size Optimization:** `plotly.js` is a very large dependency. Since `recharts` is already in your `package.json`, consider migrating the chart to Recharts for a significantly smaller bundle, or use a partial Plotly bundle that only includes the necessary chart types.
- **Map Performance:** Rendering 6,000+ markers in Leaflet can cause significant lag. I recommend:
  - Implementing **Marker Clustering** (e.g., `react-leaflet-markercluster`).
  - Implementing a **search/autocomplete** feature for stations so users don't have to hunt for them on the map.
- **Streamline Selection:** The current "Click marker -> Open popup -> Click button" flow is a bit slow. Consider a single-click selection or a more responsive side panel for station details.
- **Asset Management:** Avoid using external URLs for Leaflet icons (e.g., `raw.githubusercontent.com`). These should be stored locally in the project to prevent breakage if the external source goes down.

### 4. Quality & Maintenance

- **Testing Strategy:** The project currently lacks tests. At a minimum, I recommend:
  - **Unit Tests:** For the season calculation and data transformation logic.
  - **API Tests:** To verify the caching behavior and error handling of the Express server.
- **Environment Configuration:** Centralize all constants (API URLs, cache durations, port numbers) into a `.env` file.
- **Clean Up:** Remove unused dependencies (like `recharts` if you stick with Plotly) to keep the `package.json` lean.

These changes would move the project from a functional prototype to a more robust, scalable, and maintainable application.

Yes, moving the server code into its own subdirectory (like `server/` or `api/`) is a best practice as the project grows. Currently, your project is a hybrid where the root directory is cluttered with both frontend configuration and backend logic.

Here is why and how I would recommend refactoring it:

### Why move it?

1.  **Separation of Concerns:** It clearly distinguishes between the code that runs in the browser (in `src/`) and the code that runs on the Node.js server.
2.  **Scalability:** As you add more features (e.g., more API routes, database models, or utility functions), your root directory will become messy if everything stays there.
3.  **Tooling & Configuration:** It allows you to have server-specific linting rules, TypeScript configurations, or even a separate `package.json` if the backend grows significantly, without conflicting with Vite's frontend-centric setup.

### Proposed Structure

I would recommend a structure like this:

```text
snowpack/
├── server/             # All backend code
│   ├── src/
│   │   ├── index.js    # Renamed from server.js
│   │   ├── routes/     # API route definitions
│   │   ├── services/   # Business logic (e.g., the proxy logic)
│   │   └── db/         # Database connection and migrations
│   └── tsconfig.json   # Optional: server-specific TS config
├── src/                # Frontend React code (Vite default)
├── package.json        # Shared dependencies and scripts
└── vite.config.ts      # Frontend build config
```

### Necessary Changes

If you move `server.js` to `server/src/index.js`, you would only need to update your `package.json` scripts:

```json
"scripts": {
  "dev:server": "nodemon server/src/index.js",
  "start": "NODE_ENV=production node server/src/index.js"
}
```

And update any path references inside `server.js` for serving static files (the `dist` folder path would need an extra `../..`).

**Summary:** For a senior developer, this is a "low effort, high reward" refactor that significantly improves the project's mental model and maintainability.
