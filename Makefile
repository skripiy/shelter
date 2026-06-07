# ================================================================
# SHELTER ACCORD — Makefile
# Спрощує типові операції для локальної розробки і продакшну.
# ================================================================

.PHONY: help up down logs restart build migrate status \
        deploy prod-up prod-down backup cert

# ── Параметри ────────────────────────────────────────────────────
COMPOSE      := docker compose -f docker-compose.yml
COMPOSE_PROD := docker compose -f docker-compose.yml -f docker-compose.prod.yml
DB_CONTAINER := shelter-db

# ── Довідка ──────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Shelter Accord — команди"
	@echo ""
	@echo "  Розробка:"
	@echo "    make up          — запустити весь стек (dev)"
	@echo "    make down        — зупинити стек"
	@echo "    make restart     — перезапустити"
	@echo "    make logs        — показати логи (усіх сервісів)"
	@echo "    make logs s=web  — логи конкретного сервісу"
	@echo "    make status      — статус контейнерів"
	@echo "    make migrate     — застосувати нові міграції (migrator)"
	@echo "    make build       — перезбирати web + admin (без restart)"
	@echo ""
	@echo "  Продакшн:"
	@echo "    make prod-up     — запустити в продакшн-режимі"
	@echo "    make prod-down   — зупинити продакшн"
	@echo "    make deploy      — git pull + rebuild (на сервері)"
	@echo "    make cert        — отримати/оновити SSL сертифікат"
	@echo "    make backup      — зберегти дамп БД у ./backups/"
	@echo ""

# ── Локальна розробка ─────────────────────────────────────────────
up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f $(s)

status:
	$(COMPOSE) ps

build:
	$(COMPOSE) build web admin

migrate:
	$(COMPOSE) up -d migrator
	@echo "📋 Logs from migrator:"
	$(COMPOSE) logs migrator

# ── Продакшн ─────────────────────────────────────────────────────
prod-up:
	$(COMPOSE_PROD) up -d --build

prod-down:
	$(COMPOSE_PROD) down

# На сервері: git pull + rebuild
deploy:
	git pull origin main
	$(COMPOSE_PROD) up -d --build --remove-orphans
	docker image prune -f --filter "until=24h"
	@echo "✅ Deploy complete"

# Отримати SSL сертифікат (перший раз або оновити вручну)
# Використання: make cert DOMAIN=yourdomain.com EMAIL=you@email.com
cert:
	$(COMPOSE_PROD) run --rm certbot certonly \
		--webroot --webroot-path=/var/www/certbot \
		-d $(DOMAIN) -d www.$(DOMAIN) \
		--email $(EMAIL) --agree-tos --non-interactive
	$(COMPOSE_PROD) exec nginx-proxy nginx -s reload

# ── База даних ────────────────────────────────────────────────────
backup:
	@mkdir -p ./backups
	@FILENAME="backups/shelter-$$(date +%Y%m%d-%H%M%S).sql.gz"; \
	docker exec $(DB_CONTAINER) pg_dump -U postgres postgres | gzip > $$FILENAME; \
	echo "✅ Backup saved: $$FILENAME"

# Відновлення: make restore FILE=backups/shelter-20250101-120000.sql.gz
restore:
	@if [ -z "$(FILE)" ]; then echo "Usage: make restore FILE=path/to/backup.sql.gz"; exit 1; fi
	gunzip -c $(FILE) | docker exec -i $(DB_CONTAINER) psql -U postgres postgres
	@echo "✅ Restored from $(FILE)"

# SQL консоль
db:
	docker exec -it $(DB_CONTAINER) psql -U postgres -d postgres
