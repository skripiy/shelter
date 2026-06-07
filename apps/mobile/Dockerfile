# Build context = repo root (see docker-compose.yml web.build.context: .)
FROM node:20-alpine AS builder
WORKDIR /app

ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY

ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL
ENV EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY

RUN apk add --no-cache git

# Install workspace deps. Copy manifests first for better layer caching.
COPY package.json ./
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm install

# Copy the rest of the monorepo and export the web build
COPY . .
WORKDIR /app/apps/mobile
RUN npx expo export --platform web

# ─── Serve with nginx ──────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/apps/mobile/dist /usr/share/nginx/html
COPY apps/mobile/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
