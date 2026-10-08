// Careerloom's own SearXNG (AGPL-3.0, run unmodified as a separate Docker Compose project) for knowledge-base web search:
// loopback-only port, image pinned by digest, JSON output on, limiter off (the bot limiter needs Redis and blocks API use).
// Run as: docker compose -p careerloom-searxng -f - up -d  (this file on stdin)
import crypto from 'node:crypto'

export const SEARXNG_PROJECT = 'careerloom-searxng'
export const SEARXNG_PORT = 8888
export const SEARXNG_IMAGE = 'searxng/searxng:2026.10.7-6671d89be@sha256:cc026dbee25b864d7f9731957cd5ef36ba2e2d61abd2996d57f1b863483e7409'

/** settings.yml: defaults plus what an API client needs. `secret` is generated once per install and kept. */
export const searxngSettings = (secret: string): string => `use_default_settings: true
server:
  secret_key: "${secret}"
  limiter: false
  image_proxy: false
search:
  formats: [html, json]
`

export const newSearxngSecret = (): string => crypto.randomBytes(32).toString('hex')

/** `dir` is the host folder holding settings.yml (mounted at /etc/searxng). Long volume syntax: a Windows path has a colon. */
export const searxngCompose = (dir: string): string => `
services:
  searxng:
    image: ${SEARXNG_IMAGE}
    ports: ["127.0.0.1:${SEARXNG_PORT}:8080"]
    volumes:
      - type: bind
        source: ${JSON.stringify(dir)}
        target: /etc/searxng
    environment:
      SEARXNG_BASE_URL: http://127.0.0.1:${SEARXNG_PORT}/
    cap_drop: [ALL]
    cap_add: [CHOWN, SETGID, SETUID]
    security_opt: ["no-new-privileges:true"]
    logging:
      driver: json-file
      options: { max-size: "5m", max-file: "2" }
    mem_limit: 512m
    restart: "no"
`
