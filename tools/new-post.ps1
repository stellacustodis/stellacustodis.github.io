#!/bin/bash

# Jekyll 블로그 새 포스트 생성 스크립트

# 함수: 도움말 출력
show_help() {
    echo "❌ 제목을 입력해주세요."
    echo "사용법: ./tools/new-post.sh '논문 제목' [YYYY-MM-DD]"
    echo "예시: ./tools/new-post.sh 'Self-Supervised Flow Matching' '2026-03-21'"
}

# 인자 확인
if [ -z "$1" ]; then
    show_help
    exit 1
fi

TITLE="$1"
DATE="${2:-$(date +%Y-%m-%d)}"

# URL 친화적 제목 생성 (소문자 + 스페이스를 하이픈으로)
URL_TITLE=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9가-힣-]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//'  )

POST_FILENAME="${DATE}-${URL_TITLE}.md"
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$SCRIPT_DIR" && pwd)"

POST_PATH="$REPO_ROOT/../_posts/$POST_FILENAME"
IMG_FOLDER_PATH="$REPO_ROOT/../assets/img/posts/$URL_TITLE"
MATH_FOLDER_PATH="$REPO_ROOT/../_includes/_math"

# 파일 중복 확인
if [ -f "$POST_PATH" ]; then
    echo "❌ 이미 존재하는 파일입니다: $POST_FILENAME"
    exit 1
fi

# 필요한 폴더 생성
mkdir -p "$IMG_FOLDER_PATH" 2>/dev/null && echo "📁 폴더 생성: assets/img/posts/$URL_TITLE"
mkdir -p "$MATH_FOLDER_PATH" 2>/dev/null && echo "📁 폴더 생성: _includes/_math"

# 마크다운 템플릿 생성
cat > "$POST_PATH" << EOF
---
title: "[논문 리뷰] $TITLE"
date: $DATE 21:00:00 +0900
layout: post
permalink: /posts/$URL_TITLE/
categories:
  - deeplearning/paper-reading

tags: [paper review, TODO]
paper:
  authors: "TODO"
  venue: "TODO"
  arxiv: "TODO"
  code: "TODO"
---

### My Insight


### 1. Introduction


### 2. Related Work


### 3. Method


### 4. Experiments


### 5. Results


### [Reviewer's Note / Discussion]

EOF

if [ $? -eq 0 ]; then
    echo "✅ 포스트 생성: _posts/$POST_FILENAME"
    echo ""
    echo "다음 구조가 생성되었습니다:"
    echo "  📄 _posts/$POST_FILENAME"
    echo "  📁 assets/img/posts/$URL_TITLE"
    echo "  📝 이미지는 위 폴더에 저장하세요"
    echo "  📐 복잡한 수식은 _includes/_math 에 저장하세요"
else
    echo "❌ 포스트 생성 실패"
    exit 1
fi
