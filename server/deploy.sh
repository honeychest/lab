#!/bin/bash

# 1. 경로 설정
FRONT_PATH="/home/ubuntu/project/home/frontend"
BACK_PATH="/home/ubuntu/project/home/springboot"

echo "🚀 배포 프로세스를 시작합니다..."
# 구조 변경으로 남은 쓰레기 파일/폴더 싹 청소
# 2. 프론트엔드 빌드
echo "📦 Step 1: Frontend 빌드 중..."
cd $FRONT_PATH
git pull origin main
git clean -fd
# 기존 빌드 결과물을 확실히 제거해서 꼬임을 방지합니다.
sudo rm -rf dist/
npm run build

# 3. 스프링 빌드 (서버를 죽이지 않고 먼저 빌드합니다!)
echo "☕ Step 3: 새 버전 빌드 중... (기존 서버는 아직 살아있습니다)"
cd $BACK_PATH
# 테스트를 건너뛰어 포트 충돌을 방지합니다.
# ./gradlew build -x test 이전코드
# 강제로 클린
./gradlew --stop
sudo rm -rf build
./gradlew build -x test --no-daemon --stacktrace

# 4. 이제서야 교체 작업 (다운타임 시작)
echo "🔍 Step 4: 교체 직전! 기존 서버 종료..."

# 1. PID 찾기 (8080 포트 기준)
PID=$(sudo lsof -t -i:8080)

if [ -z "$PID" ]; then
    echo "실행 중인 서버가 없습니다."
else
    echo "서버 종료 중 (PID: $PID)..."
    sudo kill -15 $PID
    # 최대 10초간 프로세스 종료 여부 확인
    for i in {1..10}; do
        if ! ps -p $PID > /dev/null; then
            echo "서버가 정상 종료되었습니다."
            break
        fi
        sleep 1
        # 10초가 지나도 안 죽으면 강제 종료
        if [ $i -eq 10 ]; then
            echo "정상 종료되지 않아 강제 종료(kill -9)를 실행합니다."
            sudo kill -9 $PID
        fi
    done
fi

# 5. 정적 파일 교차 복사 및 실행 (가장 빠른 교체)
echo "🧹 Step 5: 정적 파일 교체 및 실행!"
sudo rm -rf $BACK_PATH/src/main/resources/static/*
# sudo cp -r $FRONT_PATH/dist/* $BACK_PATH/src/main/resources/static/ nginx 도입으로 인한 삭제

# 연월일시분초까지 나오게 (260225_020454 형식)
NOW=$(date +%y%m%d)
nohup java -Xms128m -Xmx384m -XX:+UseSerialGC \
-jar $BACK_PATH/build/libs/*.jar > "log${NOW}.log" 2>&1 &
# sudo -E nohup env JAVA_OPTS="-Xms128m -Xmx384m -XX:+UseSerialGC" ./gradlew bootRun --no-daemon > "log${NOW}.log" 2>&1 &


echo "✨ 배포 완료! (다운타임 10초 이내)"
tail -f "log${NOW}.log"
