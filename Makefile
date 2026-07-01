.PHONY: up down logs rebuild backend frontend test admin

## Docker (local stack)
up:            ## start backend + frontend
	docker compose up --build -d

down:          ## stop the stack
	docker compose down

logs:
	docker compose logs -f

rebuild:
	docker compose build --no-cache

## Local development (without Docker)
backend:       ## run PocketBase locally on :8090
	cd backend && go run . serve --http=127.0.0.1:8090

frontend:      ## run Vite locally on :5173
	cd frontend && npm install && npm run dev

test:          ## backend tests
	cd backend && go test ./...

admin:         ## create the owner user (usage: make admin EMAIL=.. PASS=..)
	cd backend && go run . superuser create $(EMAIL) $(PASS)
