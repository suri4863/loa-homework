# Server-mode 친구요청 (Vercel Functions + Vercel Postgres)

## 1) 설치
npm i @vercel/postgres

## 2) Vercel 설정
- Vercel 대시보드 > 프로젝트 > Storage > Postgres 생성
- 프로젝트 Environment Variables에 추가:
  - VITE_SERVER_MODE = 1

## 3) 파일 적용
- src/pages/TodoTracker.tsx 를 교체
- api/ 폴더를 루트에 추가 (Vercel이 자동으로 Serverless Functions로 배포)

## 4) 동작
- 서버모드: 친구요청 보내기/수락/거절, 남은 레이드 스냅샷 업로드/조회(공개/비공개 + 친구관계 체크)
- 로컬모드: 기존(친구추가/스냅샷 복사/붙여넣기) 유지

