#!/bin/bash
# .secret_key 파일이 있는지 확인하고 로드합니다.
if [ -f "$HOME/.secret_key" ]; then
    source "$HOME/.secret_key" || { echo "Error: Failed to source .secret_key"; exit 1; }
    if [ -z "$JASYPT_ENCRYPTOR_PASSWORD" ]; then
        echo "Error: JASYPT_ENCRYPTOR_PASSWORD is not set!"
        exit 1
    fi
    echo "Master key loaded from .secret_key"
else
    echo "Error: .secret_key file not found! Please check your home directory."
    exit 1
fi

# 1. 이미지 백업
echo "Step 1: Backing up current image..."
docker tag chsproject-docker:latest chsproject-docker:old

# 2. 소스 업데이트 및 빌드
echo "Step 2: Pulling source and Building JAR..."
git fetch --all
git reset --hard origin/main  # 1. 내용 강제 동기화 (충돌 방지)
chmod +x ./gradlew            # 2. 실행 권한 부여 (Permission denied 방지)
./gradlew clean build -x test || { echo "Build failed!"; exit 1; }
# 로그좀 복사해놓고 >>사용해서(append)  일별로 해서 저장
docker logs chs-app-1 >> ./dockerlogs/app1_$(date +%Y%m%d).log
docker logs chs-app-2 >> ./dockerlogs/app2_$(date +%Y%m%d).log
# 3. 새 이미지 빌드
echo "Step 3: Building new Docker image..."
docker build -t chsproject-docker:latest .

# 4. app1 배포
echo "Step 4: Updating app1..."
docker compose up -d app1

# 5. app1 Health Check
echo "Step 5: Waiting for app1..."
for i in {1..20}; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/actuator/health || echo "000")
  if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "App1 is UP! (Status: 200)"
    break
  fi
  echo "Waiting... (Status: $HTTP_STATUS) - Attempt $i"
  if [ $i -eq 20 ]; then
    echo "App1 failed to start. Stopping deployment."
    exit 1
  fi
  sleep 3
done

# 6. app2 배포
echo "Step 6: Updating app2..."
docker compose up -d app2

# 7. app2 Health Check
echo "Step 7: Waiting for app2..."
for i in {1..20}; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/actuator/health || echo "000")
  if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "App2 is UP! (Status: 200)"
    break
  fi
  echo "Waiting... (Status: $HTTP_STATUS) - Attempt $i"
  if [ $i -eq 20 ]; then
    echo "App2 failed to start."
    exit 1
  fi
  sleep 3
done

# 8. 찌꺼기 정리
docker image prune -f

echo "Deployment Finished Successfully!"