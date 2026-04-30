import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import {
  createSessionForUser,
  ensureBackupPassword,
  ensureSchema,
  getMe,
  requireAuthUser,
  sendError,
  sendJson,
  verifyExistingBackupPassword,
} from "../../lib/_db.js";

function getAction(req: VercelRequest) {
  const action = req.query.action;
  return Array.isArray(action) ? action[0] : String(action ?? "");
}

async function handleAccount(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");
  const me = await getMe(req);
  const backup = await sql<{ updated_at: string }>`
    select updated_at
    from state_backups
    where user_id=${me.id}
  `;

  return sendJson(res, {
    ok: true,
    friendCode: me.friend_code,
    nickname: me.nickname,
    shareMode: me.share_mode,
    legacyLoginAllowed: me.legacy_login_allowed !== false,
    loginId: me.login_id ?? "",
    hasBackup: (backup.rowCount ?? 0) > 0,
    backupUpdatedAt: backup.rows[0]?.updated_at ?? null,
  });
}

async function handleNickname(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PUT") return res.status(405).send("Method Not Allowed");
  const me = await getMe(req);
  const nickname = String(req.body?.nickname ?? "").trim();
  await sql`update users set nickname=${nickname} where id=${me.id}`;
  return sendJson(res, { ok: true, nickname });
}

async function handleShareMode(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PUT") return res.status(405).send("Method Not Allowed");
  const me = await getMe(req);
  const shareMode = req.body?.shareMode;
  if (shareMode !== "PUBLIC" && shareMode !== "PRIVATE") return res.status(400).send("Invalid shareMode");
  await sql`update users set share_mode=${shareMode} where id=${me.id}`;
  return sendJson(res, { ok: true });
}

async function handleRaidLeftSnapshot(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PUT") return res.status(405).send("Method Not Allowed");
  const me = await getMe(req);
  const snapshotJson = String(req.body?.snapshotJson ?? "");
  if (!snapshotJson) return res.status(400).send("Missing snapshotJson");

  await sql`
    insert into raid_left_snapshots(user_id, snapshot_json)
    values(${me.id}, ${snapshotJson})
    on conflict (user_id)
    do update set snapshot_json = excluded.snapshot_json, updated_at = now()
  `;

  return sendJson(res, { ok: true });
}

async function handleRaidPlan(req: VercelRequest, res: VercelResponse) {
  const me = await getMe(req);

  if (req.method === "PUT") {
    const { nickname, planJson } = req.body ?? {};
    const friendCode = me.friend_code;

    await sql`
      insert into friend_raid_plans (friend_code, nickname, plan_json, updated_at)
      values (${friendCode}, ${nickname ?? ""}, ${planJson}, now())
      on conflict (friend_code)
      do update set
        nickname = excluded.nickname,
        plan_json = excluded.plan_json,
        updated_at = now()
    `;

    return sendJson(res, { ok: true });
  }

  return res.status(405).send("Method Not Allowed");
}

async function handleStateBackup(req: VercelRequest, res: VercelResponse) {
  const me = await getMe(req);

  if (req.method === "PUT") {
    const password = String(req.body?.password ?? "");
    const stateJson = String(req.body?.stateJson ?? "");
    if (!password) return res.status(400).send("Missing password");
    if (!stateJson) return res.status(400).send("Missing stateJson");

    await ensureBackupPassword(me.id, password);
    await sql`
      insert into state_backups(user_id, state_json)
      values(${me.id}, ${stateJson})
      on conflict (user_id)
      do update set state_json = excluded.state_json, updated_at = now()
    `;

    return sendJson(res, { ok: true });
  }

  if (req.method === "POST") {
    const password = String(req.body?.password ?? "");
    if (!password) return res.status(400).send("Missing password");

    await ensureBackupPassword(me.id, password);
    const row = await sql<{ state_json: string; updated_at: string }>`
      select state_json, updated_at
      from state_backups
      where user_id=${me.id}
    `;
    if (!row.rowCount) return res.status(404).send("No backup found");

    return sendJson(res, {
      ok: true,
      stateJson: row.rows[0].state_json,
      updatedAt: row.rows[0].updated_at,
    });
  }

  return res.status(405).send("Method Not Allowed");
}

