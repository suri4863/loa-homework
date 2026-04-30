import type { VercelRequest } from "@vercel/node";
import { sql } from "@vercel/postgres";
import crypto from "crypto";

export type MeUserRow = {
  id: number;
  friend_code: string;
  nickname: string | null;
  share_mode: "PUBLIC" | "PRIVATE" | string;
  legacy_login_allowed?: boolean;
  login_id?: string | null;
};

type LoginRow = MeUserRow & {
  login_pw_salt: string | null;
  login_pw_hash: string | null;
  session_token_hash: string | null;
  session_expires_at: string | null;
};

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

  await sql`
    create table if not exists friend_raid_plans (
      friend_code text primary key references users(friend_code),
      nickname text,
      plan_json text not null,
      updated_at timestamptz not null default now()
    );
  `;

  await sql`
    create table if not exists shared_weekly_schedules (
      id bigserial primary key,
      owner_user_id bigint not null references users(id),
      target_user_id bigint not null references users(id),
      title text not null,
      week_start_date text not null,
      schedule_json text not null,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );
  `;

  await sql`
    alter table users
    add column if not exists backup_pw_salt text,
    add column if not exists backup_pw_hash text,
    add column if not exists legacy_login_allowed boolean not null default true,
    add column if not exists login_id text unique,
    add column if not exists login_pw_salt text,
    add column if not exists login_pw_hash text,
    add column if not exists session_token_hash text,
    add column if not exists session_expires_at timestamptz,
    add column if not exists auth_user_id text unique
  `;

  await sql`
    create table if not exists state_backups (
      user_id bigint primary key references users(id),
      state_json text not null,
      updated_at timestamptz not null default now()
    );
  `;
}

function scryptHash(password: string, saltB64?: string) {
  const salt = saltB64 ? Buffer.from(saltB64, "base64") : crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32) as Buffer;
  return { saltB64: salt.toString("base64"), hashB64: hash.toString("base64") };
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("base64");
}

function getBearerToken(req: VercelRequest) {
  const value = String(req.headers.authorization ?? "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function makeFriendCode() {
  return `FC_${crypto.randomBytes(3).toString("hex")}_${Date.now().toString(16)}`;
}

function makeSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function parseNickname(req: VercelRequest, fallback: string) {
  const rawNick = String(req.headers["x-nickname"] ?? fallback).trim() || fallback;
  try {
    return String(decodeURIComponent(rawNick)).trim() || fallback;
  } catch {
    return String(rawNick).trim() || fallback;
  }
}

async function getUserBySessionToken(req: VercelRequest): Promise<LoginRow | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  await ensureSchema();
  const tokenHash = hashToken(token);
  const result = await sql<LoginRow>`
    select
      id,
      friend_code,
      nickname,
      share_mode,
      legacy_login_allowed,
      login_id,
      login_pw_salt,
      login_pw_hash,
      session_token_hash,
      session_expires_at
    from users
    where session_token_hash=${tokenHash}
      and session_expires_at is not null
      and session_expires_at > now()
  `;
  return result.rows[0] ?? null;
}

export async function createSessionForUser(userId: number) {
  const token = makeSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  await sql`
    update users
    set session_token_hash=${tokenHash},
        session_expires_at=${expiresAt}
    where id=${userId}
  `;

  return { token, expiresAt };
}

