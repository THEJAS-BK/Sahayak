# Scaffolding Plan

Initial repository structure and development environment setup for **Sahayak**.

> Status: Executed. No application features are implemented in this step.

## Scope

- Initialize the project structure only.
- No authentication, Postgres schema, APIs, AI/LLM, STT/TTS, telephony,
  notifications, maps, Docker, Redis, queues, background workers, or microservices.
- One repository, single Node.js backend process. No separately deployed services.

## Target structure

```
Sahayak/
├── mobile/
├── web/
├── backend/
├── voice-agent/
├── plans/
├── README.md
└── .gitignore
```

## Current structure (as scaffolded)

```
Sahayak/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/            (.gitkeep)
│   │   │   ├── users/           (.gitkeep)
│   │   │   ├── seniors/         (.gitkeep)
│   │   │   ├── volunteers/      (.gitkeep)
│   │   │   ├── requests/        (.gitkeep)
│   │   │   ├── matching/        (.gitkeep)
│   │   │   ├── emergencies/     (.gitkeep)
│   │   │   └── notifications/   (.gitkeep)
│   │   ├── middleware/          (.gitkeep)
│   │   ├── config/              (index.ts)
│   │   ├── database/            (.gitkeep)
│   │   ├── routes/              (.gitkeep)
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/                   (.gitkeep)
│   ├── package.json
│   └── tsconfig.json
├── mobile/
│   └── .gitignore               (placeholder, Flutter-ready)
├── web/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── Login/
│   │   │   ├── Dashboard/
│   │   │   ├── Requests/
│   │   │   ├── RequestDetails/
│   │   │   ├── Volunteers/
│   │   │   ├── VolunteerDetails/
│   │   │   ├── Verification/
│   │   │   ├── Emergencies/
│   │   │   └── Seniors/
│   │   ├── layouts/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── assets/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── voice-agent/                 (empty placeholder)
├── plans/
├── README.md
└── .gitignore
```

## Decisions

- Backend framework: **Express**.
- Backend runtime: Node.js + TypeScript, single application, modular by domain.
- `mobile/`: Flutter app deferred. Empty placeholder directory for now
  (Flutter SDK is not installed on this machine and no emulator/Android SDK is
  available to verify it).
- Monorepo created inside the existing `Sahayak/` git repository.

## Steps

### 1. Root

- Expand `README.md`: short description of the repo and its applications,
  and a note that `plans/` contains project planning and architecture docs.
- Create root `.gitignore` covering Node.js, TypeScript, React/Vite, Flutter/Dart,
  environment variables/secrets, IDE/editor files, and build artifacts.
  Never commit `.env` files or secrets.

### 2. `plans/`

- Create empty Markdown files:
  `project-scope.md`, `architecture.md`, `database-design.md`,
  `api-plan.md`, `development-plan.md`, `decisions.md`.
  Fill with content later; do not invent content now.

### 3. `mobile/`

- Placeholder directory with a Flutter-ready `.gitignore`.
- Flutter initialization is deferred.

### 4. `web/` — Vite + React + TypeScript

- Scaffold with `npm create vite@latest web -- --template react-ts`.
- Standard current Vite setup (uses `tsconfig.json`, `tsconfig.app.json`,
  `tsconfig.node.json`, `vite.config.ts`, `public/`, `index.html`).
- Reorganize `src/` into the initial structure:

```
web/src/
├── components/
├── pages/
│   ├── Login/
│   ├── Dashboard/
│   ├── Requests/
│   ├── RequestDetails/
│   ├── Volunteers/
│   ├── VolunteerDetails/
│   ├── Verification/
│   ├── Emergencies/
│   └── Seniors/
├── layouts/
├── services/
├── hooks/
├── types/
├── utils/
├── assets/
├── App.tsx
└── main.tsx
```

- `pages/` is organized as one directory per page (tracked via `.gitkeep`).
- Remove demo boilerplate; keep `App.tsx` as a bare shell. No feature code.

### 4b. `voice-agent/`

- Empty placeholder directory.
- Will hold the voice agent service (STT, LLM, TTS, and telephony integration).
- Not scaffolded yet; initialization deferred.

### 5. `backend/` — Node.js + TypeScript (Express)

- Dependencies: `express`, `dotenv`.
- Dev dependencies: `typescript`, `tsx`, `@types/express`, `@types/node`.
- `"type": "module"`, scripts: `dev` (tsx watch), `build` (tsc), `start`.
- tsconfig: NodeNext, ES2022, strict, `outDir dist`, `rootDir src`.
- Structure:

```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── seniors/
│   │   ├── volunteers/
│   │   ├── requests/
│   │   ├── matching/
│   │   ├── emergencies/
│   │   └── notifications/
│   ├── middleware/
│   ├── config/
│   ├── database/
│   ├── routes/
│   ├── app.ts
│   └── server.ts
├── tests/
├── package.json
└── tsconfig.json
```

- `src/modules/*`, `middleware/`, `database/`, `routes/`, `tests/` are empty
  domain boundaries for now (tracked via `.gitkeep`).
- `src/config/index.ts` loads env config (basis for later `DATABASE_URL`).
- `src/app.ts`: minimal Express app (JSON middleware, root router, `GET /health`).
- `src/server.ts`: starts the app on `PORT` and logs.
- No Postgres schema, tables, or fake data.

### 6. Final verification

1. Flutter: skipped (deferred by decision).
2. Web: `npm install` → `npm run build` → dev server boots.
3. Backend: `npm install` → `tsc --noEmit` → `npm run build` → start + health check.
4. Repository structure matches target.

## Run commands

- Web dev: `npm run dev` (inside `web/`)
- Backend dev: `npm run dev` (inside `backend/`)
- Backend prod: `npm run build && npm start` (inside `backend/`)