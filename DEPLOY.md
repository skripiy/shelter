# Shelter Accord — Production Deployment Guide

## Архітектура продакшну

```
Internet
   │
   ▼
nginx-proxy :80/:443  (SSL termination, Let's Encrypt)
   │
   ├─── /           → shelter-web    :80  (Expo SPA, nginx)
   ├─── /supabase/* → shelter-kong   :8000 (Supabase API)
   └─── /admin/*    → shelter-admin  :3000 (Next.js)

Внутрішня мережа Docker:
   shelter-kong → shelter-rest (PostgREST)
               → shelter-auth (GoTrue)
               → shelter-realtime
               → shelter-storage
               → shelter-db (Postgres 15)
```

---

## Покрокове розгортання

### 1. Підготовка сервера

**Мінімальні вимоги:** Ubuntu 22.04+, 2 vCPU, 4 GB RAM, 30 GB SSD

```bash
# Встановити Docker та Git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Встановити Make (для зручних команд)
sudo apt install make -y
```

### 2. Клонування репозиторію

```bash
git clone https://github.com/YOUR_USERNAME/shelter-accord.git
cd shelter-accord
```

### 3. Налаштування змінних середовища

```bash
cp .env.example .env
nano .env
```

**Обов'язково змінити:**
- `POSTGRES_PASSWORD` — надійний пароль БД
- `JWT_SECRET` → `openssl rand -base64 32`
- `ANON_KEY` та `SERVICE_ROLE_KEY` — згенеруйте JWT-токени
- `DOMAIN` → ваш домен (напр. `shelter-accord.yourdomain.com`)
- `EXPO_PUBLIC_SUPABASE_URL` → `https://yourdomain.com/supabase`
- `NEXT_PUBLIC_SUPABASE_URL` → `https://yourdomain.com/supabase`

**Генерація ANON_KEY/SERVICE_ROLE_KEY:**
```bash
# Встановіть jwt-cli або скористайтесь jwt.io
# Payload для ANON_KEY:
# {"role":"anon","iss":"supabase","iat":1713000000,"exp":2028000000}
# Payload для SERVICE_ROLE_KEY:
# {"role":"service_role","iss":"supabase","iat":1713000000,"exp":2028000000}
```

### 4. Перший запуск (без SSL)

```bash
# Тимчасово запустіть з HTTP для отримання сертифікату
make up
```

Переконайтесь що `http://yourdomain.com` відкривається (потрібно для certbot).

### 5. Отримання SSL сертифікату

```bash
# Зупиніть dev-стек
make down

# Запустіть продакшн-стек (nginx слухає порт 80 для ACME challenge)
make prod-up

# Отримайте сертифікат
make cert DOMAIN=yourdomain.com EMAIL=your@email.com
```

### 6. Продакшн запуск

```bash
make prod-up
```

**Перевірка:**
- `https://yourdomain.com` — гра
- `https://yourdomain.com/admin` — адмін-панель
- `https://yourdomain.com/supabase` — Supabase API

---

## GitHub Actions (автоматичний деплой)

### Налаштування секретів у GitHub

Перейдіть: `Settings → Secrets → Actions → New repository secret`

| Secret | Значення |
|--------|----------|
| `SSH_HOST` | IP або hostname вашого сервера |
| `SSH_USER` | Unix-користувач (напр. `ubuntu`) |
| `SSH_PRIVATE_KEY` | Приватний SSH ключ (повний вміст `~/.ssh/id_rsa`) |
| `SSH_PORT` | SSH порт (за замовчуванням `22`) |
| `DEPLOY_PATH` | Шлях до проекту на сервері (напр. `/home/ubuntu/shelter-accord`) |

**Генерація SSH ключа для деплою:**
```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/shelter_deploy
cat ~/.ssh/shelter_deploy.pub >> ~/.ssh/authorized_keys  # на сервері
# Вміст ~/.ssh/shelter_deploy (приватний) → GitHub Secret SSH_PRIVATE_KEY
```

### Після налаштування

Кожен `git push` в гілку `main` автоматично:
1. Підключається по SSH до сервера
2. Виконує `git pull`
3. Перезбирає Docker-образи
4. Застосовує нові міграції (через `migrator`)
5. Перезапускає контейнери

---

## Корисні команди

```bash
make status          # Статус всіх контейнерів
make logs            # Всі логи
make logs s=web      # Логи web-додатку
make logs s=kong     # Логи API gateway
make backup          # Дамп БД в ./backups/
make db              # Консоль PostgreSQL

# Оновити тільки Expo web (швидко, без перебудови БД)
docker compose build web && docker compose up -d web

# Застосувати нову міграцію вручну
docker exec -i shelter-db psql -U postgres -d postgres < supabase/migrations/013_new.sql
```

---

## Оновлення SSL сертифікату

Certbot оновлює сертифікати автоматично якщо контейнер запущений. Для примусового оновлення:

```bash
make cert DOMAIN=yourdomain.com EMAIL=your@email.com
```

---

## Резервне копіювання

```bash
# Щоденний backup через cron (додайте на сервер)
0 3 * * * cd /path/to/shelter-accord && make backup

# Відновлення з бекапу
make restore FILE=backups/shelter-20250601-030000.sql.gz
```

---

## Troubleshooting

**Контейнер не піднімається:**
```bash
docker compose logs [service-name]
```

**База даних не підключається:**
```bash
docker exec shelter-db pg_isready -U postgres
```

**Міграції не застосовуються:**
```bash
docker compose up -d migrator
docker compose logs migrator
```

**Nginx не перезапускається після нового сертифікату:**
```bash
docker compose exec nginx-proxy nginx -s reload
```
