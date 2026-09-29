---
name: structure-modular-fullstack
description: Design, audit, or refactor a React/Vite, Next.js, and Node/Express full-stack project into clean frontend and backend modules. Use when the user requests project structure, modular programming, separation of concerns, maintainability, reduced duplication, or an architecture refactor while preserving existing behavior and UI.
---

# Structure Modular Fullstack

Design, audit, or refactor a full-stack codebase into discoverable, decoupled, and testable modules. Treat all reference file layouts as contextual patterns rather than rigid mandates. Inspect the existing framework, routing paradigms, build configurations, persistence layers, and deployment targets before proposing or executing file movements.

---

## 1. Operating Workflow

1. **Inventory Existing Assets:**
   - Document entry points, page/route declarations, feature domains, reusable UI, state stores, HTTP/API clients, persistence logic, validators, middleware, configuration files, test suites, and build scripts.
2. **Trace Contracts & Data Flow:**
   - Map request flows end-to-end: UI component $\to$ client API service $\to$ network boundary $\to$ router $\to$ controller $\to$ domain service $\to$ persistence.
   - Record explicit contracts: URL paths, HTTP verbs, payload/response shapes, authentication headers, environment variables, database migrations, build targets, and existing UI behavior.
3. **Establish Cohesive Module Boundaries:**
   - Choose the smallest sensible boundary. Group by vertical feature slice when components, hooks, endpoints, or data calls belong strictly to one business capability. Keep genuinely shared code in cross-cutting layers.
4. **Execute Incremental Slices:**
   - Migrate one slice at a time. Update import and export paths immediately. Keep structural refactoring isolated from behavioral or feature updates unless combined changes were explicitly requested.
5. **Verify and Report:**
   - Run type checks, unit/integration tests, and production build commands. Validate routes, authentication, authorization, and core user flows. Explicitly flag any untested or unverified paths.

---

## 2. Frontend Architectural Boundaries

- **Route / Page:** Coordinates layout assembly, page-level data fetching, and navigation. Delegates business logic and view details downward.
- **Feature Module:** Encapsulates domain-specific components, hooks, API queries/mutations, local types, and localized state. Exposes a lean, explicit public API (e.g., via `index.ts`).
- **Shared / UI Component:** Houses generic, stateless presentation elements reused across features (buttons, modals, form inputs). Never embed domain-specific business rules inside generic UI.
- **Hook:** Encapsulates React lifecycle, state logic, and event wiring. Do not convert pure mathematical or string utilities into hooks unnecessarily.
- **API Client / Service:** Centralizes base URL handling, transport protocols, auth token injection, header propagation, response parsing, and standard error normalization.
- **State:** Keep state as close to its consumer as possible. Use local component state first, uplift to feature-level context next, and reserve global stores strictly for confirmed cross-domain application state (e.g., active session, global theme).
- **Utility:** Pure, deterministic helper functions with zero UI or lifecycle dependencies.
- **Assets & Styles:** Maintain imported, build-processed assets within `src/assets/`; use `public/` exclusively for static assets served directly by the web server without bundling.

### Reference Layout: Small React / Vite

```text
src/
├── assets/
├── components/          # Cross-cutting UI primitives (Button, Modal, Input)
├── hooks/               # Generic UI/utility hooks
├── pages/               # Top-level screen views
├── services/            # Base HTTP client and transport handlers
├── styles/              # Global variables, themes, resets
├── utils/               # Pure formatting and calculation helpers
├── App.jsx
└── main.jsx
public/
.env.example
package.json
vite.config.js
```

### Scaling Path
- As features mature, transition domain-bound components into `src/features/<feature-name>/` (containing internal components, hooks, api, and types), reserving `src/components/` and `src/hooks/` for generic design-system primitives.
- For **Next.js**, align strictly with `app/` (App Router) or `pages/` (Pages Router) conventions. Never place Vite-specific artifacts (`main.jsx`, `vite.config.js`) into Next.js projects. Enforce boundary isolation by keeping server-only packages, database drivers, and secret keys out of client components (`'use client'`).

---

## 3. Backend Architectural Boundaries

