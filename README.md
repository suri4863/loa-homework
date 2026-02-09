# loa-gem-tracker

로스트아크 보석 개수/가치 입력표 (엑셀 방식).

## 실행

```bash
npm install
npm run dev
```

## 주요 파일

- `src/components/GemTracker.tsx` : 입력 테이블 + 합계/시세/가치 계산 로직

## 커스터마이징

- 기본 열(캐릭터/창고) 이름: `DEFAULT_COLUMNS`
- 레벨 목록: `LEVELS`

데이터는 자동으로 `localStorage`에 저장됩니다.
