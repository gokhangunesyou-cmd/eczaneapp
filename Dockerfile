# syntax=docker/dockerfile:1

# ─── Aşama 1: Derleme (Build) ────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

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
