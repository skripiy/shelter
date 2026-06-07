# Shelter Accord — Запуск

## Перший старт

### 1. Налаштування змінних середовища
```bash
cp .env.example .env
```

Відредагуйте `.env` — обов'язково змініть:
- `POSTGRES_PASSWORD` — будь-який надійний пароль
- `JWT_SECRET` — мінімум 32 символи (згенеруйте: `openssl rand -base64 32`)
- `ANON_KEY` і `SERVICE_ROLE_KEY` — JWT-токени

**Генерація ANON_KEY і SERVICE_ROLE_KEY:**
Зайдіть на https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
або використайте онлайн-інструмент jwt.io з payload:
```json
// ANON_KEY payload:
{ "role": "anon", "iss": "supabase", "iat": 1713000000, "exp": 2028000000 }

// SERVICE_ROLE_KEY payload:
{ "role": "service_role", "iss": "supabase", "iat": 1713000000, "exp": 2028000000 }
```

### 2. Запуск усього стека (одна команда)
```bash
docker compose up -d --build
```
Сервіс `migrator` (одноразовий) виконує всю пост-ініціалізацію автоматично:
- узгоджує паролі внутрішніх ролей (`supabase_auth_admin`, `authenticator`,
  `supabase_storage_admin`) та створює схему `_realtime`;
- чекає, поки `auth` (GoTrue) створить схему `auth`;
- накатує всі `supabase/migrations/*.sql` по черзі, відстежуючи застосовані в
  таблиці `public.schema_migrations` (тож повторні запуски — безпечні, а нові
  міграції підхоплюються автоматично).

> Дані БД та сторадж лежать у `./.data/` (bind-mount), тож переживають навіть
> `docker compose down -v`. Логи міграції: `docker logs shelter-migrator`.

Щоб додати нову міграцію — просто покладіть файл `00N_*.sql` у
`supabase/migrations/` і виконайте `docker compose up -d migrator` (або
перезапустіть стек).

### 3. Перевірка
- Supabase API: http://localhost:8000
- Supabase Studio: http://localhost:3333
- Адмін-панель: http://localhost:3001
- Веб-додаток: http://localhost:3000

### 4. Перший вхід в адмін-панель
Через Supabase Studio (http://localhost:3333) або SQL:
```sql
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, role)
VALUES (
  'admin@shelter-accord.com',
  crypt('your-password', gen_salt('bf')),
  NOW(),
  'authenticated'
);
```

Або через Supabase Auth API:
```bash
curl -X POST http://localhost:8000/auth/v1/signup \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@shelter-accord.com","password":"your-password"}'
```

## Локальна розробка (без Docker)

### Потрібно: Node 20+, npx supabase CLI

```bash
# Встановити залежності
npm install

# Запустити Supabase локально
npx supabase start

# Запустити адмінку
cd apps/admin && npm run dev

# Запустити мобільний додаток
cd apps/mobile && npm run web
```

## Структура проекту
```
shelter-accord/
├── apps/
│   ├── admin/        # Next.js + React Admin (порт 3001)
│   └── mobile/       # Expo (iOS + Android + Web, порт 3000)
├── packages/
│   └── core/         # Спільна логіка та типи
├── supabase/
│   └── migrations/   # SQL схема + seed-дані
├── docker/
│   └── kong.yml      # API Gateway конфіг
└── docker-compose.yml
```

## Адмін-панель — розділи
| Розділ | Опис |
|--------|------|
| 🏚️ Дашборд | Статистика ігор, графік катастроф |
| ☢️ Катастрофи | CRUD катастроф з рівнями небезпеки |
| 🗂️ Категорії карток | Управління категоріями (Професія, Здоров'я, ...) |
| 🃏 Картки | Повний CRUD карток з вагою та ефектом |
| 🏚️ Укриття | Шаблони укриттів з ресурсами |
| 🤖 Боти | Особистості ботів та шаблони фраз |
| 🎮 Ігрові сесії | Моніторинг активних та завершених ігор |
