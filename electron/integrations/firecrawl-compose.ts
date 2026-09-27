// Careerloom's own minimal self-hosted Firecrawl (AGPL-3.0, run unmodified as
// a separate Docker Compose project). Derived — verbatim except for the header
// comment — from autoshorts' ClipStudio integration, itself derived from
// Firecrawl v2.11.408's docker-compose.yaml: scrape and map only (no LLM
// features, no FoundationDB), API bound to 127.0.0.1, memory capped at ~2.4 GB
// total, images pinned by digest, no volumes.
// Run as: docker compose -p careerloom-firecrawl -f - up -d  (this file on stdin)
export const FIRECRAWL_PROJECT = 'careerloom-firecrawl'
export const FIRECRAWL_SERVICES = ['api', 'playwright-service', 'redis', 'rabbitmq', 'nuq-postgres'] as const

export const FIRECRAWL_COMPOSE = `
x-limits: &limits
  security_opt: ["no-new-privileges:true"]
  logging:
    driver: json-file
    options: { max-size: "5m", max-file: "2" }
  networks: [backend]

services:
  api:
    <<: *limits
    image: ghcr.io/firecrawl/firecrawl:2.11.408@sha256:966ef7f9a385e1f27844d2d5a7037e9c01558481c3a94614df147002596c6f87
    command:
      - sh
      - -c
      - >-
        node dist/src/services/worker/nuq-worker.js &
        node dist/src/services/worker/nuq-prefetch-worker.js &
        exec node dist/src/index.js
    environment:
      HOST: "0.0.0.0"
      PORT: "3002"
      ENV: local
      USE_DB_AUTHENTICATION: "false"
      REDIS_URL: redis://redis:6379
      REDIS_RATE_LIMIT_URL: redis://redis:6379
      PLAYWRIGHT_MICROSERVICE_URL: http://playwright-service:3000/scrape
      NUQ_RABBITMQ_URL: amqp://rabbitmq:5672
      NUQ_DATABASE_URL: postgresql://postgres:postgres@nuq-postgres:5432/postgres
      NUQ_DATABASE_URL_LISTEN: postgresql://postgres:postgres@nuq-postgres:5432/postgres
      NUQ_WORKER_PORT: "3006"
      NUQ_PREFETCH_WORKER_PORT: "3011"
      NUQ_REDUCE_NOISE: "true"
      NUM_WORKERS_PER_QUEUE: "1"
      MAX_CONCURRENT_JOBS: "2"
      CRAWL_CONCURRENT_REQUESTS: "2"
      BROWSER_POOL_SIZE: "1"
      LOGGING_LEVEL: warn
    ports: ["127.0.0.1:3002:3002"]
    depends_on:
      redis: { condition: service_started }
      playwright-service: { condition: service_started }
      rabbitmq: { condition: service_healthy }
      nuq-postgres: { condition: service_healthy }
    cpus: 2.0
    mem_limit: 1200m
    memswap_limit: 1200m

  playwright-service:
    <<: *limits
    image: ghcr.io/firecrawl/playwright-service@sha256:df1a393ce8bfc3801570a826a9b0dcc400ae48789adb4a0ad9d6cbf0229b059b
    environment:
      PORT: "3000"
      MAX_CONCURRENT_PAGES: "2"
      BLOCK_MEDIA: "true"
    cap_drop: [ALL]
    cpus: 2.0
    mem_limit: 640m
    memswap_limit: 640m
    tmpfs: ["/tmp/.cache:noexec,nosuid,size=256m"]

  redis:
    <<: *limits
    image: redis:7.4-alpine@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499
    command: redis-server --bind 0.0.0.0 --save "" --maxmemory 48mb
    mem_limit: 64m

  rabbitmq:
    <<: *limits
    image: rabbitmq:3.13-alpine@sha256:d7af1c87c5f1eda13fcfca06db452bf3aeab6619fc3358b68535c0c02c4e52bc
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "check_running"]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 5s
    mem_limit: 256m

  nuq-postgres:
    <<: *limits
    image: ghcr.io/firecrawl/nuq-postgres@sha256:9b638af78d99873bc0ba2b57c9cbcd01df6ce96efeaa72d36cfbe0f76521e8fc
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d postgres"]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 5s
    mem_limit: 256m

networks:
  backend:
    driver: bridge
`
