#!/bin/bash
echo "📦 Frontend 빌드 프로세스를 시작합니다..."
# 최신 코드 받기
git pull origin main

# 새로운 패키지 있으면 받아야 함
npm install 

# 기존 빌드 결과물 제거
sudo rm -rf dist/

# 빌드
npm run build

echo "✨ Frontend 빌드 완료! (Nginx가 dist/ 를 바로 서빙합니다)"
