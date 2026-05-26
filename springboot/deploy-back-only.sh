#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/dockerlogs"
APP1_HEALTH_URL="http://localhost:8080/actuator/health"
APP2_HEALTH_URL="http://localhost:8081/actuator/health"
HEALTH_CHECK_RETRIES=50
HEALTH_CHECK_INTERVAL=3

health_code() {
  local url="$1"
  curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000"
}

save_app_logs() {
  mkdir -p "$LOG_DIR"
  docker logs chs-app-1 >> "$LOG_DIR/app1_$(date +%Y%m%d).log" 2>&1 || true
  docker logs chs-app-2 >> "$LOG_DIR/app2_$(date +%Y%m%d).log" 2>&1 || true
}

deploy_one() {
  local app="$1"
  local health_url="$2"

  docker compose stop "$app"
  docker compose up -d "$app"

  for _ in $(seq 1 $HEALTH_CHECK_RETRIES); do
    if [ "$(health_code "$health_url")" = "200" ]; then
      echo "$app is healthy."
      return 0
    fi
    sleep "$HEALTH_CHECK_INTERVAL"
  done
  echo "Error: $app failed health check."
  return 1
}

main() {
  echo "[Step 1] Pull latest image from registry..."
  docker compose pull app1 app2

  echo "[Step 2] Save existing app logs..."
  save_app_logs

  echo "[Step 3] Deploy..."
  deploy_one "app1" "$APP1_HEALTH_URL"
  deploy_one "app2" "$APP2_HEALTH_URL"

  echo "[Step 4] Cleanup dangling images..."
  docker image prune -f

  echo "Deployment completed successfully."
}

main "$@"
