FROM python:3.11-slim

  # Node.js LTS 설치 + korean-law-mcp 전역 설치
  RUN apt-get update && apt-get install -y curl && \
      curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
      apt-get install -y nodejs && \
      npm install -g korean-law-mcp && \
      apt-get clean && rm -rf /var/lib/apt/lists/*

  WORKDIR /app

  COPY requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt

  COPY . .

  CMD ["python", "main.py"]