# eiaserinnys.me

https://eiaserinnys.me 에 올라가는 정적 페이지의 원본입니다.

## 구조

리포 루트가 사이트 루트에 대응합니다.

| 경로 | 주소 | 내용 |
|---|---|---|
| `projects/` | https://eiaserinnys.me/projects/ | 공개 패키지 목록 |
| `projects/<패키지>/` | https://eiaserinnys.me/projects/<패키지>/ | 패키지 소개 페이지 |

## 배포

eiaserinnys 서버의 Haniel이 `main`을 받아 두고, nginx가 `/projects/` 경로를 그 체크아웃의 `projects/`로 서빙합니다. `main`에 머지하면 반영됩니다.

GitHub Pages(eiaserinnys.github.io)에도 같은 파일이 올라가지만 정본 주소는 eiaserinnys.me입니다. 각 페이지는 `<link rel="canonical">`로 eiaserinnys.me를 가리킵니다.
