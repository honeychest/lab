#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${ROOT_DIR}/../springboot"

echo "Pulling latest frontend image from registry..."
docker compose pull frontend

echo "Restarting frontend container..."
docker compose up -d frontend

echo "Cleanup dangling images..."
docker image prune -f

echo "Frontend deployed."
