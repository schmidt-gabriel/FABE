# Two images from one file:
#
#   --target dev  -> Vite dev server with hot reload (used by docker-compose)
#   (default)     -> static build served by nginx, ~50MB instead of ~630MB
#
# Both listen on 5173 and proxy /api and /_ to $BACKEND_URL, so the deployment
# contract (docker-compose, k8s.yaml) is the same either way.

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- dev ----
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# ---- build ----
FROM deps AS build
COPY . .
# "build" runs tsc --noEmit first, so a type error fails the image build.
RUN npm run build

# ---- runtime ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# Substituted into the config by the nginx entrypoint at startup.
ENV BACKEND_URL=http://backend:8090
EXPOSE 5173
