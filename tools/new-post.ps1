<#
.SYNOPSIS
    Jekyll 블로그 새 포스트 생성 스크립트

.PARAMETER Title
    포스트 제목 (필수)

.PARAMETER Type
    포스트 유형: paper (논문 리뷰), dev (개발 공부), note (기타)
    기본값: paper

.PARAMETER Date
    게시 날짜 (YYYY-MM-DD). 기본값: 오늘

.EXAMPLE
    .\tools\new-post.ps1 -Title "PixelDiT: Pixel Diffusion Transformers"
    .\tools\new-post.ps1 -Title "Python 환경 설정 완전 가이드" -Type dev
    .\tools\new-post.ps1 -Title "Self-Flow" -Type paper -Date 2026-03-21
#>
param(
    [Parameter(Mandatory = $true, HelpMessage = "포스트 제목을 입력하세요")]
    [string]$Title,

    [ValidateSet("paper", "dev", "note")]
    [string]$Type = "paper",

    [string]$Date = (Get-Date -Format "yyyy-MM-dd")
)

$repoRoot = Split-Path $PSScriptRoot -Parent

# URL-safe 슬러그 (소문자 + 영문/숫자/한글만, 나머지는 하이픈)
$slug = $Title.ToLower() `
    -replace '[^a-z0-9가-힣]+', '-' `
    -replace '^-|-$', ''

$postFile  = "_posts\$Date-$slug.md"
$imgFolder = "assets\img\posts\$slug"
$postPath  = Join-Path $repoRoot $postFile
$imgPath   = Join-Path $repoRoot $imgFolder
$mathPath  = Join-Path $repoRoot "_includes\_math"

if (Test-Path $postPath) {
    Write-Error "이미 존재하는 파일입니다: $postFile"
    exit 1
}

New-Item -ItemType Directory -Force -Path $imgPath  | Out-Null
New-Item -ItemType Directory -Force -Path $mathPath | Out-Null

# ── 템플릿 선택 ──────────────────────────────────────────────
if ($Type -eq "paper") {

$content = @"
---
title: "[논문 리뷰] $Title"
date: $Date 21:00:00 +0900
categories:
  - ai/paper-review
tags: [paper review, TODO]
paper:
  authors: "TODO"
  venue:   "TODO"
  arxiv:   "TODO"
  code:    "TODO"
---

<!-- 이미지 경로: /assets/img/posts/$slug/<파일명> -->
<!-- 예시: ![fig1](/assets/img/posts/$slug/fig1.png) -->

### My Insight


### 1. Introduction


### 2. Related Work


### 3. Method


### 4. Experiments


### 5. Results


### Discussion

"@

} elseif ($Type -eq "dev") {

$content = @"
---
title: "$Title"
date: $Date 21:00:00 +0900
categories:
  - dev
tags: [TODO]
---

<!-- 이미지 경로: /assets/img/posts/$slug/<파일명> -->
<!-- 예시: ![fig1](/assets/img/posts/$slug/fig1.png) -->

## 개요


## 본문


## 마무리

"@

} else {

$content = @"
---
title: "$Title"
date: $Date 21:00:00 +0900
categories:
  - misc
tags: [TODO]
---

<!-- 이미지 경로: /assets/img/posts/$slug/<파일명> -->


"@

}

Set-Content -Path $postPath -Value $content -Encoding UTF8

Write-Host ""
Write-Host "✅ 포스트 생성 완료"
Write-Host ""
Write-Host "  📄 $postFile"
Write-Host "  📁 $imgFolder\"
Write-Host ""
Write-Host "이미지 삽입 방법:"
Write-Host "  1. 이미지를 $imgFolder\ 에 복사"
Write-Host "  2. 마크다운에 삽입: ![설명](/assets/img/posts/$slug/파일명.png)"
Write-Host ""
Write-Host "수식 (MathJax):"
Write-Host "  인라인:  `$수식`$"
Write-Host "  블록:    `$`$수식`$`$"
Write-Host ""
