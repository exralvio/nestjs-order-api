# Comprehensive Order API

A NestJS, Prisma, PostgreSQL multi-tenant demo with JWT auth, product catalog, and order processing powered by Redis caching and RabbitMQ-based asynchronous workflows.

### Architecture decisions (why Prisma, why Redis)
- **Prisma (ORM)**: Strong type-safety, excellent DX, and first-class PostgreSQL support. Prisma clients can be dynamically instantiated per-tenant with different `DATABASE_URL`s, which fits database-per-tenant models well. Migrations are managed and auditable; tenant-specific SQL can be applied programmatically.
- **Redis (cache)**: Low-latency hot-path caching and request/result memoization. Works as a shared, external cache across horizontally scaled API instances and consumers. Keys are tenant/user-scoped to preserve isolation and allow targeted invalidation.
- **RabbitMQ (queue)**: Reliable background processing for database creation and order lifecycle steps. Decouples user-facing requests from longer-running work and improves perceived performance and reliability.

### How multi-tenancy is handled
- **Database-per-tenant**: Each tenant has its own PostgreSQL database named `${DATABASE_PREFIX}${tenantCode}` for strong data isolation.
- **Request-scoped Prisma**: `TenantContextService` resolves the active tenant from route (`:tenantCode`) or ADMIN user. `PrismaService` delegates to `DatabaseManagerService` to provide a Prisma client bound to that tenant DB for the lifetime of the request.
- **On-demand provisioning**: Creating an ADMIN with a unique `tenantCode` enqueues a job. A consumer creates the tenant DB and applies migrations from `prisma/tenant_migrations/*`, then marks `isDatabaseCreated=true`.
- **Default DB for users**: Platform users live in the default database; tenant DBs only contain business entities (products, orders, order_items).

### How the system scales in production
- **Stateless API**: All state (DB, Redis, RabbitMQ) is external, enabling horizontal scaling of API/consumer processes behind a load balancer.
- **Connection management**: One Prisma client per-request per-tenant, pooled by the driver. Consider a gateway pooler (e.g., PgBouncer) and sane pool limits for many tenants.
- **Cache effectiveness**: Redis absorbs read load; cache keys are tenant-scoped and invalidated on writes to keep consistency tight.
- **Async workflows**: RabbitMQ smooths spikes and isolates failures; consumers can be scaled independently by queue.
- **Operational hygiene**: Health checks, structured logs, and per-tenant migration management. Use metrics (latency, queue depth, DB connections) and alerts; apply rate limits and idempotency on payment/completion endpoints if exposing publicly.

### Features
- **Authentication (JWT)**: Register and login; protected routes with role-based access (ADMIN, CUSTOMER).
- **Multi-tenancy (database-per-tenant)**: ADMIN users with `tenantCode` get isolated databases. Customers operate across tenants where applicable.
- **Product management**: CRUD with pagination, per-tenant routing via `:tenantCode` path and a request-scoped Prisma client.
- **Order lifecycle**: Create orders, add items, checkout/payment, and completion. Cross-tenant order listing for a user.
- **Asynchronous workers (RabbitMQ)**:
  - Database creation for new tenants.
  - Order processing queue to set WAITING_FOR_PAYMENT and generate payment link (stub).
  - Order completion queue to finalize orders and send confirmations (stub).
- **Request-scoped multi-tenant Prisma**: Dynamic database switching via `TenantContextService` and `PrismaService` proxies.
- **Redis cache**: Request/result caching with keys scoped by tenant/user and automatic invalidation via decorators/interceptor.
- **Swagger docs**: Available at `/api/docs` with global `/api` prefix.
- **Structured logging**: Global HTTP logging interceptor with safe redaction.

---

## Tech Stack
- **Runtime/Framework**: NestJS 10, TypeScript
- **ORM**: Prisma 5 (PostgreSQL)
- **Auth**: Passport JWT via `@nestjs/jwt`
- **Queue**: RabbitMQ (`amqplib`)
- **Cache**: Redis (`ioredis`)
- **Docs**: Swagger (`@nestjs/swagger`)

---

## Quick start
1) Install dependencies:
```bash
npm install
```

2) Set environment variables (example `.env`):
```bash
PORT=3000
# Primary Postgres (default tenant DB)
DATABASE_URL=postgresql://user:pass@localhost:5432/store_master?schema=public
# Tenant DBs will be created with this prefix
DATABASE_PREFIX=store_
# JWT
JWT_SECRET=change-me
# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# RabbitMQ
RABBITMQ_URL=amqp://127.0.0.1:5672
```

3) Run migrations and seed default DB (users live in default DB):
```bash
npx prisma migrate deploy
npx prisma db seed
```

4) Start the application:
   
   **Terminal 1 - Start the API server:**
   ```bash
   npm run start:dev
   ```
   
   **Terminal 2 - Start the RabbitMQ consumers (in a separate terminal):**
   ```bash
   npm run start:consumer
   ```
   
   The API will be available at `http://localhost:3000/api` and the consumers will process background jobs (database creation, order processing, and order completion).

   **Alternative production commands:**
   ```bash
   npm run start          # API prod (compiled)
   npm run start:consumer:prod  # Consumers in prod mode
   ```

