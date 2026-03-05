#!/bin/bash
echo "CRITICAL: Rolling back to 'old' version..."

# 1. old 이미지 존재 여부 확인
if ! docker image inspect chsproject-docker:old > /dev/null 2>&1; then
  echo "ERROR: No 'old' image found. Cannot rollback."
  exit 1
fi

# 2. 백업 이미지를 latest로 복구
docker tag chsproject-docker:old chsproject-docker:latest

# 3. app1 총력 기동
echo "Starting app1 (priority)..."
sudo -E docker-compose up -d app1

# 4. app1 완전히 뜰 때까지 대기
for i in {1..30}; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/actuator/health || echo "000")
  if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "App1 is UP!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "WARNING: App1 not responding, but continuing with app2..."
  fi
  sleep 2
done

# 5. app2 기동
echo "Starting app2..."
sudo -E docker-compose up -d app2

echo "Rollback completed."

# 6. Nginx 상태 초기화 (upstream 사용시 계속 죽은걸로 오인할 수 있으므로 초기화)
sudo systemctl reload nginx

echo "Rollback completed."