async function handleLinkLegacy(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  await ensureSchema();
  const authUser = await requireAuthUser(req);
  const friendCode = String(req.body?.friendCode ?? "").trim();
  const password = String(req.body?.password ?? "");
  const action = String(req.body?.action ?? "verify");
  const legacyLoginAllowed = req.body?.legacyLoginAllowed !== false;

  if (!friendCode) return res.status(400).send("Missing friendCode");
  if (!password) return res.status(400).send("Missing password");

  const legacy = await sql<{
    id: number;
    friend_code: string;
    nickname: string | null;
    login_id: string | null;
  }>`
    select id, friend_code, nickname, login_id
    from users
    where friend_code=${friendCode}
  `;
  if (!legacy.rowCount || !legacy.rows[0]) return res.status(404).send("Code not found");

  const legacyUser = legacy.rows[0];
  if (legacyUser.login_id && legacyUser.id !== authUser.id) {
    return res.status(409).send("This code is already linked to another login account");
  }

  await verifyExistingBackupPassword(legacyUser.id, password);

  const backup = await sql<{ state_json: string; updated_at: string }>`
    select state_json, updated_at
    from state_backups
    where user_id=${legacyUser.id}
  `;

  if (action === "load") {
    if (!backup.rowCount || !backup.rows[0]) return res.status(404).send("No backup found");
    return sendJson(res, {
      ok: true,
      friendCode,
      stateJson: backup.rows[0].state_json,
      updatedAt: backup.rows[0].updated_at,
    });
  }

  if (action === "claim") {
    const authCreds = await sql<{
      login_id: string | null;
      login_pw_salt: string | null;
      login_pw_hash: string | null;
      session_token_hash: string | null;
      session_expires_at: string | null;
    }>`
      select login_id, login_pw_salt, login_pw_hash, session_token_hash, session_expires_at
      from users
      where id=${authUser.id}
    `;
    const creds = authCreds.rows[0];

    if (authUser.id !== legacyUser.id) {
      await sql`
        insert into friendships(user_a, user_b)
        select
          least(
            case when user_a = ${authUser.id} then ${legacyUser.id} else user_a end,
            case when user_b = ${authUser.id} then ${legacyUser.id} else user_b end
          ),
          greatest(
            case when user_a = ${authUser.id} then ${legacyUser.id} else user_a end,
            case when user_b = ${authUser.id} then ${legacyUser.id} else user_b end
          )
        from friendships
        where user_a = ${authUser.id} or user_b = ${authUser.id}
        on conflict do nothing
      `;

      await sql`delete from friendships where user_a = ${authUser.id} or user_b = ${authUser.id}`;
      await sql`update friend_requests set from_user_id = ${legacyUser.id} where from_user_id = ${authUser.id}`;
      await sql`update friend_requests set to_user_id = ${legacyUser.id} where to_user_id = ${authUser.id}`;
      await sql`delete from friend_requests where from_user_id = to_user_id`;
      await sql`
        delete from friend_requests fr
        using friend_requests newer
        where fr.id < newer.id
          and fr.from_user_id = newer.from_user_id
          and fr.to_user_id = newer.to_user_id
          and fr.status = newer.status
      `;
      await sql`update shared_weekly_schedules set owner_user_id = ${legacyUser.id} where owner_user_id = ${authUser.id}`;
      await sql`update shared_weekly_schedules set target_user_id = ${legacyUser.id} where target_user_id = ${authUser.id}`;
      await sql`
        insert into raid_left_snapshots(user_id, snapshot_json, updated_at)
        select ${legacyUser.id}, snapshot_json, updated_at
        from raid_left_snapshots
        where user_id = ${authUser.id}
          and not exists (
            select 1 from raid_left_snapshots current_snap where current_snap.user_id = ${legacyUser.id}
          )
        on conflict (user_id) do nothing
      `;
      await sql`
        insert into state_backups(user_id, state_json, updated_at)
        select ${legacyUser.id}, state_json, updated_at
        from state_backups
        where user_id = ${authUser.id}
          and not exists (
            select 1 from state_backups current_backup where current_backup.user_id = ${legacyUser.id}
          )
        on conflict (user_id) do nothing
      `;
    }

    await sql`
      update users
      set login_id=null,
          login_pw_salt=null,
          login_pw_hash=null,
          session_token_hash=null,
          session_expires_at=null
      where id <> ${legacyUser.id}
        and login_id=${creds?.login_id ?? ""}
    `;

    await sql`
      update users
      set login_id=${creds?.login_id ?? null},
          login_pw_salt=${creds?.login_pw_salt ?? null},
          login_pw_hash=${creds?.login_pw_hash ?? null},
          session_token_hash=null,
          session_expires_at=null,
          legacy_login_allowed=${legacyLoginAllowed}
      where id=${legacyUser.id}
    `;

    const session = await createSessionForUser(legacyUser.id);

    return sendJson(res, {
      ok: true,
      friendCode,
      nickname: legacyUser.nickname,
      legacyLoginAllowed,
      hasBackup: Boolean(backup.rowCount),
      updatedAt: backup.rows[0]?.updated_at ?? null,
      stateJson: backup.rows[0]?.state_json ?? null,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  }

  return sendJson(res, {
    ok: true,
    friendCode,
    nickname: legacyUser.nickname,
    alreadyLinked: legacyUser.id === authUser.id || legacyUser.login_id === authUser.login_id,
    hasBackup: Boolean(backup.rowCount),
    updatedAt: backup.rows[0]?.updated_at ?? null,
  });
}

async function handleResetData(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") return res.status(405).send("Method Not Allowed");

  const me = await requireAuthUser(req);

  await sql`delete from shared_weekly_schedules where owner_user_id=${me.id} or target_user_id=${me.id}`;
  await sql`delete from raid_left_snapshots where user_id=${me.id}`;
  await sql`delete from state_backups where user_id=${me.id}`;
  await sql`delete from friend_raid_plans where friend_code=${me.friend_code}`;

  return sendJson(res, { ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const action = getAction(req);

    if (action === "account") return handleAccount(req, res);
    if (action === "nickname") return handleNickname(req, res);
    if (action === "share-mode") return handleShareMode(req, res);
    if (action === "raid-left-snapshot") return handleRaidLeftSnapshot(req, res);
    if (action === "raid-plan") return handleRaidPlan(req, res);
    if (action === "state-backup") return handleStateBackup(req, res);
    if (action === "link-legacy") return handleLinkLegacy(req, res);
    if (action === "reset-data") return handleResetData(req, res);

    return res.status(404).send("Not Found");
  } catch (e) {
    return sendError(res, e);
  }
}
