# CIM Internship Dashboard - Production Ready

A production-ready deployment of the CIM (Case File) internship dashboard with:
- **Visitor login** (name/email) with session tracking
- **Visitor activity tracking** (login, page views, downloads, feedback, logout, session duration)
- **Feedback system** (1-5 star rating, comment, project/section context, timestamp)
- **Admin dashboard** (total/unique visitors, feedback stats, project popularity, recent activity, individual visitor timelines)
- **Company engagement reports** (PDF/CSV/Excel) with period filtering
- **Security**: no frontend secrets, server-side auth, environment variables, input validation
- **Multi-device central database** (PostgreSQL), public URL access
- **Preserved existing UI**, charts, navigation, functionality

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NETLIFY CDN                              │
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │  Static Assets   │    │    Netlify Functions (API)       │  │
│  │  (public/)       │    │    backend/dist/index.js         │  │
│  └──────────────────┘    └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │   PostgreSQL (Supabase/│
                        │   Neon/Railway)       │
                        └───────────────────────┘
```

## Quick Start

### 1. Prerequisites

- Node.js 20+
- PostgreSQL database (Supabase, Neon, Railway, or local)
- Netlify account (for deployment)

### 2. Local Development

```bash
# Install backend dependencies
cd backend
npm install

# Copy environment template and configure
cp .env.example .env
# Edit .env with your database URL and secrets

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

The backend will run on `http://localhost:3000` with API at `/api/*`.

For frontend development, serve the `public/` directory with any static server (e.g., `npx serve public` on port 5173).

### 3. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (with `sslmode=require` for cloud) |
| `JWT_SECRET` | Yes | Min 32 chars, used for signing access/refresh tokens |
| `JWT_EXPIRES_IN` | No | Access token TTL (default: `15m`) |
| `REFRESH_TOKEN_EXPIRES_IN` | No | Refresh token TTL (default: `7d`) |
| `ADMIN_USERNAME` | No | Admin username (default: `admin`) |
| `ADMIN_PASSWORD_HASH` | Yes | bcrypt hash of admin password (run `npm run db:seed` to generate) |
| `CORS_ORIGIN` | Yes | Your production frontend URL (e.g., `https://your-site.netlify.app`) |
| `PORT` | No | Server port (default: `3000`) |
| `NODE_ENV` | No | `development` or `production` |

### 4. Generate Admin Password Hash

```bash
# Option 1: Run seed script (uses default password "ChangeMe123!")
npm run db:seed

# Option 2: Generate custom hash
node -e "const bcrypt = require('bcryptjs'); console.log(await bcrypt.hash('your-password', 12))"
```

### 5. Database Setup (Supabase Example)

1. Create a new Supabase project
2. Go to SQL Editor and run the contents of `backend/src/db/schema.sql`
3. Copy the connection string from Project Settings → Database
4. Add to your `.env` as `DATABASE_URL`

### 6. Netlify Deployment

1. Push this repo to GitHub
2. Connect to Netlify:
   - Build command: `npm run build`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
3. Add environment variables in Netlify dashboard:
   - All variables from step 3 above
   - `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` (auto-configured by GitHub Action)
4. The GitHub Actions workflow (`.github/workflows/deploy.yml`) will:
   - Run lint/type check/tests
   - Build backend
   - Run database migrations
   - Deploy to Netlify

### 7. Manual Netlify Deploy (without GitHub Actions)

```bash
# Build everything
npm run build

# Deploy with Netlify CLI
npx netlify deploy --prod --dir=public --functions=netlify/functions
```

## Project Structure

```
omniroute_test/
├── backend/                    # Backend API (Hono + Node.js)
│   ├── src/
│   │   ├── index.ts           # Main app entry
│   │   ├── config/env.ts      # Environment validation (Zod)
│   │   ├── db/
│   │   │   ├── client.ts      # PostgreSQL pool
│   │   │   ├── migrate.ts     # Migration runner
│   │   │   └── schema.sql     # Database schema
│   │   ├── auth/
│   │   │   ├── jwt.ts         # JWT token handling
│   │   │   ├── hash.ts        # bcrypt password hashing
│   │   │   └── middleware.ts  # Auth middleware
│   │   ├── routes/
│   │   │   ├── auth.ts        # /api/auth/* (login, refresh, logout)
│   │   │   ├── visitors.ts    # /api/visitors/* (visitor-facing)
│   │   │   ├── admin.ts       # /api/admin/* (admin-only)
│   │   │   └── content.ts     # /api/content & /api/admin/content
│   │   ├── services/
│   │   │   └── report-generator.ts  # PDF/Excel report generation
│   │   ├── utils/
│   │   │   └── validation.ts  # Zod validation schemas
│   │   └── types/
│   │       └── context.ts     # Hono context type extensions
│   ├── dist/                  # Compiled output (gitignored)
│   ├── package.json
│   └── tsconfig.json
├── public/                     # Frontend (static, ES modules)
│   ├── index.html             # Main HTML (copied from CIM.html)
│   ├── js/
│   │   ├── api.js             # API client
│   │   ├── storage.js         # localStorage fallback
│   │   ├── data.js            # Chart data constants
│   │   ├── charts.js          # SVG chart rendering
│   │   ├── admin.js           # Admin panel
│   │   └── app.js             # Main app logic
│   └── assets/
│       └── reports/
│           └── operational-assessment.pdf  # Extracted from CIM.html
├── netlify/
│   ├── functions/
│   │   └── api.js             # Netlify Functions entry point
│   └── netlify.toml           # Netlify config (redirects, headers)
├── .github/
│   └── workflows/
│       └── deploy.yml         # CI/CD pipeline
├── package.json               # Root package.json (orchestrates backend)
└── README.md
```

