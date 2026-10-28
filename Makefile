.PHONY: test coverage coverage-backend coverage-frontend docker-build docker-run

IMAGE ?= full-stack-calculator

## test: run the backend and frontend unit tests
test:
	cd backend && go test ./...
	cd frontend && pnpm test

## coverage: run all tests and write coverage reports for both halves
coverage: coverage-backend coverage-frontend
	@echo
	@echo "Backend report:  backend/coverage.html"
	@echo "Frontend report: frontend/coverage/index.html"

coverage-backend:
	cd backend && go test -coverprofile=coverage.out ./... \
		&& go tool cover -func=coverage.out | tail -1 \
		&& go tool cover -html=coverage.out -o coverage.html

coverage-frontend:
	cd frontend && pnpm coverage

## docker-build: build the image that runs frontend and backend together
docker-build:
	docker build -t $(IMAGE) .

## docker-run: run it on http://localhost:8080
docker-run:
	docker run --rm -p 8080:8080 $(IMAGE)
