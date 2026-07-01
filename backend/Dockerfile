# ---- build stage ----
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# modernc/sqlite is pure Go, so CGO can stay disabled.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/fin .

# ---- runtime stage ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
ENV TZ=America/Sao_Paulo
WORKDIR /app
COPY --from=build /out/fin /app/fin
EXPOSE 8090
# PocketBase auto-applies pending Go migrations on startup.
CMD ["/app/fin", "serve", "--http=0.0.0.0:8090"]
