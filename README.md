# Sahayak

**Sahayak** is a safety and assistance platform for seniors, connecting them
with volunteers and local emergency services.

## Applications

- `mobile/` — Flutter mobile application (for seniors/volunteers). Placeholder; initialization deferred.
- `web/` — React + Vite + TypeScript police administration portal.
- `backend/` — Node.js + TypeScript API, a single modular application.
- `voice-agent/` — Voice agent service (STT, LLM, TTS, telephony). Placeholder; initialization deferred.

The `plans/` directory holds project planning and architecture documentation
(see `plans/scaffolding.md` for the setup plan).

## Backend

### Requirements

- Node.js >= 20 (developed against v22)
- npm

### Run

```bash
cd backend
npm install       # install dependencies
npm run dev       # start dev server with watch -> http://localhost:3000
```

Other scripts:

```bash
npm run build     # compile TypeScript to dist/
npm start         # run the compiled build (npm run build first)
```

Config is read from environment variables (optionally via a `.env` file):

- `PORT` (default `3000`)

Health check:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Web (React frontend)

### Requirements

- Node.js >= 20
- npm

### Run

```bash
cd web
npm install       # install dependencies
npm run dev       # start dev server -> http://localhost:5173
```

Other scripts:

```bash
npm run build     # type-check + production build to dist/
npm run preview   # preview the production build
npm run lint      # lint source with oxlint
```