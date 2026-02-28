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

- [DONE] **Decouple and Modularize:** `server.js` currently handles database initialization, migrations, API proxying, and business logic. I recommend breaking this into modules:
  - `lib/db.js` for database connection and schema management.
  - `routes/` for API endpoint definitions.
  - `services/snowService.js` for the proxying and caching logic.
- [DISMISSED] **Robust Migrations:** Decided to keep it simple. Since the DB is a cache, we'll just delete and recreate it if the schema changes.
- [NOPE] **Production Stability:** Decided to stay with `node:sqlite` for its zero-dependency nature and integration with Node.js 22+.
- [DONE] **Logging & Observability:** Replaced `console.log` with `pino` for structured JSON logging and `pino-pretty` for development.

### 2. Frontend Data Management & Logic

- [DONE] **Consolidate Season Logic:** There is a discrepancy between `src/lib/seasonUtils.ts` (starts season in August) and `src/hooks/useSnowData.ts` (starts in September). Furthermore, `seasonUtils.ts` has broken imports. This logic should be unified and move to a shared utility.
- [DONE] **Offload Heavy Processing:** Moved the complex seasonal data transformation from the React frontend to the Node.js backend. The client now receives data ready for plotting, reducing CPU load and frontend complexity.
- [DONE] **Modern Data Fetching:** Replace the manual `useEffect` + `axios` implementation in `useSnowData` with `@tanstack/react-query`. This would provide built-in caching, better loading/error states, and easier management of stale data.

### 3. Component & UI/UX Refactoring

- [TODO] **Bundle Size Optimization:** `plotly.js` is a very large dependency. Since `recharts` is already in your `package.json`, consider migrating the chart to Recharts for a significantly smaller bundle, or use a partial Plotly bundle that only includes the necessary chart types.
- **Map Performance:** Rendering 6,000+ markers in Leaflet can cause significant lag. I recommend:
  - [DONE] Implementing **Marker Clustering** (e.g., `react-leaflet-markercluster`).
  - [TODO] Implementing a **search/autocomplete** feature for stations so users don't have to hunt for them on the map.
- [DONE] **Streamline Selection:** The current "Click marker -> Open popup -> Click button" flow is a bit slow. Consider a single-click selection or a more responsive side panel for station details.
- [DONE] **Asset Management:** Avoid using external URLs for Leaflet icons (e.g., `raw.githubusercontent.com`). These should be stored locally in the project to prevent breakage if the external source goes down.

### 4. Quality & Maintenance

- [DONE] **Testing Strategy:** The project currently lacks tests. At a minimum, I recommend:
  - [DONE] **Unit Tests:** For the season calculation and data transformation logic.
  - [DONE] **API Tests:** To verify the caching behavior and error handling of the Express server.
- [DONE] **Environment Configuration:** Centralize all constants (API URLs, cache durations, port numbers) into a `.env` file.
- [DONE] **Clean Up:** Remove unused dependencies (like `recharts` if you stick with Plotly) to keep the `package.json` lean.

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

## Second Code Review (post refactor)

I've completed a comprehensive review of the current state of the Snowpack Tracker. Since our last review, we've successfully modernized the data fetching layer, optimized map
performance with clustering, and significantly improved the UX of station selection.

Here is my senior developer's assessment of the next logical steps to move this project toward a production-ready application.

1. Architectural Improvements (Backend)

- [DONE] Typed API Responses: While the frontend is TypeScript, the backend is plain JavaScript. I recommend adding JSDoc types or migrating the backend services to TypeScript. This
  ensures that changes to the data structure in snowService.js are immediately flagged in the frontend's useSnowData hook.
- [TODO] Background Data Warming: Currently, the cache is "lazy" (it only fills when a user requests a station). We could implement a background worker that "warms" the cache for the
  top 50 most popular Oregon stations every 24 hours, ensuring those users always get a HIT.
- [TODO]API Versioning: Introduce /api/v1/snow to protect against breaking changes as we evolve the data transformation logic.

2. Performance & Bundle Optimization (Frontend)

- [DONE] Plotly Code Splitting: Reduced main bundle size by 90% (from 5.4MB to 541KB) by switching to `plotly.js-basic-dist` and implementing React.lazy code-splitting for the chart component.
- [TODO] Worker-based Parsing: If the seasonal data grows (e.g., fetching 80 years instead of 40), the JSON parsing can block the main thread. Moving the useMemo transformation logic
  in SnowpackChart.tsx to a Web Worker would keep the UI buttery smooth.

3. Feature & UX Enhancements

