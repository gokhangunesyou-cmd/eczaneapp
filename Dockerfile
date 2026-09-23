# syntax=docker/dockerfile:1

# ─── Aşama 1: Derleme (Build) ────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Coolify build argümanları (Vite derleme anında gömer)
ARG VITE_MAP_STYLE_URL
ARG VITE_MAP_DEFAULT_LAT
ARG VITE_MAP_DEFAULT_LNG
ARG VITE_MAP_DEFAULT_ZOOM
ENV VITE_MAP_STYLE_URL=$VITE_MAP_STYLE_URL
ENV VITE_MAP_DEFAULT_LAT=$VITE_MAP_DEFAULT_LAT
ENV VITE_MAP_DEFAULT_LNG=$VITE_MAP_DEFAULT_LNG
ENV VITE_MAP_DEFAULT_ZOOM=$VITE_MAP_DEFAULT_ZOOM

# Bağımlılık dosyalarını kopyala ve yükle
COPY package.json package-lock.json ./
RUN npm ci

# Kaynak kodları kopyala ve Vite ile derle
COPY . .
RUN npm run build

# ─── Aşama 2: Çalıştırma (Runner) ───────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/nobetci.sqlite

# Yalnızca prodüksiyon için gereken paketleri yükle
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Derlenmiş istemci varlıklarını ve sunucu kodlarını kopyala
COPY --from=builder /app/dist/client ./dist/client
COPY tsconfig*.json ./
COPY src/ ./src/
COPY migrations/ ./migrations/
COPY scripts/ ./scripts/
COPY contracts/ ./contracts/

# SQLite veritabanı için kalıcı dizin oluştur
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "start"]
