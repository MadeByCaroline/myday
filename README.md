# MyDay — AI-Powered Productivity Assistant

MyDay is a personal productivity SaaS MVP that connects to your Google account, analyses your emails and calendar in real-time, and uses AI to generate a daily summary and task suggestions — **without ever storing your email or calendar data in a database**.

---

## 🛠️ Tech Stack

| Layer      | Technology                                                             |
|------------|------------------------------------------------------------------------|
| Frontend   | Vue 3 (Composition API) · TypeScript · Vite · Pinia · Tailwind CSS · PrimeVue |
| Backend    | NestJS · TypeScript                                                    |
| Database   | SQLite (dev) / PostgreSQL (prod) via Prisma ORM                        |
| Auth       | Google OAuth 2.0 via `passport-google-oauth20` · JWT                   |
| AI         | Google Gemini `gemini-2.5-flash`                                       |
| Mail/Cal   | Google Gmail API · Google Calendar API (via `googleapis`)              |

---

## 🔒 Privacy by Design

- Raw email content and calendar events are **never persisted** in the database.  
- They are fetched in-memory per request, sent to Google Gemini, and discarded.  
- Only `User`, `OAuthToken`, and accepted `Task` records are stored.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A Google Cloud project with **OAuth 2.0 credentials** and the following APIs enabled:
  - Gmail API
  - Google Calendar API
- A Google Gemini API key

---

### 1. Clone & Install

```bash
# Backend
cd backend
npm install
npx prisma migrate dev --name init   # creates SQLite dev.db

# Frontend
cd ../frontend
npm install
```

### 2. Configure Environment Variables

**`backend/.env`**

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me-in-production"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
GEMINI_API_KEY="your-gemini-api-key"
FRONTEND_URL="http://localhost:5173"
PORT=3000
```

**`frontend/.env`**

```env
VITE_API_URL=http://localhost:3000
```

> **Google OAuth Setup:**  
> In Google Cloud Console → APIs & Services → Credentials, add `http://localhost:3000/auth/google/callback` as an authorised redirect URI.  
> Ensure the OAuth consent screen has scopes: `email`, `profile`, `gmail.readonly`, `calendar.readonly`.

---

### 3. Run Locally

```bash
# Terminal 1 – Backend
cd backend
npm run start:dev

# Terminal 2 – Frontend
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 📁 Project Structure

```
myday/
├── backend/                  # NestJS application
│   ├── prisma/
│   │   └── schema.prisma     # User, OAuthToken, Task models
│   ├── src/
│   │   ├── ai/               # AiService — Google Gemini integration
│   │   ├── auth/             # Google OAuth + JWT strategies & controller
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
    │   │   ├── DailyAgenda.vue    # Interactive timeline of today's events
    │   │   ├── SummaryCard.vue    # AI-generated text summary
    │   │   └── TaskListView.vue   # Suggested tasks with Accept / Refuse
    │   ├── router/
    │   │   └── index.ts           # /login, /auth/callback, /dashboard
    │   ├── stores/
    │   │   ├── auth.ts            # JWT + user state
    │   │   ├── summary.ts         # AI summary + calendar events
    │   │   └── tasks.ts           # Suggested + accepted tasks
    │   └── views/
    │       ├── AuthCallbackView.vue
    │       ├── DashboardView.vue
    │       └── LoginView.vue
    └── public/
```

---

## 🔌 API Endpoints

| Method | Path                    | Auth     | Description                                    |
|--------|-------------------------|----------|------------------------------------------------|
| GET    | `/auth/google`          | —        | Redirect to Google OAuth consent screen        |
| GET    | `/auth/google/callback` | —        | OAuth callback — issues JWT, redirects to UI   |
| GET    | `/auth/profile`         | JWT      | Returns authenticated user profile             |
| POST   | `/summary/generate`     | JWT      | Fetches mail + calendar, runs AI analysis      |
| GET    | `/tasks`                | JWT      | List all accepted tasks for the user           |
| POST   | `/tasks`                | JWT      | Accept a suggested task (saves to DB)          |
| DELETE | `/tasks/:id`            | JWT      | Delete an accepted task                        |

---

## ✅ User Stories Implemented

- [x] Sign in with Google OAuth 2.0
- [x] Dashboard landing page
- [x] "Generate My Summary" button triggers AI analysis
- [x] AI summary card with textual overview of recent messages
- [x] Interactive daily agenda (timeline view of calendar events)
- [x] Suggested tasks list — **Accept** saves to DB, **Refuse** removes from UI

---

## 🧪 Tests

```bash
# Backend unit + e2e
cd backend
npm run test          # unit tests
npm run test:e2e      # e2e (tests unauthenticated 401 on protected routes)
```

---

## 🏗️ Production Notes

- Replace `DATABASE_URL` with a PostgreSQL connection string (`postgresql://...`).
- Set a strong random `JWT_SECRET`.
- Store OAuth tokens encrypted at rest if required by your compliance policy.
- Set `FRONTEND_URL` to your production frontend domain for CORS and redirect.
