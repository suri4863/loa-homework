import type { VercelRequest } from "@vercel/node";
import { sql } from "@vercel/postgres";

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
}

export type MeUserRow = {
  id: number;
  friend_code: string;
  nickname: string | null;
  share_mode: "PUBLIC" | "PRIVATE" | string;
};

export async function getMe(req: VercelRequest): Promise<MeUserRow> {
  const friendCode = String(req.headers["x-friend-code"] ?? "").trim();
  const nickname = String(req.headers["x-nickname"] ?? friendCode).trim() || friendCode;

  if (!friendCode) {
    const err = new Error("Missing x-friend-code");
    (err as any).status = 401;
    throw err;
  }

  await ensureSchema();

  const existed = await sql<MeUserRow>`select id, friend_code, nickname, share_mode from users where friend_code=${friendCode}`;
  if (existed.rowCount && existed.rows[0]) {
    // 닉네임이 비어있으면 채워주기
    if (!existed.rows[0].nickname && nickname) {
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
