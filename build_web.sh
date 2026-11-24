#!/bin/bash
# Flutter 웹 앱을 빌드해서 backend/public 에 넣는 스크립트
# 사용법: ./build_web.sh   (semi 폴더에서 실행)
set -e
cd "$(dirname "$0")"
flutter build web --release --dart-define=API_SAME_ORIGIN=true
rm -rf backend/public
cp -r build/web backend/public
echo "✅ 완료: backend/public 에 웹 앱이 들어갔어요. git add/commit/push 후 서버에서 git pull 하세요."
