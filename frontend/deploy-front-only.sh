#!/bin/bash
set -euo pipefail

echo "📦 Frontend 정적 배포 시작"

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
NGINX_BASE="/Users/honey/devcontext/docker-volumes/nginx"
RELEASES_DIR="${NGINX_BASE}/releases"
DIST_LINK="${NGINX_BASE}/dist"
PREVIOUS_LINK="${NGINX_BASE}/previous"
KEEP_RELEASES=5

cd "${ROOT_DIR}"

echo "🔨 빌드 중..."
npm run build

if [ ! -d "${ROOT_DIR}/dist" ]; then
  echo "❌ 빌드 결과물(dist)을 찾지 못했습니다."
  exit 1
fi

mkdir -p "${RELEASES_DIR}"
TS="$(date +%Y%m%d_%H%M%S)"
NEW_RELEASE="${RELEASES_DIR}/${TS}"
mkdir -p "${NEW_RELEASE}"

echo "📂 새 릴리즈로 결과물 복사: ${NEW_RELEASE}"
rsync -a --delete "${ROOT_DIR}/dist/" "${NEW_RELEASE}/"

CURRENT_TARGET="$(readlink -f "${DIST_LINK}" 2>/dev/null || true)"
if [ -n "${CURRENT_TARGET}" ] && [ "${CURRENT_TARGET}" != "${NEW_RELEASE}" ]; then
  ln -sfn "${CURRENT_TARGET}" "${PREVIOUS_LINK}"
fi

ln -sfn "releases/${TS}" "${DIST_LINK}"

echo "🧹 오래된 릴리즈 정리 (최신 ${KEEP_RELEASES}개 유지, current/previous 보존)"
CURRENT_RELEASE="$(readlink -f "${DIST_LINK}" 2>/dev/null || true)"
PREVIOUS_RELEASE="$(readlink -f "${PREVIOUS_LINK}" 2>/dev/null || true)"
while IFS= read -r release; do
  if [ "${release}" = "${CURRENT_RELEASE}" ] || [ "${release}" = "${PREVIOUS_RELEASE}" ]; then
    continue
  fi
  rm -rf "${release}"
done < <(ls -1dt "${RELEASES_DIR}"/* 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)))

echo "✅ 배포 완료"
echo "현재 dist -> $(readlink -f "${DIST_LINK}")"
if [ -L "${PREVIOUS_LINK}" ]; then
  echo "이전 previous -> $(readlink -f "${PREVIOUS_LINK}")"
fi