## API Endpoints

### Visitor-Facing (`/api/visitors`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create visitor + session (login) |
| POST | `/sessions/:id/activity` | Log activity |
| POST | `/sessions/:id/logout` | End session |
| POST | `/feedback` | Submit feedback |
| POST | `/download` | Track download |

### Admin (`/api/admin`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Dashboard statistics |
| GET | `/visitors` | Paginated visitor list |
| GET | `/visitors/:id` | Visitor timeline |
| DELETE | `/visitors/:id` | Delete visitor |
| DELETE | `/visitors` | Bulk delete visitors |
| GET | `/feedback` | Paginated feedback list |
| DELETE | `/feedback/:id` | Delete feedback |
| GET | `/export/visitors` | Export visitors (CSV/JSON) |
| GET | `/export/feedback` | Export feedback (CSV/JSON) |
| GET | `/export/engagement-report` | Generate engagement report (PDF/Excel) |
| POST | `/reports/generate` | Generate report record |
| GET | `/reports/:id` | Download generated report |

### Content (`/api/content`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get dashboard content (public) |
| GET | `/admin/content` | Get all content (admin) |
| POST | `/admin/content` | Update content (admin) |
| POST | `/admin/content/reset` | Reset to defaults (admin) |

### Auth (`/api/auth`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Admin login |
| POST | `/refresh` | Refresh access token |
| POST | `/logout` | Admin logout |

## Security Features

- **No frontend secrets** — all secrets in Netlify environment variables
- **JWT authentication** — dual-token (access + refresh) with rotation
- **bcrypt password hashing** — cost factor 12
- **Rate limiting** — 30 req/min (visitors), 100 req/min (admins)
- **Input validation** — Zod schemas on all endpoints
- **CORS** — restricted to configured origin
- **Security headers** — CSP, X-Frame-Options, etc.
- **Row Level Security** — Supabase RLS policies for data isolation
- **IP hashing** — SHA-256 for privacy

## Frontend Notes

The frontend preserves **all original UI/UX** from `CIM.html`:
- Hand-drawn SVG charts (zero dependencies)
- Frame-following animation
- Content editing via `data-ck` attributes
- Navigation between Project One/Two/Overview
- Feedback modal with star rating
- Report downloads

Changes made:
- Replaced inline `<script>` with ES module imports (`type="module"`)
- Modularized into `js/app.js`, `js/admin.js`, `js/charts.js`, `js/api.js`, `js/data.js`, `js/storage.js`
- API calls now go to `/api/*` (proxied to Netlify Functions)
- PDF report served from `/assets/reports/operational-assessment.pdf`

## Report Generation

Reports are generated server-side using:
- **PDF**: `pdfkit` — professional PDF with tables, charts placeholder
- **Excel**: `exceljs` — multi-sheet workbook with formatting

Report types:
- **Visitors Export** — CSV/JSON of all visitor records
- **Feedback Export** — CSV/JSON of all feedback
- **Engagement Report** — PDF/Excel with:
  - Period summary (visitors, sessions, feedback, downloads)
  - Project breakdown
  - Top sections viewed
  - Feedback distribution
  - Recent activity log

## Troubleshooting

### "Rate limit exceeded"
- Visitor endpoints: 30 req/min per IP
- Admin endpoints: 100 req/min per admin
- Wait 60 seconds or check for loops

### "Invalid credentials" on admin login
- Verify `ADMIN_USERNAME` matches
- Verify `ADMIN_PASSWORD_HASH` was generated with bcrypt cost 12
- Run `npm run db:seed` to reset

### Database connection fails
- Check `DATABASE_URL` format: `postgresql://user:pass@host:5432/db?sslmode=require`
- For Supabase: use connection string from Settings → Database
- Ensure IPv6 is allowed if using `pooler.supabase.com`

### CORS errors
- Set `CORS_ORIGIN` to your exact frontend URL (no trailing slash)
- Include `https://` for production

### Netlify Functions not found
- Ensure `netlify/functions/api.js` exists and exports default handler
- Check `netlify.toml` redirects: `/api/*` → `/.netlify/functions/api/:splat`
- Verify build output in `backend/dist/`

## License

Internal use only — CIM Internship Dashboard