5) Open Swagger:
- `http://localhost:3000/api/docs`

---

## API sitemap (high-level)
Global prefix: `/api`

- **Auth** (`/api/auth`)
  - `POST /register` — create CUSTOMER user
  - `POST /login` — JWT login; returns `access_token`
  - `GET  /profile` — current user (JWT required)

- **Users** (`/api/users`) [ADMIN only]
  - `POST /` — create user (ADMIN requires unique `tenantCode`) → triggers async tenant DB creation
  - `GET  /` — list users
  - `GET  /:id` — get user
  - `PATCH /:id` — update user
  - `DELETE /:id` — delete user
  - `GET  /:id/database-status` — tenant DB readiness flag

- **Products** (`/api/:tenantCode/products`) [JWT]
  - `POST /` — create product [ADMIN]
  - `GET  /` — list products (pagination: `page`, `per_page`) [ADMIN, CUSTOMER]
  - `GET  /:id` — get product [ADMIN, CUSTOMER]
  - `PATCH /:id` — update product [ADMIN]
  - `DELETE /:id` — delete product [ADMIN]

- **Orders** (`/api/orders`) [JWT]
  - `POST /:tenantCode/create` — create order and enqueue processing [ADMIN, CUSTOMER]
  - `GET  /` — list current user’s orders across all ready tenants (pagination)
  - `GET  /:tenantCode/:id` — get single order for current user
  - `POST /:tenantCode/:id/payment-received` — mark paid; updates stock; sets PAID
  - `POST /:tenantCode/:id/complete` — enqueue completion with `transaction_id`

Notes:
- All protected routes require `Authorization: Bearer <token>` header.
- `:tenantCode` in path explicitly selects a tenant database for that request.

---

## Database design
- Default database (from `prisma/schema.prisma`):
  - `users` — holds platform users with optional `tenantCode` (unique) and `isDatabaseCreated` flag; ADMIN users represent tenants.
  - Also includes `products`, `orders`, and `order_items` models for default DB usage.
- Tenant databases (from `prisma/tenant-schema.prisma` + `prisma/tenant_migrations/*`):
  - Each tenant gets its own DB named `${DATABASE_PREFIX}${tenantCode}`
  - Schema includes `products`, `orders`, `order_items` (no `users` table; users remain in default DB)

### Multi-tenant routing
- `TenantInterceptor` sets tenant context from `:tenantCode` path (or query), or from ADMIN user’s `tenantCode`.
- `PrismaService` is request-scoped; it delegates to `DatabaseManagerService` to select the correct Prisma client/connection based on the current tenant.
- `DatabaseCreationConsumer` creates a new tenant DB on-demand and applies SQL migrations from `prisma/tenant_migrations/*`.

---

## Redis cache
- `CacheService` builds keys as `<tenant>:<Controller>:<method>[:args|userId]`.
- `@Cacheable({ ttl, includeArgs, includeUserId })` to cache responses.
- `@InvalidateCache([...])` to invalidate after writes; can target specific methods, user keys, or entire controller pattern; supports default-tenant overrides.
- `CacheInterceptor` implements the policy and wiring.

Environment:
- `REDIS_HOST`, `REDIS_PORT`, optional `REDIS_PASSWORD`.

---

## RabbitMQ async workflows
Queues:
- `database-creation` — create and migrate tenant DB, then mark `isDatabaseCreated=true` for the ADMIN user.
- `order-processing` — when an order is created, set `WAITING_FOR_PAYMENT`, assign `paymentId` and emit stubs for payment link/email.
- `order-completed` — when completion is requested, set `COMPLETE` with `transactionId` and emit stub email.

Services/consumers:
- `RabbitMQService` — connection/retry, queue asserts, publish/consume helpers.
- `DatabaseCreationConsumer`, `OrderProcessingConsumer`, `OrderCompletedConsumer` — background workers started by `npm run start:consumer`.

Environment:
- `RABBITMQ_URL=amqp://127.0.0.1:5672`

---

## Auth
- JWT payload includes `sub`, `email`, `role`, and optional `tenantCode`.
- `JwtAuthGuard`, `RolesGuard`, and `@Roles()` protect routes.

Environment:
- `JWT_SECRET` and token expiry configured in `AuthModule`.

---

## Development notes
- Global prefix: `/api`; Swagger at `/api/docs`.
- Global validation pipe with whitelist/transform.
- Global logging interceptor for requests and errors.
- Scripts:
```json
{
  "build": "nest build",
  "start": "nest start",
  "start:dev": "nest start --watch",
  "start:prod": "node dist/main",
  "start:consumer": "ts-node src/consumer/main.ts",
  "start:consumer:prod": "node dist/consumer/main.js",
  "seed": "ts-node prisma/seed.ts"
}
```

---

## Testing
- Unit/E2E setup via Jest. Run:
```bash
npm run test
npm run test:e2e
```

---

## Health and troubleshooting
- Redis: `CacheService.isHealthy()` pings Redis; check logs for connection issues.
- RabbitMQ: service retries connection; ensure broker is reachable and queues exist.
- DB URLs: logs mask secrets but show which database URL is in use per request.

---

## License
UNLICENSED