export async function registerWithCredentials(input: {
  loginId: string;
  password: string;
  friendCode?: string;
  nickname?: string;
}) {
  await ensureSchema();

  const loginId = input.loginId.trim().toLowerCase();
  const password = input.password;
  if (!loginId) {
    const err = new Error("Missing loginId");
    (err as any).status = 400;
    throw err;
  }
  if (password.length < 6) {
    const err = new Error("Password must be at least 6 characters");
    (err as any).status = 400;
    throw err;
  }

  const existing = await sql<{ id: number }>`select id from users where login_id=${loginId}`;
  if (existing.rowCount) {
    const err = new Error("This ID is already in use");
    (err as any).status = 409;
    throw err;
  }

  const requestedCode = String(input.friendCode ?? "").trim();
  const codeExists = requestedCode
    ? await sql<{ id: number }>`select id from users where friend_code=${requestedCode}`
    : null;
  const friendCode = requestedCode && !codeExists?.rowCount ? requestedCode : makeFriendCode();
  const nickname = String(input.nickname ?? "").trim() || loginId;
  const { saltB64, hashB64 } = scryptHash(password);

  const created = await sql<MeUserRow>`
    insert into users(friend_code, nickname, login_id, login_pw_salt, login_pw_hash)
    values(${friendCode}, ${nickname}, ${loginId}, ${saltB64}, ${hashB64})
    returning id, friend_code, nickname, share_mode, legacy_login_allowed, login_id
  `;
  const user = created.rows[0];
  const session = await createSessionForUser(user.id);

  return { user, ...session };
}

export async function loginWithCredentials(loginId: string, password: string) {
  await ensureSchema();

  const normalizedLoginId = loginId.trim().toLowerCase();
  const result = await sql<LoginRow>`
    select
      id,
      friend_code,
      nickname,
      share_mode,
      legacy_login_allowed,
      login_id,
      login_pw_salt,
      login_pw_hash,
      session_token_hash,
      session_expires_at
    from users
    where login_id=${normalizedLoginId}
  `;
  const user = result.rows[0];
  if (!user?.login_pw_salt || !user?.login_pw_hash) {
    const err = new Error("Invalid ID or password");
    (err as any).status = 401;
    throw err;
  }

  const { hashB64 } = scryptHash(password, user.login_pw_salt);
  const a = Buffer.from(hashB64, "base64");
  const b = Buffer.from(user.login_pw_hash, "base64");
  const same = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!same) {
    const err = new Error("Invalid ID or password");
    (err as any).status = 401;
    throw err;
  }

  const session = await createSessionForUser(user.id);
  return { user, ...session };
}

export async function logoutWithSession(req: VercelRequest) {
  const user = await getUserBySessionToken(req);
  if (!user) return { ok: true };

  await sql`
    update users
    set session_token_hash=null,
        session_expires_at=null
    where id=${user.id}
  `;
  return { ok: true };
}

export async function getMe(req: VercelRequest): Promise<MeUserRow> {
  await ensureSchema();

  const sessionUser = await getUserBySessionToken(req);
  if (sessionUser) {
    const nickname = parseNickname(req, sessionUser.nickname || sessionUser.friend_code);
    if (nickname && sessionUser.nickname !== nickname) {
      await sql`update users set nickname=${nickname} where id=${sessionUser.id}`;
      sessionUser.nickname = nickname;
    }
    return sessionUser;
  }

  const friendCode = String(req.headers["x-friend-code"] ?? "").trim();
  if (!friendCode) {
    const err = new Error("Missing x-friend-code");
    (err as any).status = 401;
    throw err;
  }

  const nickname = parseNickname(req, friendCode);
  const existed = await sql<MeUserRow>`
    select id, friend_code, nickname, share_mode, legacy_login_allowed, login_id
    from users
    where friend_code=${friendCode}
  `;

  if (existed.rowCount && existed.rows[0]) {
    if (existed.rows[0].login_id && existed.rows[0].legacy_login_allowed === false) {
      const err = new Error("Legacy code login is disabled for this account");
      (err as any).status = 401;
      throw err;
    }
    if (nickname && existed.rows[0].nickname !== nickname) {
      await sql`update users set nickname=${nickname} where id=${existed.rows[0].id}`;
      existed.rows[0].nickname = nickname;
    }
    return existed.rows[0];
  }

  const created = await sql<MeUserRow>`
    insert into users(friend_code, nickname)
    values(${friendCode}, ${nickname})
    returning id, friend_code, nickname, share_mode, legacy_login_allowed, login_id
  `;
  return created.rows[0];
}

