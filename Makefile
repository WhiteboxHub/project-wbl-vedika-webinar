.PHONY: help install dev build test lint clean docker-up docker-down docker-logs

help:
	@echo "Available commands:"
	@echo "  make install      - Install dependencies"
	@echo "  make dev          - Start all services in dev mode"
	@echo "  make build        - Build all packages"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linters"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make docker-up    - Start Docker services"
	@echo "  make docker-down  - Stop Docker services"
	@echo "  make docker-logs  - Show Docker logs"

install:
	pnpm install

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

clean:
	pnpm clean

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f
