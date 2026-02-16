// api/me/nickname.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "@vercel/postgres";
import { getMe } from "../_db.ts"; // 너 프로젝트에 맞게 .ts/.js만 맞춰

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "PUT") return res.status(405).send("Method Not Allowed");

  try {
    const me = await getMe(req);

    // ✅ friendCode / friend_code 둘 다 대응
    const friendCode = (me as any).friendCode ?? (me as any).friend_code;
    if (!friendCode) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const nickname = String((req.body as any)?.nickname ?? "").trim();

    // ⚠️ 여기 테이블/컬럼은 /api/me/share-mode와 동일한 테이블로 맞춰야 함
    await sql`
      update me
      set nickname = ${nickname}
      where friend_code = ${friendCode}
    `;

    return res.status(200).json({ ok: true, nickname });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
}