export async function requireAuthUser(req: VercelRequest) {
  const user = await getUserBySessionToken(req);
  if (!user) {
    const err = new Error("Login required");
    (err as any).status = 401;
    throw err;
  }
  return user;
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

export async function ensureBackupPassword(meId: number, password: string) {
  const row = await sql<{ backup_pw_salt: string | null; backup_pw_hash: string | null }>`
    select backup_pw_salt, backup_pw_hash
    from users
    where id=${meId}
  `;

  const curSalt = row.rows[0]?.backup_pw_salt ?? null;
  const curHash = row.rows[0]?.backup_pw_hash ?? null;

  if (!curSalt || !curHash) {
    const { saltB64, hashB64 } = scryptHash(password);
    await sql`update users set backup_pw_salt=${saltB64}, backup_pw_hash=${hashB64} where id=${meId}`;
    return { ok: true, firstSet: true };
  }

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

export async function verifyExistingBackupPassword(meId: number, password: string) {
  const row = await sql<{ backup_pw_salt: string | null; backup_pw_hash: string | null }>`
    select backup_pw_salt, backup_pw_hash
    from users
    where id=${meId}
  `;

  const curSalt = row.rows[0]?.backup_pw_salt ?? null;
  const curHash = row.rows[0]?.backup_pw_hash ?? null;
  if (!curSalt || !curHash) {
    const err = new Error("No backup password is set for this code");
    (err as any).status = 404;
    throw err;
  }

  const { hashB64 } = scryptHash(password, curSalt);
  const a = Buffer.from(hashB64, "base64");
  const b = Buffer.from(curHash, "base64");
  const same = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!same) {
    const err = new Error("Invalid backup password");
    (err as any).status = 401;
    throw err;
  }
  return { ok: true };
}

export async function updateLoginPassword(userId: number, password: string) {
  if (password.length < 6) {
    const err = new Error("Password must be at least 6 characters");
    (err as any).status = 400;
    throw err;
  }

  const { saltB64, hashB64 } = scryptHash(password);
  await sql`
    update users
    set login_pw_salt=${saltB64},
        login_pw_hash=${hashB64}
    where id=${userId}
  `;
  return { ok: true };
}

export async function deleteAccountWithPassword(req: VercelRequest, password: string) {
  const user = await requireAuthUser(req);
  if (!password) {
    const err = new Error("Password is required");
    (err as any).status = 400;
    throw err;
  }

  const auth = await sql<{
    id: number;
    friend_code: string;
    login_pw_salt: string | null;
    login_pw_hash: string | null;
  }>`
    select id, friend_code, login_pw_salt, login_pw_hash
    from users
    where id=${user.id}
  `;
  const row = auth.rows[0];
  if (!row?.login_pw_salt || !row?.login_pw_hash) {
    const err = new Error("Password login is not configured for this account");
    (err as any).status = 400;
    throw err;
  }

  const { hashB64 } = scryptHash(password, row.login_pw_salt);
  const a = Buffer.from(hashB64, "base64");
  const b = Buffer.from(row.login_pw_hash, "base64");
  const same = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!same) {
    const err = new Error("Invalid password");
    (err as any).status = 401;
    throw err;
  }

  await sql`delete from shared_weekly_schedules where owner_user_id=${row.id} or target_user_id=${row.id}`;
  await sql`delete from friend_requests where from_user_id=${row.id} or to_user_id=${row.id}`;
  await sql`delete from friendships where user_a=${row.id} or user_b=${row.id}`;
  await sql`delete from raid_left_snapshots where user_id=${row.id}`;
  await sql`delete from state_backups where user_id=${row.id}`;
  await sql`delete from friend_raid_plans where friend_code=${row.friend_code}`;
  await sql`delete from users where id=${row.id}`;

  return { ok: true };
}
