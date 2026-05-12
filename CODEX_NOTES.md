# Codex Notes

## Project Paths

- Real Git/Vercel project:
  `C:\Users\suri4\Downloads\loa-gem-tracker-fixed\loa-gem-tracker-fixed\loa-gem-tracker`
- Main comparison/reference copy:
  `C:\Users\suri4\Downloads\loa-gem-tracker-fixed\loa-gem-tracker-fixed\loa-gem-tracker 메인\loa-gem-tracker`

When changing files for deploy, edit the real Git/Vercel project path.

## Vercel Limit

- The Vercel Hobby plan allows up to 12 Serverless Functions.
- Every file under `api/` can count as a Serverless Function.
- Keep the `api/` function count at 12 or lower.
- Growth price endpoints are routed through `api/growth/[kind].ts`.
- The implementation files for those endpoints live under `lib/server/growth/`.

## Growth API Routing

These URLs are still used by the frontend:

- `/api/growth/gem-prices`
- `/api/growth/accessory-prices`
- `/api/growth/engraving-prices`
- `/api/growth/avatar-prices`

They are handled by:

- `api/growth/[kind].ts`

Do not add those four files back directly under `api/growth/`, or Vercel may fail with the Hobby plan function limit.

## Local Development

- `vite.config.ts` contains local middleware so Vite can run the Vercel-style API handlers during development.
- If local API calls return HTML instead of JSON, check `vite.config.ts` first.

## Before Deploy

Run:

```bat
npm run build
```

Then check:

```bat
git status
```

Deleted API files, new router files, and files under `lib/server/growth/` must all be committed together.


## 규칙
git add .
git commit -m "커밋 메세지는 한글로 적어주기"
git push

Vercel Hobby 플랜의 Serverless Function 12개 제한이 있기 때문에 이거에 맞춰서 개발해주기

기능 체크 할 때 최적화랑 오류 찾으면 고쳐주기
