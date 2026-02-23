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
- [ ] grab data back to the 1980s
- [ ] graph yearly seasons from July 1, YearX-1 to June 30, YearX
- [ ] add buttons to highlight 80s, 90s, 00s, 10s and 20s seasons
- [ ] add map component
- [ ] select different locations

## Backend server

### 1. Install Dependencies

First, we'll need express for the server, cors to handle cross-origin requests in development, and concurrently and nodemon to make running both servers easy.

```bash
npm install express cors
npm install -D concurrently nodemon
```

### 2. Create the Server

Create a new file named server.js in the root of your project. This file contains the caching and proxying logic.
