import type { VercelRequest } from "@vercel/node";
import { sql } from "@vercel/postgres";
import crypto from "crypto";

/**
 * NOTE
 * - 이 프로젝트는 '로그인'이 없으므로, 프론트가 보내는 x-friend-code 헤더를 사용자 식별키로 사용합니다.
 * - 나중에 인증(세션/JWT/OAuth)을 붙이면 이 부분을 교체하세요.
 */

export async function ensureSchema() {
  await sql`
    create table if not exists users (
      id bigserial primary key,
      friend_code text unique not null,
      nickname text,
      share_mode text not null default 'PRIVATE',
      created_at timestamptz not null default now()
    );
  `;

  await sql`
    create table if not exists friend_requests (
      id bigserial primary key,
      from_user_id bigint not null references users(id),
      to_user_id bigint not null references users(id),
      status text not null default 'PENDING',
      created_at timestamptz not null default now(),
      responded_at timestamptz
    );
  `;

  await sql`
    create unique index if not exists uq_friend_request_pending
    on friend_requests(from_user_id, to_user_id)
    where status='PENDING';
  `;

  await sql`
    create table if not exists friendships (
      id bigserial primary key,
      user_a bigint not null references users(id),
      user_b bigint not null references users(id),
      created_at timestamptz not null default now(),
      unique(user_a, user_b)
    );
  `;

  await sql`
    create table if not exists raid_left_snapshots (
      user_id bigint primary key references users(id),
      snapshot_json text not null,
      updated_at timestamptz not null default now()
    );
  `;
    // ✅ 백업 비밀번호(해시/솔트) 컬럼
  await sql`
    alter table users
    add column if not exists backup_pw_salt text,
    add column if not exists backup_pw_hash text
  `;

  // ✅ 전체 state 백업 저장소 (유저당 1개)
  await sql`
    create table if not exists state_backups (
      user_id bigint primary key references users(id),
      state_json text not null,
      updated_at timestamptz not null default now()
    );
  `;
}

export type MeUserRow = {
  id: number;
  friend_code: string;
  nickname: string | null;
  share_mode: "PUBLIC" | "PRIVATE" | string;
};

export async function getMe(req: VercelRequest): Promise<MeUserRow> {
  const friendCode = String(req.headers["x-friend-code"] ?? "").trim();

  const rawNick = String(req.headers["x-nickname"] ?? friendCode).trim() || friendCode;
  // ✅ 프론트에서 encodeURIComponent로 보내므로 복원
  let nickname = rawNick;
  try {
    nickname = decodeURIComponent(rawNick);
  } catch {
    // decode 실패하면 raw 그대로 사용
  }
  nickname = String(nickname).trim() || friendCode;

  if (!friendCode) {
    const err = new Error("Missing x-friend-code");
    (err as any).status = 401;
    throw err;
  }

  await ensureSchema();

  const existed = await sql<MeUserRow>`select id, friend_code, nickname, share_mode from users where friend_code=${friendCode}`;
  if (existed.rowCount && existed.rows[0]) {
    // 닉네임이 비어있으면 채워주기
    if (nickname && existed.rows[0].nickname !== nickname) {
      await sql`update users set nickname=${nickname} where id=${existed.rows[0].id}`;
    }
    return existed.rows[0];
  }

  const created = await sql<MeUserRow>`
    insert into users(friend_code, nickname)
    values(${friendCode}, ${nickname})
    returning id, friend_code, nickname, share_mode
  `;
  return created.rows[0];
}

export function sendJson(res: any, data: any, status = 200) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function sendError(res: any, e: any) {
  const status = Number(e?.status ?? 500);
  const msg = String(e?.message ?? "Server Error");
  sendJson(res, { error: msg }, status);
}

function scryptHash(password: string, saltB64?: string) {
  const salt = saltB64 ? Buffer.from(saltB64, "base64") : crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32) as Buffer;
  return { saltB64: salt.toString("base64"), hashB64: hash.toString("base64") };
}

/**
 * ✅ 백업 비밀번호 정책
 * - 유저가 처음 백업을 쓰는 순간 비밀번호를 "설정"해버림(첫 PUT/POST에서)
 * - 이후부터는 해당 비밀번호가 맞아야만 업/다운 가능
 */
export async function ensureBackupPassword(meId: number, password: string) {
  const row = await sql<{ backup_pw_salt: string | null; backup_pw_hash: string | null }>`
    select backup_pw_salt, backup_pw_hash
    from users
    where id=${meId}
  `;

  const curSalt = row.rows[0]?.backup_pw_salt ?? null;
  const curHash = row.rows[0]?.backup_pw_hash ?? null;

  // 최초 설정
  if (!curSalt || !curHash) {
    const { saltB64, hashB64 } = scryptHash(password);
    await sql`update users set backup_pw_salt=${saltB64}, backup_pw_hash=${hashB64} where id=${meId}`;
    return { ok: true, firstSet: true };
  }

  // 검증
  const { hashB64 } = scryptHash(password, curSalt);
  const a = Buffer.from(hashB64, "base64");
  const b = Buffer.from(curHash, "base64");
  const same = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!same) {
    const err = new Error("Invalid backup password");
    (err as any).status = 401;
    throw err;
  }
  return { ok: true, firstSet: false };
}