- [TODO] Multi-Station Comparison: The current architecture supports one station at a time. Refactoring the selectedStation state to an array (selectedStations) would allow users to
  overlay data from "Mt. Hood Test Site" against "Timberline," which is a high-value feature for snow enthusiasts.
- [DONE] Deep Linking (URL State): Synchronized selected station and hovered season to URL query parameters using a custom `useUrlState` hook. This allows users to share specific views.
- [TODO] Responsive "Station Details" Panel: The map popups are compact, but we lack a place to show detailed station metadata (elevation, county, installation date). A collapsible
  side panel or "Drawer" would be a better home for this than a tiny Leaflet popup.

4. Quality & Developer Experience

- [TODO] Integration Testing (Playwright/Cypress): We have unit and API tests, but we lack "Happy Path" tests. A single E2E test that "Clicks a station -> Verifies chart loads ->
  Hovers a line" would provide immense confidence for future refactors.
- [TODO] CSS Variable Consolidation: Move the custom Leaflet overrides from index.css into the @theme block or use Tailwind data- attributes to manage the "compact" state more
  idiomatically.
- [DONE] Prettier & Linting Enforcement: Added `npm run format` and updated `npm run lint` to enforce the project's style guide and ensure consistency across the codebase.

5. Repository Structure

- [DONE] Move Server to `/server`: As noted in your CREATION.md, the hybrid root directory is becoming crowded. Moving the Express server, its tests, and its package.json (shared) into a
  dedicated server/ directory is the final "clean" step for the repository's skeleton.

Which of these areas would you like to dive into first for our next session?

## Adding averages to the chart [DONE]

The current tool graphs yearly seasons. I would like to add a calculated season that averages every day's value over 5 seasons (inclusive). I am re-stating the goal here as we have had some progress in the currently edited files, but the changes are not perfect and I want you to assess where the code should be adjusted vs where we should restart the change.

Recall that the season is labelled by the year it ends in. Similarly, the 5-year seasons would be 1986-1990, 1991-1995, 1996-2000, etc. Note that any of the labels will add "Average" as in "1991-1995 Average".

We should also display those values in the list of yearly seasons when we show a mountains values.

Average all of the values: depth, snow water equvalent and temperature.

### db changes [DONE]

We should calculate these values and store them in the DB prior to visualization. This is a breaking change for the data in the database. Let's call this a "version 2" database somehow. If we encounter a prior version (no version label) we should clear out the db and allow client fetches to refill the data. As the data is refilled we will add the averages. This should be clear from INFO messages in the log.

### server log messages [DONE]

It should be clear from the server log when the client asks for new data, when that data hits or misses and when the data is being requested from the external api. How much data is returned (in years and days)

## updating the display [DONE]

I would also like to bring out control of displayed years from plotly into the html I control.

I would like to remove the current plotly legend and add vertical double (min year, max year) slider with a full range of years (year-40 to year) as the max, but valid data selected as the current range (say, last 15 years if that is all that was returned) shown with the double-slider min/max. The user should be able to move the slider1
s, but they should have UI constraints to not go out of the valid range of data and not overlap min > max.

Any data outside the range of the sliders should drop.

Add toggles for "Display yearly" and "Display average"

### Color scheme [DONE]

The colors shown currently (light blue, dark blue) will be changing. What I would like is to use the Perceptually Uniform Sequential viridis color scale from python's matplotlib for the seasons. The range should be set for the full range of years in the current mountain data. It shouldn't change based on min/max year.

## DB Fixes [DONE]

I think I want to consider a mix of data sources. I'm not seeing the expected data from the Powderlines for the oldest data. What do you think of this?

For data older than 1 year ago, let's get the data files we download from the main government SNOTEL sites. I believe that is CSV which we will then need to parse. When we download that data, let's save the raw files for later use. Save it in a directory that we keep out of git so we can always recreate the DB with that data on startup if we need to.

After loading the historical data, we put that data into our sqlite DB.

When doing live display of the webpage and asking for recent data younger than 1 year, we should get from the Powderlines API and store that only in our sqlite DB. We don't want to ask for CSV files unless we are asking for historical data.

We should be vigiliant about handling missing data as missing and not coercing it to values like 0 degrees or 0 inches.

We also should be aware that sometimes we have temp data, but not snow depth. the gui should note this when displaying min/max years of valid data. Data that is all 0s for an extended period should probably be considered "missing". The logic in this region may want to have directed tests to verify correct behavior.

For interactivity, it is clear that 40 years of 365 days of data is way too much. I'm thinking weekly (52) data may be just a bit too coarse. How about bi-weekly (104 periods per year)? So, I would like to process any season's data stored in the DB down to 104 samples per year.

Can you develop a plan, summarize it and report back? Please ask clarifying questions and do not make any changes at this time.
