# eiaserinnys.me

https://eiaserinnys.me 에 올라가는 정적 페이지의 원본입니다.

## 구조

리포 루트가 사이트 루트에 대응합니다.

| 경로 | 주소 | 내용 |
|---|---|---|
| `products/` | https://eiaserinnys.me/products/ | 제품 목록 |
| `products/<제품>/` | https://eiaserinnys.me/products/<제품>/ | 제품 소개 페이지 |
| `products/assets/` | `/products/assets/site.css`, `/products/assets/site.js` | 공통 Index 스타일과 스크립트 |

## 제품 더하는 법

1. 기존 제품 폴더(`products/atom/` 또는 `products/toktok/`)를 `products/<새-제품>/`으로 복사하고 `index.html`의 메타데이터(`canonical`, `og:url`, `og:image`), 제목, 장부 섹션과 `images/` 캡처를 바꿉니다. 공통 스타일(`../assets/site.css`)과 스크립트(`../assets/site.js`)는 그대로 씁니다.
2. `products/index.html`의 `.index-list`에 `<details class="index-item">` 줄을 하나 더합니다.

## 배포

eiaserinnys 서버의 Haniel이 `main`을 받아 두고, nginx가 `/products/` 경로를 그 체크아웃의 `products/`로 서빙합니다. `main`에 머지하면 반영됩니다.

GitHub Pages(eiaserinnys.github.io)에도 같은 파일이 올라가지만 정본 주소는 eiaserinnys.me입니다. 각 페이지는 `<link rel="canonical">`로 eiaserinnys.me를 가리킵니다.
