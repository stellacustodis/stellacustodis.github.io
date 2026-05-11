#!/bin/bash

# Jekyll 블로그 새 포스트 생성 스크립트
# 사용법: ./tools/new-post.sh '제목' [paper|dev|note] [YYYY-MM-DD]
# 예시:   ./tools/new-post.sh 'PixelDiT' paper
#         ./tools/new-post.sh 'Python 환경 설정' dev 2026-05-02

if [ -z "$1" ]; then
    echo "❌ 제목을 입력해주세요."
    echo "사용법: ./tools/new-post.sh '제목' [paper|dev|note] [YYYY-MM-DD]"
    exit 1
fi

TITLE="$1"
TYPE="${2:-paper}"
DATE="${3:-$(date +%Y-%m-%d)}"

if [[ "$TYPE" != "paper" && "$TYPE" != "dev" && "$TYPE" != "note" ]]; then
    echo "❌ 타입은 paper, dev, note 중 하나여야 합니다."
    exit 1
fi

URL_TITLE=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9가-힣-]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//')

POST_FILENAME="${DATE}-${URL_TITLE}.md"
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

POST_PATH="$REPO_ROOT/_posts/$POST_FILENAME"
IMG_FOLDER_PATH="$REPO_ROOT/assets/img/posts/$URL_TITLE"

if [ -f "$POST_PATH" ]; then
    echo "❌ 이미 존재하는 파일입니다: $POST_FILENAME"
    exit 1
fi

mkdir -p "$IMG_FOLDER_PATH"
mkdir -p "$REPO_ROOT/_includes/_math"

if [ "$TYPE" = "paper" ]; then
cat > "$POST_PATH" << EOF
---
title: "[논문 리뷰] $TITLE"
date: $DATE 21:00:00 +0900
categories:
  - ai/paper-review
tags: [paper review, TODO]
paper:
  authors: "TODO"
  venue:   "TODO"
  arxiv:   "TODO"
  code:    "TODO"
---

<!-- 이미지 경로: /assets/img/posts/$URL_TITLE/<파일명> -->
<!-- 예시: ![fig1](/assets/img/posts/$URL_TITLE/fig1.png) -->

### My Insight


### 1. Introduction


### 2. Related Work


### 3. Method


### 4. Experiments


### 5. Results


### Discussion

EOF

elif [ "$TYPE" = "dev" ]; then
cat > "$POST_PATH" << EOF
---
title: "$TITLE"
date: $DATE 21:00:00 +0900
categories:
  - dev
tags: [TODO]
---

<!-- 이미지 경로: /assets/img/posts/$URL_TITLE/<파일명> -->
<!-- 예시: ![fig1](/assets/img/posts/$URL_TITLE/fig1.png) -->

## 개요


## 본문


## 마무리

EOF

else
cat > "$POST_PATH" << EOF
---
title: "$TITLE"
date: $DATE 21:00:00 +0900
categories:
  - misc
tags: [TODO]
---

<!-- 이미지 경로: /assets/img/posts/$URL_TITLE/<파일명> -->


EOF
fi

if [ $? -eq 0 ]; then
    echo "✅ 포스트 생성: _posts/$POST_FILENAME"
    echo ""
    echo "  📄 _posts/$POST_FILENAME"
    echo "  📁 assets/img/posts/$URL_TITLE"
    echo ""
    echo "이미지 삽입: ![설명](/assets/img/posts/$URL_TITLE/파일명.png)"
    echo "수식 (MathJax): 인라인 \$...\$  블록 \$\$...\$\$"
else
    echo "❌ 포스트 생성 실패"
    exit 1
fi
