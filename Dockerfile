# Builds the frontend and the backend, then runs both from one small image:
# the Go server answers /api/ and serves the frontend's static files for everything else.

# --- Frontend: static files in /app/dist ---
FROM node:22-alpine AS frontend
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# --- Backend: a static binary ---
FROM golang:1.24-alpine AS backend
WORKDIR /src
COPY backend/go.mod ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# --- Runtime ---
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend /out/server /server
COPY --from=frontend /app/dist /www
ENV PORT=8080 STATIC_DIR=/www
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/server"]
