git pull
sudo rm -rf /home/ubuntu/project/home/springboot/build
# 3. 빌드 시작
./gradlew clean build -x test
# JAR 재생성
#./gradlew build -x test --no-daemon
# Docker 이미지 다시 굽기 (수정된 JAR를 이미지에 넣기)
sudo docker build -t chsproject-docker .
# docker-compose down을 하면 기존 컨테이너가 삭제되고, up을 할 때 방금 만든 새 이미지를 자동으로 사용합니다. 이때 보안 비밀번호(-E) 잊지 마세요!
sudo docker-compose down
# sudo -E docker-compose build
sudo -E docker-compose up -d app1
echo "chs-app-1 이 뜰 때까지 20초 대기 중..."
sleep 20
# 3. 두 번째 서버 올리기
sudo -E docker-compose up -d app2