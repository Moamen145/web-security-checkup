# Web Security Checkup 🛡️

A professional, defensive web security configuration and exposure assessment platform built for website owners, developers, and cybersecurity learners.

> **Defensive Philosophy**: Web Security Checkup performs controlled, safe, non-destructive security checks against publicly observable website configurations. It is not an exploitation framework or vulnerability scanner replacement for Burp Suite/Metasploit. It answers: *"How well configured is my website from a defensive web security perspective, and what should I fix first?"*

---

## Key Features

- **6 Deterministic Security Check Modules**:
  1. **HTTPS & TLS Transport**: Certificate validity, expiration dates, Subject Alternative Names (SAN), obsolete TLS 1.0/1.1 protocols, and plain HTTP-to-HTTPS redirect.
  2. **HTTP Security Headers**: Strict-Transport-Security (HSTS), Content-Security-Policy (CSP), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.
  3. **Cookie Security**: Secure, HttpOnly, and SameSite flags on session tokens.
  4. **DNS Health**: A, AAAA, and CNAME resolution health.
  5. **Email Authentication**: SPF qualifier strength (`-all` vs `+all`), DMARC policy enforcement (`p=reject`/`quarantine`/`none`), and DKIM selector heuristics.
  6. **Exposure Disclosure**: Server signature banners and `X-Powered-By` framework leaks.
- **SSRF & Abuse Prevention**:
  - RFC 1123 FQDN validation rejecting raw IPs and restricted TLDs.
  - Pre-flight DNS resolution with CIDR blacklisting blocking RFC 1918 (10/8, 172.16/12, 192.168/16), loopback (127/8, ::1), and cloud metadata (`169.254.169.254`).
  - Socket IP pinning ensuring HTTP/TLS sockets connect directly to the pre-validated public IP to neutralize DNS Rebinding attacks.
  - Per-hop SSRF validation across redirects (max 5 hops) and 5000ms hard timeouts.
- **Mathematical Security Scoring (0–100)**:
  - Transparent point deduction model with severity weights (`CRITICAL: -25`, `HIGH: -15`, `MEDIUM: -8`, `LOW: -3`, `INFO: 0`).
  - Critical finding caps: 1 critical finding caps score at 65 (Grade D max); 2+ critical findings cap score at 40 (Grade F max).
  - Letter grades (A, B, C, D, F).
- **Real-Time Scan Streaming**: Server-Sent Events (SSE) pushing stage progress live to the browser.
- **Remediation Code Snippets**: Copy-paste Nginx, Apache, and application code configs for every finding.
- **Assessment Comparison Tool**: Side-by-side diff comparing two historical scans, highlighting resolved fixes, new regressions, persisting issues, and score delta.
- **AI-Assisted Explanation Layer**: Opt-in LLM layer producing executive summaries and prioritized action plans strictly derived from deterministic scanner results (zero hallucinations).

---

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons
- **Backend API**: Fastify, TypeScript, Zod, Prisma ORM, Argon2id/Bcrypt
- **Database**: SQLite (local zero-setup) / PostgreSQL 16 (production)
- **Background Engine**: Asynchronous queue with event emitter and concurrency controls
- **Containerization**: Docker Compose, Multi-stage Dockerfiles, Nginx reverse proxy

---

## Getting Started

### Prerequisites
- Node.js $\ge 20$
- npm $\ge 10$

### 1. Installation
Clone the repository and install workspace dependencies:
```bash
npm install
```

### 2. Database Setup
Push the Prisma schema to create the local SQLite database (`data/dev.db`):
```bash
npx prisma db push --schema=apps/api/prisma/schema.prisma
```

### 3. Run Automated Tests
Execute the security and unit test suite (SSRF guard, scoring engine, finding normalizer):
```bash
npx tsx --test apps/api/src/tests/*.test.ts
```

### 4. Start Development Servers
Start both backend API and frontend in parallel:
```bash
# Terminal 1: Backend API (runs on http://localhost:4000)
npm --workspace=@wsc/api run dev

# Terminal 2: Web Frontend (runs on http://localhost:5173)
npm --workspace=@wsc/web run dev
```

### 5. Access the Web App
Open [http://localhost:5173](http://localhost:5173) in your browser.
Use the **"Launch Demo Session"** button on the Sign In page for instant one-click login.

---

## Running with Docker Compose

For a complete containerized production environment (Postgres, Redis, API, and Web):
```bash
docker compose -f docker/docker-compose.yml up --build
```
Web interface will be accessible on `http://localhost:80`.

---

## License
MIT. Built for defensive security education and website owner empowerment.
