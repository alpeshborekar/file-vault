# CloudStash — File Storage Backend

A backend project I built to learn and demonstrate system design concepts like Google Drive / Dropbox.

**Live API Docs → [https://cloudstash-4cb1.onrender.com/api-docs/](https://cloudstash-4cb1.onrender.com/api-docs/)**

> Try it live — register an account, upload a file, see deduplication in action.

---

## What I built

A file storage REST API with:
- File upload with SHA-256 deduplication (identical files share one S3 blob)
- Large file support via S3 multipart presigned URLs
- Background processing queue (virus scan simulation → thumbnail → ready)
- Real-time upload progress via WebSocket
- Redis caching for file metadata
- File versioning and expiring share links
- JWT auth with per-user storage quotas

---

## Tech Stack

- **Node.js + TypeScript + Express** — API server
- **PostgreSQL + Prisma** — file metadata, users, versions
- **Redis + BullMQ** — metadata cache + async job queue
- **S3 / MinIO** — file blob storage
- **Socket.IO** — real-time upload progress
- **Prometheus + Grafana** — metrics and observability
- **Docker Compose** — runs the entire stack locally

---

## How it works

```
Upload flow:
Client → POST /upload → hash file (SHA-256)
       → dedup check in PostgreSQL
       → if new: stream to S3 → save metadata → queue BullMQ job
       → BullMQ worker: virus scan → thumbnail → mark ready
       → Socket.IO broadcasts progress to client in real-time

Download flow:
Client → GET /files/:id → Redis cache lookup
       → miss: query PostgreSQL → backfill cache
       → generate presigned S3 URL (15 min TTL)
       → client downloads directly from S3
```

**Key design decision:** file bytes never proxy through the API server for large files.
The server returns presigned S3 URLs and the client uploads/downloads directly to S3.
This keeps server memory flat regardless of file size.

---

## Running locally

```bash
git clone https://github.com/alpeshborekar/cloudstash
cd cloudstash
docker compose up --build

# Seed a test user
docker compose exec api npx ts-node prisma/seed.ts
# dev@example.com / Secret123
```

| Service | URL |
|---|---|
| API + Swagger | http://localhost:3000/api-docs |
| Bull Board (queue UI) | http://localhost:3000/admin/queues |
| MinIO Console | http://localhost:9001 |
| Grafana | http://localhost:3001 |

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/login` | — | Get JWT token |
| GET | `/auth/me` | JWT | Profile + storage usage |
| POST | `/upload` | JWT | Upload file (with dedup) |
| POST | `/upload/multipart/init` | JWT | Start chunked upload |
| POST | `/upload/multipart/:id/complete` | JWT | Finish chunked upload |
| GET | `/files` | JWT | List files (cursor-paginated) |
| GET | `/files/:id` | JWT | Get file + download URL |
| DELETE | `/files/:id` | JWT | Delete file |
| GET | `/files/:id/versions` | JWT | Version history |
| POST | `/files/:id/share` | JWT | Create share link |
| GET | `/files/shared/:token` | none | Download via share token |
| GET | `/health/ready` | — | Health check |
| GET | `/metrics` | — | Prometheus metrics |

---

## Project structure

```
src/
├── config/       # DB, Redis, S3, Socket.IO, Prometheus, Swagger
├── controllers/  # Route handlers
├── services/     # Business logic (upload, cache, progress, auth)
├── repositories/ # Database queries
├── workers/      # BullMQ consumers (scan, thumbnail, process)
├── middleware/   # JWT, rate limiting, validation, multer
├── routes/       # Express routers
├── models/       # TypeScript types + Zod schemas
└── utils/        # Errors, hashing, logger, cleanup cron
```

---

## What I learned

- How deduplication works at scale (hash-indexed blobs, shared storage keys)
- Why presigned URLs matter (offload bandwidth from API server)
- How BullMQ + Redis handles async job retries and progress tracking
- Cache-aside pattern with graceful Redis failure degradation
- Cursor pagination vs offset pagination (stability under concurrent inserts)
- Why workers should be decoupled from WebSocket via QueueEvents

---

## Roadmap

- [ ] Integration tests (Vitest + Testcontainers)
- [ ] Full-text search on file names
- [ ] Folder support
- [ ] CDN for thumbnail delivery