- **Route:** Declares URI paths, HTTP methods, route-level middleware pipelines, and delegates directly to a controller handler.
- **Controller / Handler:** Extracts route parameters, query strings, and request bodies; invokes the appropriate domain service or use case; maps service outcomes to HTTP response status codes and serialized payloads. Keep controllers thin.
- **Service / Use Case:** Houses the core business rules and orchestration logic. Must remain decoupled from framework transport objects (`req`, `res`, `next`).
- **Repository / Data Access:** Encapsulates raw database queries, ORM/query builder interactions, and database error normalization when persistence complexity warrants an abstraction layer.
- **Model / Schema:** Defines database tables, documents, or ORM entities. Keep persistence models distinct from incoming validation schemas and outgoing API Data Transfer Objects (DTOs).
- **Validator:** Inspects, validates, and sanitizes untrusted input at the network boundary before passing payloads to controllers.
- **Middleware:** Solves cross-cutting concerns (authentication verification, authorization guard checks, rate limiting, request tracing, and global error handling).
- **Configuration:** Reads and validates environment variables at startup (e.g., using Zod or Envalid), failing fast on invalid or missing configurations.
- **Shared Errors & Types:** Centralizes custom domain exception classes and contract interfaces.

### Reference Layout: Node / Express / TypeScript

```text
src/
├── config/              # Validated environment variables and service setups
├── controllers/         # HTTP request/response handlers
├── middlewares/         # Auth guards, logging, global error boundary
├── models/              # Database entities and persistence schemas
├── routes/              # Express Router declarations
├── services/            # Pure business logic and domain use cases
├── types/               # Shared interfaces, DTOs, and type definitions
├── utils/               # Pure utility functions
├── validators/          # Input validation schemas (Zod, Joi)
├── app.ts               # Express application initialization and middleware wiring
└── server.ts            # Network listener instantiation and graceful shutdown
.env.example
package.json
tsconfig.json
```

### Scaling Path
- Decouple `app.ts` (pipeline assembly and export for integration tests) from `server.ts` (port listening and process signals).
- For large services, transition to vertical slice packaging under `src/modules/<feature>/` (co-locating routes, controllers, services, and validation schemas per domain). Avoid adding empty intermediate directories that serve no present architectural purpose.

---

## 4. Full-Stack Contracts & System Optimization

- **Single Source of Truth:** Share API contracts, request payloads, and validation schemas where practical (e.g., via a shared TypeScript package or schema generators), or generate typed clients directly from OpenAPI/tRPC/GraphQL definitions.
- **Bundle Isolation:** Prevent server-side packages, database adapters, and environment secrets from leaking into client-side bundles.
- **Network State Hygiene:** Provide explicit, resilient UI handling for `loading`, `empty`, `error`, `retry`, and `unauthorized` states across all asynchronous touchpoints.
- **Security Boundaries:** Enforce all authorization checks and input sanitization on the server. Client-side validation is strictly an ergonomic UX enhancement, not a security boundary.
- **Dependency Inversion & Direction:** Maintain strict directional dependencies:
  - *Frontend:* Route View $\to$ Feature Module $\to$ Shared API Client / Primitives.
  - *Backend:* Route $\to$ Controller $\to$ Service / Use Case $\to$ Repository / Model.
- **Circular Dependency Guard:** Disallow circular dependencies between modules; avoid direct database queries inside presentation components or Next.js Client Components.
- **Pragmatic Optimization:** Profile before refactoring. Address network waterfalls, bundle footprints, cache layers, query indices, and render cycles based on telemetry data rather than folder rearrangements alone.

---

## 5. Output Deliverables

### Planning Mode
When asked to plan, audit, or design a modular architecture:
1. Provide a **Current-to-Proposed File Mapping** detailing where files will move.
2. Outline a **Target Directory Structure** customized to the detected framework and runtime.
3. Detail a staged **Migration Order** that minimizes breaking changes.
4. Highlight technical risks (e.g., circular dependencies, environment leaks, breaking API contracts).

### Implementation Mode
When executing a modular refactoring directly:
1. Perform file migrations systematically in isolated slices.
2. Update path aliases, module imports, and exports.
3. Preserve all existing public contracts, HTTP APIs, and visible UI behavior.
4. Execute test suites and build scripts to verify compilation and runtime integrity.
5. Provide a summary documenting moved files, directories created with their specific responsibilities, and verified verification paths.