.PHONY: install api web test build
install:
	go mod download
	cd web && npm ci
api:
	go run ./cmd/policy serve
web:
	cd web && npm run dev
test:
	go test -race ./...
	cd web && npm run typecheck
	cd web && npm test
build:
	mkdir -p bin
	go build -o bin/policy ./cmd/policy
	cd web && npm run build
