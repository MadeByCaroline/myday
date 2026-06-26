# MyDay — AI-Powered Productivity Assistant

MyDay is a personal productivity SaaS MVP that connects to your Google and Microsoft accounts, analyses your emails and calendar in real-time, and uses AI to generate a daily summary and task suggestions — **without ever storing your email or calendar data in a database**.

---

## 🛠️ Tech Stack

| Layer      | Technology                                                             |
|------------|------------------------------------------------------------------------|
| Frontend   | Vue 3 (Composition API) · TypeScript · Vite · Pinia · Tailwind CSS · PrimeVue |
| Backend    | NestJS · TypeScript                                                    |
| Database   | SQLite (dev) / PostgreSQL (prod) via Prisma ORM                        |
| Auth       | Google OAuth 2.0 · Microsoft OAuth 2.0 · JWT                          |
| AI         | Google Gemini `gemini-2.5-flash`                                       |
| Mail/Cal   | Google Gmail API · Google Calendar API (via `googleapis`)              |

---

## 🔒 Privacy by Design

- Raw email content and calendar events are **never persisted** in the database.
- They are fetched in-memory per request, sent to Google Gemini, and discarded.
- Only `User`, `OAuthToken`, and accepted `Task` records are stored.

---

## 📋 Prerequisites

- **Node.js 20+** (use [nvm](https://github.com/nvm-sh/nvm): `nvm use` at project root)
- A **Google Cloud** project with OAuth 2.0 credentials and the following APIs enabled:
  - Gmail API
  - Google Calendar API
- A **Microsoft Azure** app registration with OAuth 2.0 credentials (optional)
- A **Google Gemini API** key

---

## 🚀 Getting Started

### 1. Install dependencies

From the monorepo root, install all workspace dependencies in one command:

```bash
npm install
```

### 2. Configure environment variables

Copy the backend example file and fill in your values:

```bash
cp backend/.env.example backend/.env
```

**`backend/.env`**

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me-in-production"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://127.0.0.1:3000/auth/google/callback"

# Microsoft OAuth (optional)
MICROSOFT_CLIENT_ID="your-microsoft-client-id"
MICROSOFT_CLIENT_SECRET="your-microsoft-client-secret"
MICROSOFT_CALLBACK_URL="http://127.0.0.1:3000/auth/microsoft/callback"

# Google Gemini AI
GEMINI_API_KEY="your-gemini-api-key"

FRONTEND_URL="http://127.0.0.1:5173"
PORT=3000
```

**`frontend/.env`**

```env
VITE_API_URL=http://localhost:3000
```

> **Google OAuth Setup:**
> In Google Cloud Console → APIs & Services → Credentials, add `http://127.0.0.1:3000/auth/google/callback` as an authorised redirect URI.
> Ensure the OAuth consent screen has scopes: `email`, `profile`, `gmail.readonly`, `calendar.readonly`.

### 3. Set up the database

```bash
cd backend
npx prisma migrate dev --name init
```

### 4. Start the whole project

Open two terminal tabs from the project root:

```bash
# Terminal 1 – Backend (http://localhost:3000)
npm run dev:backend

# Terminal 2 – Frontend (http://localhost:5173)
npm run dev:frontend
```

Open **http://localhost:5173** in your browser.

> **Using Docker Compose?**
> ```bash
> docker-compose up
> ```

---

## 📁 Project Structure

```
myday/
├── .editorconfig             # IDE-agnostic code style
├── .nvmrc                    # Node.js version constraint (20)
├── .prettierrc               # Shared Prettier config
├── .prettierignore           # Prettier ignore patterns
├── tsconfig.base.json        # Shared TypeScript compiler options
├── package.json              # Monorepo root (npm workspaces)
├── docker-compose.yml        # Local full-stack development
│
├── backend/                  # NestJS application
│   ├── prisma/
│   │   └── schema.prisma     # User, OAuthToken, Task models
│   ├── src/
│   │   ├── ai/               # AiService — Google Gemini integration
│   │   ├── auth/             # Google + Microsoft OAuth, JWT strategies
│   │   ├── calendar/         # CalendarService — Google Calendar API
│   │   ├── mail/             # MailService — Gmail API
│   │   ├── prisma/           # PrismaService (global)
│   │   ├── summary/          # SummaryController — orchestrates AI analysis
│   │   ├── tasks/            # TasksController + TasksService — CRUD
│   │   └── users/            # UsersService — findOrCreate + token storage
│   └── test/
│       └── app.e2e-spec.ts
│
└── frontend/                 # Vue 3 application
    ├── src/
    │   ├── components/
    │   ├── layouts/           # MainLayout.vue — persistent sidebar
    │   ├── router/
    │   │   └── index.ts       # /login, /auth/callback, /dashboard
    │   ├── stores/
    │   │   ├── auth.ts        # JWT + user state
    │   │   ├── summary.ts     # AI summary + calendar events
    │   │   └── tasks.ts       # Suggested + accepted tasks
    │   └── views/
    │       ├── AuthCallbackView.vue
    │       ├── DashboardView.vue
    │       └── LoginView.vue
    └── public/
```

---

## 🔌 API Endpoints

| Method | Path                       | Auth | Description                                  |
|--------|----------------------------|------|----------------------------------------------|
| GET    | `/auth/google`             | —    | Redirect to Google OAuth consent screen      |
| GET    | `/auth/google/link`        | JWT  | Link an additional Google account            |
| GET    | `/auth/google/callback`    | —    | OAuth callback — issues JWT, redirects to UI |
| GET    | `/auth/microsoft`          | —    | Redirect to Microsoft OAuth consent screen   |
| GET    | `/auth/microsoft/callback` | —    | OAuth callback — issues JWT, redirects to UI |
| GET    | `/auth/profile`            | JWT  | Returns authenticated user profile           |
| POST   | `/summary/generate`        | JWT  | Fetches mail + calendar, runs AI analysis    |
| GET    | `/tasks`                   | JWT  | List all accepted tasks for the user         |
| POST   | `/tasks`                   | JWT  | Accept a suggested task (saves to DB)        |
| DELETE | `/tasks/:id`               | JWT  | Delete an accepted task                      |

---

## 🧪 Tests

```bash
# Backend unit tests
cd backend && npm run test

# Backend e2e tests
cd backend && npm run test:e2e -- --runInBand
```

---

## ✅ User Stories Implemented

- [x] Sign in with Google OAuth 2.0
- [x] Sign in with Microsoft OAuth 2.0
- [x] Dashboard landing page
- [x] "Generate My Summary" button triggers AI analysis
- [x] AI summary card with textual overview of recent messages
- [x] Interactive daily agenda (timeline view of calendar events)
- [x] Suggested tasks list — **Accept** saves to DB, **Refuse** removes from UI

---

## 🏗️ Production Notes

- Replace `DATABASE_URL` with a PostgreSQL connection string (`postgresql://...`).
- Set a strong random `JWT_SECRET`.
- Store OAuth tokens encrypted at rest if required by your compliance policy.
- Set `FRONTEND_URL` to your production frontend domain for CORS and redirect.
