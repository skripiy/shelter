# ☢️ Shelter Accord

> **Хто потрапить у бункер?**  
> Мультиплеєрна браузерна гра на виживання. Катастрофа знищила світ —
> місць в укритті менше, ніж гравців. Кожен раунд розкриває картку свого
> персонажа і голосує за вигнання суперника.

🌐 **[shelter.basecorp.net](https://shelter.basecorp.net)**

![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178c6?logo=typescript&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-51-000020?logo=expo)
![Supabase](https://img.shields.io/badge/Supabase-self--hosted-3ecf8e?logo=supabase)
![Docker](https://img.shields.io/badge/Docker-compose-2496ed?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Як грати

1. Хост створює кімнату → ділиться 6-значним кодом з друзями
2. Гравці приєднуються з будь-якого браузера — **без реєстрації**
3. Можна додати ботів зі своїми особистостями (параноїк, демагог, логік…)
4. Щороку раунд: розкрий **одну картку** → проголосуй за вигнання → хтось вибуває
5. Гра закінчується коли вцілілих ≤ місткості укриття
6. Генерується унікальний **епілог** на основі карток переможців та катастрофи

---

## Стек

| Шар | Технологія |
|-----|-----------|
| Гра (web) | Expo 51 · React Native Web · Expo Router |
| API / Auth / Realtime | Supabase self-hosted (PostgREST · GoTrue · Realtime) |
| База даних | PostgreSQL 15 |
| Адмін-панель | Next.js 14 + React Admin |
| Спільна логіка | `@shelter-accord/core` (TypeScript монорепо) |
| Інфраструктура | Docker Compose · Kong API Gateway · nginx |
| CI/CD | GitHub Actions → SSH deploy |

---

## Контент

- **20 катастроф**: ядерна зима, пандемія, ШІ-повстання, мегацунамі, фінансовий колапс…
- **12 укриттів**: від бункера (capacity 3) до підземного ТЦ (capacity 8)
- **14 ботів** з різними стилями голосування
- **107 карток** у 6 категоріях: Професія, Здоров'я, Характер, Фізичні дані, Навички, Багаж

---

## Запуск локально

```bash
git clone https://github.com/skripiy/shelter.git
cd shelter
cp .env.example .env      # відредагуйте паролі та JWT-ключі
docker compose up -d --build
```

| Сервіс | URL |
|--------|-----|
| 🎮 Гра | http://localhost:3000 |
| 🛠️ Адмін-панель | http://localhost:3001 |
| 🔌 Supabase API | http://localhost:8000 |
| 📊 Supabase Studio | http://localhost:3333 |

Детальні інструкції: [SETUP.md](./SETUP.md)

---

## Структура монорепо

```
shelter/
├── apps/
│   ├── mobile/       # Expo web (гра, порт 3000)
│   └── admin/        # Next.js адмін-панель (порт 3001)
├── packages/
│   └── core/         # Спільні типи та логіка
├── supabase/
│   └── migrations/   # 012 SQL-міграцій (схема + seed + ігрова логіка)
├── docker/           # Kong, nginx конфіги
├── scripts/          # gen-icons.mjs та інші утиліти
├── docker-compose.yml
├── docker-compose.prod.yml
├── Makefile
├── SETUP.md
└── DEPLOY.md
```

---

## Деплой на власний сервер

Повна інструкція: [DEPLOY.md](./DEPLOY.md)

```bash
# На VPS з Ubuntu 22.04:
git clone https://github.com/skripiy/shelter.git /opt/shelter
cd /opt/shelter && cp .env.example .env
# Відредагуйте .env (домен, паролі, JWT-ключі)
make prod-up
make cert DOMAIN=yourdomain.com EMAIL=you@example.com
```

GitHub Actions автоматично деплоїть при `git push main` → [.github/workflows/deploy.yml](./.github/workflows/deploy.yml)

---

## Ліцензія

MIT
