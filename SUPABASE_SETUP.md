# Supabase Auth 설정

## 1. Supabase 프로젝트 만들기

Supabase에서 새 프로젝트를 만들고 `Project Settings > API`에서 아래 값을 확인한다.

- Project URL
- anon public key
- service_role key

## 2. Vercel 환경변수

Vercel 프로젝트의 Environment Variables에 추가한다.

```txt
VITE_SERVER_MODE=1
VITE_SUPABASE_URL=Supabase Project URL
VITE_SUPABASE_ANON_KEY=Supabase anon public key
SUPABASE_URL=Supabase Project URL
SUPABASE_ANON_KEY=Supabase anon public key
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key
POSTGRES_URL=Supabase Postgres connection string
```

`POSTGRES_URL`은 Supabase `Project Settings > Database`의 connection string을 사용한다.

## 3. Auth 설정

Supabase `Authentication > Providers > Email`에서 Email provider를 켠다.

아이디 로그인은 내부적으로 `아이디@loa-gem-tracker.local` 이메일 형식으로 저장된다. 이메일 인증을 끄면 회원가입 직후 바로 로그인해서 테스트하기 쉽다.

## 4. 기존 데이터 연동 흐름

1. 회원가입 또는 로그인
2. `기존 FC 데이터 연동`에 FC 코드와 서버 백업 비밀번호 입력
3. `연동하기`
4. 필요하면 `연동된 기존 데이터 불러오기`
5. `이 계정에 기존 데이터를 귀속하기`
6. 코드 로그인 유지가 필요 없으면 `기존 코드 로그인도 허용` 체크 해제 후 귀속
