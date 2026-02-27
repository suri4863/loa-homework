import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TodoTracker.css";

import type { TodoState, Character, TaskRow, TodoTable, RestGauges, CellValue, GridValues } from "../store/todoStore";
import BidPopover from "../components/BidPopover";

// =========================
// ✅ Vercel 서버리스 API 모드 (Vercel 환경변수 VITE_SERVER_MODE=1)
// =========================
const SERVER_MODE = (import.meta as any).env?.VITE_SERVER_MODE === "1";


import {
  DEFAULT_TODO_STATE,
  LEVEL_PERIODS,
  applyAutoResetIfNeeded,
  runDailyResetNow,
  createCharacter,
  createTask,
  exportStateToJson,
  importStateFromJson,
  resetByPeriod,
  getActiveTable,
  getTableById,
  getCellByTableId,
  setCellByTableId,
  exportRaidLeftSnapshot,
  importRaidLeftSnapshot,

} from "../store/todoStore";

// ✅ 계정 요일별 콘텐츠 (06:00 리셋 기준)
const getAccountDailyKey = (tableId: string) => `loa-account-daily:v1:${tableId}`;


// 0=일,1=월,...6=토
const WEEKLY_ACCOUNT_CONTENT: Record<number, { id: string; label: string }[]> = {
  0: [
    { id: "CAGE", label: "카게" },
    { id: "FBOSS", label: "필보" },
  ],
  1: [{ id: "CAGE", label: "카게" }],
  2: [{ id: "FBOSS", label: "필보" }],
  3: [], // 수요일 없음
  4: [{ id: "CAGE", label: "카게" }],
  5: [{ id: "FBOSS", label: "필보" }],
  6: [{ id: "CAGE", label: "카게" }],
};


function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatLocalDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** ✅ 로아 기준 '게임 날짜' (매일 resetHour시 시작) */
function getLoaGameDate(resetHour: number) {
  const now = new Date();
  const gameDate = new Date(now);
  if (now.getHours() < resetHour) {
    gameDate.setDate(gameDate.getDate() - 1);
  }
  return gameDate;
}


type Tab = "DAILY" | "WEEKLY" | "NONE" | "ALL" | "RAID_LEFT";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/* =======================
   아제나 만료 유틸
======================= */
function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function fromDatetimeLocalValue(v: string) {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function formatKoreanDateTime(iso: string) {
  const d = new Date(iso);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dow}) ${String(d.getHours()).padStart(
    2,
    "0"
  )}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function clearExpiredAzena(prev: TodoState): TodoState {
  const now = Date.now();

  const nextTables = prev.tables.map((tbl) => {
    const nextChars = tbl.characters.map((c: any) => {
      const enabled = Boolean(c.azenaEnabled);
      const expiresAt = c.azenaExpiresAt as string | null | undefined;
      if (!enabled || !expiresAt) return c;

      const t = new Date(expiresAt).getTime();
      if (Number.isFinite(t) && t <= now) {
        return { ...c, azenaEnabled: false, azenaExpiresAt: null };
      }
      return c;
    });

    const changed =
      nextChars.length !== tbl.characters.length || nextChars.some((c, i) => c !== (tbl.characters as any[])[i]);

    return changed ? ({ ...tbl, characters: nextChars } as TodoTable) : tbl;
  });

  const tablesChanged = nextTables.some((t, i) => t !== prev.tables[i]);
  return tablesChanged ? { ...prev, tables: nextTables } : prev;
}

function getNextAzenaExpiryMs(state: TodoState): number | null {
  const now = Date.now();
  const times: number[] = [];

  for (const tbl of state.tables) {
    for (const c of tbl.characters as any[]) {
      if (c.azenaEnabled && c.azenaExpiresAt) {
        const t = new Date(c.azenaExpiresAt).getTime();
        if (Number.isFinite(t) && t > now) times.push(t);
      }
    }
  }

  if (!times.length) return null;
  times.sort((a, b) => a - b);
  return times[0];
}

export default function TodoTracker() {
  const [state, setState] = useState<TodoState>(() => {
    const loaded = DEFAULT_TODO_STATE.load();
    return loaded ?? DEFAULT_TODO_STATE.make();
  });
  // ✅ 로아 6시(또는 설정된) 기준으로 요일별 콘텐츠 처리
  const resetHour = state.reset?.dailyResetHour ?? 6;

  // 06:00 경계 넘어가면 리렌더 트리거(최대 30초 지연)
  const [tick, forceTick] = useState(0);
  // ✅ 오른쪽에 같이 볼 표(기존 표 선택)
  const [secondaryTableId, setSecondaryTableId] = useState<string>("");

  // =========================
  // ✅ Theme (light/dark)
  // =========================
  type Theme = "light" | "dark";
  const THEME_KEY = "todoTheme";

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));


  // =========================
  // ✅ 친구/공유 (컴포넌트 스코프)
  // =========================
  const [raidLeftView, setRaidLeftView] = useState<"ME" | "FRIEND">("ME");
  const [selectedFriendCode, setSelectedFriendCode] = useState<string>("");

  // =========================
  // ✅ 서버 친구/요청 (SERVER_MODE일 때만)
  // =========================
  const [incomingReqs, setIncomingReqs] = useState<
    { id: number; fromFriendCode: string; createdAt: string }[]
  >([]);
  const [syncingFriends, setSyncingFriends] = useState(false);

  // ✅ 닉네임 저장 UX 상태
  const [nickSaveState, setNickSaveState] = useState<"idle" | "typing" | "saving" | "saved" | "error">("idle");
  const nickSaveTimerRef = useRef<number | null>(null);
  const nickLastSentRef = useRef<string>("");
  useEffect(() => {
    return () => {
      if (nickSaveTimerRef.current) {
        window.clearTimeout(nickSaveTimerRef.current);
      }
    };
  }, []);

  async function apiFetch2(path: string, init?: RequestInit) {
    // ✅ "/api/..." 형태 강제 (상대경로로 /todo/api... 되는 것 방지)
    const safePath =
      /^https?:\/\//.test(path) ? path : path.startsWith("/") ? path : `/${path}`;

    const headers = new Headers(init?.headers || {});
    headers.set("Content-Type", "application/json");
    headers.set("x-friend-code", state.profile.friendCode);

    const nickRaw = ((state.profile.nickname || "").trim() || state.profile.friendCode).trim();
    // ✅ 한글/특수문자 헤더 안전 전송
    headers.set("x-nickname", encodeURIComponent(nickRaw));


    const res = await fetch(safePath, { ...init, headers });

    if (!res.ok) {
      const ct = res.headers.get("content-type") || "";
      const bodyText = await res.text().catch(() => "");

      // ✅ 서버가 JSON 에러를 주면 더 보기 좋게
      if (ct.includes("application/json")) {
        try {
          const j = JSON.parse(bodyText);
          throw new Error(`${res.status} ${j?.error || j?.message || JSON.stringify(j)}`);
        } catch {
          // JSON 파싱 실패 시 텍스트로 fallback
        }
      }

      throw new Error(`${res.status} ${bodyText || res.statusText}`);
    }

    if (res.status === 204) return null as any;

    // ✅ 성공 응답도 content-type 보고 처리
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return (await res.text()) as any;
  }

  function renderFriendRaidLeftColumns() {
    if (!selectedFriendCode) return <div className="todo-hint">친구를 선택해줘.</div>;

    const f = state.friends.find((x) => x.code === selectedFriendCode);
    if (!f) return <div className="todo-hint">친구를 찾을 수 없어.</div>;

    const snap: any = (f as any).lastSnapshot;
    if (!snap?.data) return <div className="todo-hint">친구 스냅샷이 없어. (서버에서 불러오기 또는 스냅샷 붙여넣기)</div>;
    if (snap.shareMode === "PRIVATE") return <div className="todo-hint">친구가 비공개야.</div>;

    const rows = (snap.data as any[]).filter((r) => r && r.charName);

    if (!rows.length) return <div className="todo-hint">✅ 친구는 상위 3개 레이드가 전부 완료된 상태야.</div>;

    return (
      <div className="raidLeftColsWrap">
        <div className="raidLeftColsTitle">친구 남은 레이드</div>

        <div className="raidLeftCols">
          {rows.map((row: any) => {
            const raids = Array.isArray(row.remainingRaids) ? row.remainingRaids.slice(0, 3) : [];
            return (
              <div key={`${row.tableName ?? ""}-${row.charName}`} className="raidLeftColCard">
                <div className="raidLeftColHeader">
                  <div className="raidLeftColHeaderLeft">
                    <div className="raidLeftColName">{row.charName}</div>

                    {(row.charItemLevel || row.charPower) ? (
                      <div className="raidLeftColMeta">
                        {row.charItemLevel ? (
                          <span className="raidBadge ilvl">Lv {row.charItemLevel}</span>
                        ) : null}

                        {row.charPower ? (
                          <span className="raidBadge power">전투력 {row.charPower}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {row.tableName ? <div className="raidLeftColSub">{row.tableName}</div> : null}
                </div>

                <div className="raidLeftColBody">
                  {raids.length ? (
                    raids.map((r: string, i: number) => (
                      <div key={`${row.charName}-${i}`} className="raidLeftColItem">
                        {r}
                      </div>
                    ))
                  ) : (
                    <div className="raidLeftColEmpty">-</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }



  async function refreshFriends() {
    if (!SERVER_MODE) return;
    setSyncingFriends(true);
    try {
      const friendsRes = await apiFetch2("/api/friends");
      const incomingRes = await apiFetch2("/api/friend-requests/incoming");

      const friendsArr = Array.isArray(friendsRes)
        ? friendsRes
        : Array.isArray((friendsRes as any)?.friends)
          ? (friendsRes as any).friends
          : [];

      const incomingArr = Array.isArray(incomingRes)
        ? incomingRes
        : Array.isArray((incomingRes as any)?.incoming)
          ? (incomingRes as any).incoming
          : [];

      setState((prev) => ({
        ...prev,
        friends: friendsArr.map((f: any) => ({
          code: String(f.friendCode ?? f.code ?? "").trim(),
          nickname: String(f.nickname ?? f.alias ?? f.friendCode ?? f.code ?? "").trim(),
          addedAt: Date.now(),
        })).filter((x: any) => x.code),
      }));

      setIncomingReqs(incomingArr);
    } finally {
      setSyncingFriends(false);
    }
  }


  useEffect(() => {
    if (!SERVER_MODE) return;
    refreshFriends().catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  async function setShareMode(mode: "PUBLIC" | "PRIVATE") {
    setState((prev) => ({ ...prev, profile: { ...prev.profile, shareMode: mode } }));
    if (!SERVER_MODE) return;
    await apiFetch2("/api/me/share-mode", {
      method: "PUT",
      body: JSON.stringify({ shareMode: mode }),
    });
  }

  function setMyNickname(nickname: string) {
    // 1) 로컬 state는 즉시 반영
    setState((prev) => ({ ...prev, profile: { ...prev.profile, nickname } }));
    setNickSaveState("typing");

    // 2) 로컬모드면 “로컬 저장됨” 느낌만 주고 끝
    if (!SERVER_MODE) {
      // 타이핑 멈추면 저장완료 배지 뜨게
      if (nickSaveTimerRef.current) window.clearTimeout(nickSaveTimerRef.current);
      nickSaveTimerRef.current = window.setTimeout(() => {
        setNickSaveState("saved");
        // 1.2초 뒤 표시 원복
        // window.setTimeout(() => setNickSaveState("idle"), 1200);
      }, 400);
      return;
    }

    // 3) 서버모드면 디바운스로 PUT (너무 자주 호출 방지)
    if (nickSaveTimerRef.current) window.clearTimeout(nickSaveTimerRef.current);

    nickSaveTimerRef.current = window.setTimeout(async () => {
      const trimmed = (nickname ?? "").trim();

      // 같은 값이면 서버 호출 스킵
      if (trimmed === nickLastSentRef.current) {
        setNickSaveState("saved");
        window.setTimeout(() => setNickSaveState("idle"), 1200);
        return;
      }

      setNickSaveState("saving");
      try {
        await apiFetch2("/api/me/nickname", {
          method: "PUT",
          body: JSON.stringify({ nickname: trimmed }),
        });
        nickLastSentRef.current = trimmed;
        setNickSaveState("saved");
        window.setTimeout(() => setNickSaveState("idle"), 1200);
      } catch (e) {
        setNickSaveState("error");
        // 실패 표시 잠깐 유지
        window.setTimeout(() => setNickSaveState("idle"), 2000);
      }
    }, 600);
  }



  function addFriend(code: string, nickname: string) {
    const c = code.trim();
    const n = nickname.trim() || c;
    if (!c) return;

    setState((prev) => {
      const exists = prev.friends.some((f) => f.code === c);
      if (exists) return prev;
      return { ...prev, friends: [...prev.friends, { code: c, nickname: n, addedAt: Date.now() }] };
    });
  }

  function attachSnapshotToFriend(snapshotRaw: string, targetFriendCode?: string) {
    let snap;
    try {
      snap = importRaidLeftSnapshot(snapshotRaw);
    } catch {
      alert("스냅샷 JSON 형식이 올바르지 않아");
      return;
    }

    if (snap.shareMode === "PRIVATE") {
      alert("친구가 비공개로 설정했어. 확인 불가!");
      return;
    }

    // ✅ 서버에서 불러온 친구코드를 우선 사용 (없으면 스냅샷 주인 코드)
    const codeToAttach = (targetFriendCode || snap.friendCode || "").trim();

    if (!codeToAttach) {
      alert("친구 코드가 비어있어. 스냅샷을 연결할 수 없어");
      return;
    }

    setState((prev) => {
      const idx = prev.friends.findIndex((f) => f.code === codeToAttach);
      if (idx < 0) {
        return {
          ...prev,
          friends: [
            ...prev.friends,
            { code: codeToAttach, nickname: codeToAttach, addedAt: Date.now(), lastSnapshot: snap },
          ],
        };
      }
      const nextFriends = [...prev.friends];
      nextFriends[idx] = { ...nextFriends[idx], lastSnapshot: snap };
      return { ...prev, friends: nextFriends };
    });
  }

  function renderFriendRaidLeft() {
    const f = state.friends.find((x) => x.code === selectedFriendCode);
    if (!f) return <div className="todo-hint">친구를 선택해줘.</div>;
    if (!f.lastSnapshot) return <div className="todo-hint">친구 스냅샷이 없어. 스냅샷을 붙여넣어줘.</div>;
    if (f.lastSnapshot.shareMode === "PRIVATE") return <div className="todo-hint">친구가 비공개야.</div>;

    return (
      <div className="friendRaidGrid">
        {f.lastSnapshot.data.map((row, idx) => {
          if (idx === 0) console.log("[friend snapshot row0]", row);
          return (
            <div key={row.charName} className="friendRaidCard">
              <div className="friendRaidHead">
                <div className="friendRaidName">
                  {row.charName}

                  {!!row.charItemLevel && (
                    <span className="friendRaidIlvl">{row.charItemLevel}</span>
                  )}

                  {!!row.charPower && (
                    <span className="friendRaidPower">전투력 {row.charPower}</span>
                  )}
                </div>
                <div className="friendRaidMeta">
                  {!!row.tableName && <div className="friendRaidTable">{row.tableName}</div>}
                  <div>
                    {row.clearedCount}/{row.totalCount}
                  </div>
                </div>
              </div>

              {row.remainingRaids.length === 0 ? (
                <div className="friendRaidDone">이번 주 레이드 끝!</div>
              ) : (
                <ul className="friendRaidList">
                  {row.remainingRaids.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    );
  }


  useEffect(() => {
    const t = setInterval(() => forceTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);


  const loaGameDate = useMemo(() => getLoaGameDate(resetHour), [resetHour]);
  const loaDateKey = useMemo(() => formatLocalDateKey(loaGameDate), [loaGameDate]);
  const loaWeekday = useMemo(() => loaGameDate.getDay(), [loaGameDate]);
  const todayAccountContents = useMemo(() => WEEKLY_ACCOUNT_CONTENT[loaWeekday] ?? [], [loaWeekday]);


  // ✅ 계정 콘텐츠 체크(카게/필보): tableId별로 저장/로드 (06:00 리셋 기준)
  const [accountChecksByTable, setAccountChecksByTable] = useState<Record<string, Record<string, boolean>>>({});

  function readAccountChecks(tableId: string): Record<string, boolean> {
    try {
      const raw = localStorage.getItem(getAccountDailyKey(tableId));
      if (!raw) return {};
      const parsed = JSON.parse(raw) as { dateKey?: string; checks?: Record<string, boolean> };
      if (parsed?.dateKey === loaDateKey && parsed?.checks) return parsed.checks;
      return {};
    } catch {
      return {};
    }
  }

  function writeAccountChecks(tableId: string, checks: Record<string, boolean>) {
    try {
      localStorage.setItem(getAccountDailyKey(tableId), JSON.stringify({ dateKey: loaDateKey, checks }));
    } catch {
      // ignore
    }
  }

  // 현재 화면에 보이는 tableId(왼쪽/오른쪽)의 체크를 로드
  useEffect(() => {
    const ids = [state.activeTableId, secondaryTableId].filter(Boolean) as string[];
    setAccountChecksByTable((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = readAccountChecks(id);
      return next;
    });
  }, [loaDateKey, state.activeTableId, secondaryTableId]);

  function onToggleAccountCheck(tableId: string, id: string, checked: boolean) {
    setAccountChecksByTable((prev) => {
      const current = prev[tableId] ?? {};
      const nextChecks = { ...current, [id]: checked };
      const next = { ...prev, [tableId]: nextChecks };
      // ✅ 클릭 순간 즉시 저장
      writeAccountChecks(tableId, nextChecks);
      return next;
    });
  }

  //생명의 기운(생기)(생기)
  const LIFE_MAX = 10500;
  const LIFE_STEP = 30;
  const LIFE_STEP_MS = 10 * 60 * 1000; // 10분

  type LifeEnergyBase = { value: number; updatedAt: number };

  function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  function calcLifeEnergyNow(base: LifeEnergyBase | null, nowMs: number) {
    if (!base) return { now: 0, gained: 0 };

    const elapsed = Math.max(0, nowMs - base.updatedAt);
    const steps = Math.floor(elapsed / LIFE_STEP_MS);
    const gained = steps * LIFE_STEP;
    const now = clampInt(base.value + gained, 0, LIFE_MAX);

    return { now, gained };
  }

  function calcTimeToFull(base: LifeEnergyBase | null, nowMs: number) {
    if (!base) return null;

    const { now } = calcLifeEnergyNow(base, nowMs);
    if (now >= LIFE_MAX) return 0; // 이미 풀충

    const remainingEnergy = LIFE_MAX - now;

    // 남은 스텝 수 (30 단위)
    const stepsNeeded = Math.ceil(remainingEnergy / LIFE_STEP);

    // 마지막 기준시점 이후 "현재 스텝 진행도" 고려
    const elapsed = Math.max(0, nowMs - base.updatedAt);
    const remainderMs = elapsed % LIFE_STEP_MS;

    // 다음 스텝까지 남은 시간
    const firstStepMs = remainderMs === 0 ? LIFE_STEP_MS : LIFE_STEP_MS - remainderMs;

    // 총 남은 시간
    const totalMs =
      firstStepMs + (stepsNeeded - 1) * LIFE_STEP_MS;

    return totalMs;
  }
  // 풀충 시간
  function formatMsToHHMM(ms: number | null) {
    if (ms == null) return "";

    if (ms <= 0) return "풀충 상태";

    const totalMinutes = Math.ceil(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) return `${hours}시간 ${minutes}분`;
    return `${minutes}분`;
  }

  // 풀충 날짜
  function formatEtaKorean(timeToFullMs: number | null) {
    if (timeToFullMs == null) return "-";
    if (timeToFullMs <= 0) return "이미 풀충";

    const eta = new Date(Date.now() + timeToFullMs);

    const hh = eta.getHours().toString().padStart(2, "0");
    const mm = eta.getMinutes().toString().padStart(2, "0");

    const today = new Date();
    const isToday =
      eta.getFullYear() === today.getFullYear() &&
      eta.getMonth() === today.getMonth() &&
      eta.getDate() === today.getDate();

    return isToday ? `오늘 ${hh}:${mm}` : `${eta.getMonth() + 1}/${eta.getDate()} ${hh}:${mm}`;
  }

  function formatEtaFullKorean(timeToFullMs: number | null) {
    if (timeToFullMs == null) return "-";
    if (timeToFullMs <= 0) return "이미 풀충";

    const eta = new Date(Date.now() + timeToFullMs);

    const month = eta.getMonth() + 1;
    const date = eta.getDate();

    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const weekday = weekdays[eta.getDay()];

    let hours = eta.getHours();
    const minutes = eta.getMinutes().toString().padStart(2, "0");

    const isAM = hours < 12;
    const ampm = isAM ? "오전" : "오후";

    // 12시간제로 변환
    hours = hours % 12;
    if (hours === 0) hours = 12;

    return `${month}월 ${date}일(${weekday}) ${ampm} ${hours}:${minutes}`;
  }

  const activeTable = useMemo(() => getActiveTable(state), [state]);
  const activeCharacters = activeTable.characters;

  // 생기
  function AccountDailyPanel({ tableId }: { tableId: string }) {
    const lifeKey = useMemo(() => `loa-life-energy:v1:${tableId}`, [tableId]);

    // ✅ 최초 렌더에서 바로 로드 (새로고침 유지)
    const [lifeBase, setLifeBase] = useState<LifeEnergyBase | null>(() => {
      try {
        const raw = localStorage.getItem(`loa-life-energy:v1:${tableId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as LifeEnergyBase;
        if (typeof parsed?.value === "number" && typeof parsed?.updatedAt === "number") return parsed;
        return null;
      } catch {
        return null;
      }
    });

    // ✅ tableId 바뀔 때 재로드
    useEffect(() => {
      try {
        const raw = localStorage.getItem(lifeKey);
        if (!raw) {
          setLifeBase(null);
          return;
        }
        const parsed = JSON.parse(raw) as LifeEnergyBase;
        if (typeof parsed?.value === "number" && typeof parsed?.updatedAt === "number") {
          setLifeBase(parsed);
        } else {
          setLifeBase(null);
        }
      } catch {
        setLifeBase(null);
      }
    }, [lifeKey]);

    // ✅ 저장
    useEffect(() => {
      try {
        if (!lifeBase) {
          localStorage.removeItem(lifeKey);
        } else {
          localStorage.setItem(lifeKey, JSON.stringify(lifeBase));
        }
      } catch {
        // ignore
      }
    }, [lifeKey, lifeBase]);

    // 표시용
    const lifeView = useMemo(() => {
      const nowMs = Date.now();
      return {
        ...calcLifeEnergyNow(lifeBase, nowMs),
        timeToFull: calcTimeToFull(lifeBase, nowMs),
      };
    }, [lifeBase, tick]);

    return (
      <div className="accountDailyBox">
        <div className="accountDailyTitle">계정 콘텐츠</div>

        {/* ✅ 생명의 기운(항상 표시) */}
        <div className="lifeBox">
          <div className="lifeTop">
            <b>생명의 기운 </b>
            <span className="lifeNum">
              {lifeView.now.toLocaleString()} / {LIFE_MAX.toLocaleString()}
            </span>
          </div>
          <div className="lifeEta">풀충 예상: {formatEtaFullKorean(lifeView.timeToFull)}</div>

          <div className="lifeBar">
            <div className="lifeFill" style={{ width: `${(lifeView.now / LIFE_MAX) * 100}%` }} />
          </div>

          <div className="lifeInputRow">
            <span className="lifeHint">지금 생기 값 입력 </span>
            <input
              className="lifeInput"
              type="number"
              min={0}
              max={LIFE_MAX}
              value={lifeBase?.value ?? ""}
              placeholder="예: 5000"
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  setLifeBase(null);
                  return;
                }
                const num = clampInt(parseInt(v, 10) || 0, 0, LIFE_MAX);
                setLifeBase({ value: num, updatedAt: Date.now() });
              }}
            />
            <button
              className="mini"
              onClick={() => {
                if (!lifeBase) return;
                setLifeBase({ value: lifeBase.value, updatedAt: Date.now() });
              }}
              disabled={!lifeBase}
            >
              지금 기준
            </button>
          </div>
        </div>

        {/* ✅ 요일별(카게/필보) */}
        {todayAccountContents.length > 0 ? (
          <div className="accountDailyItems">
            {todayAccountContents.map((c) => (
              <label key={c.id} className="accountDailyItem">
                <input
                  type="checkbox"
                  checked={!!(accountChecksByTable[tableId]?.[c.id])}
                  onChange={(e) => onToggleAccountCheck(tableId, c.id, e.target.checked)}
                />
                <span>{c.label}</span>
                <div className="accountDailyEmpty">잊지말고 신년운세 하기!</div>
              </label>
            ))}
          </div>
        ) : (
          <div className="accountDailyEmpty">카게/필보 없음 잊지말고 신년운세 하기!</div>
        )}
      </div>
    );
  }

  const [dragCharId, setDragCharId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  // ✅ 터치 환경 감지
  const isTouch =
    typeof window !== "undefined" && ("ontouchstart" in window || (navigator as any).maxTouchPoints > 0);

  const [periodTab, setPeriodTab] = useState<Tab>("ALL");
  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  // =========================
  // 아제나 모달 (표ID 포함)
  // =========================
  type AzenaModalState = { open: boolean; tableId: string | null; charId: string | null; value: string };
  const [azenaModal, setAzenaModal] = useState<AzenaModalState>({
    open: false,
    tableId: null,
    charId: null,
    value: "",
  });

  function onToggleAzena(tableId: string, charId: string, checked: boolean) {
    if (!checked) {
      // 수동 해제
      setState((prev) => {
        const cleared = clearExpiredAzena(prev);
        const table = getTableById(cleared, tableId);

        const nextChars = table.characters.map((c: any) =>
          c.id === charId ? ({ ...c, azenaEnabled: false, azenaExpiresAt: null } as any) : c
        );

        const nextTable: TodoTable = { ...table, characters: nextChars };
        return {
          ...cleared,
          tables: cleared.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
        };
      });
      return;
    }

    // 체크하려는 경우: 만료시각 입력 모달
    setAzenaModal({
      open: true,
      tableId,
      charId,
      value: toDatetimeLocalValue(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)),
    });
  }

  function confirmAzena() {
    const iso = fromDatetimeLocalValue(azenaModal.value);
    if (!iso || !azenaModal.charId || !azenaModal.tableId) {
      setAzenaModal({ open: false, tableId: null, charId: null, value: "" });
      return;
    }

    setState((prev) => {
      const cleared = clearExpiredAzena(prev);
      const table = getTableById(cleared, azenaModal.tableId!);

      const nextChars = table.characters.map((c: any) =>
        c.id === azenaModal.charId ? ({ ...c, azenaEnabled: true, azenaExpiresAt: iso } as any) : c
      );

      const nextTable: TodoTable = { ...table, characters: nextChars };
      return {
        ...cleared,
        tables: cleared.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
      };
    });

    setAzenaModal({ open: false, tableId: null, charId: null, value: "" });
  }

  function cancelAzena() {
    setAzenaModal({ open: false, tableId: null, charId: null, value: "" });
  }

  // ✅ 아제나 만료: 앱 켜져있을 때 정확히 그 시각에 자동 해제 + 포커스 복귀 보정
  useEffect(() => {
    // 즉시 한 번 정리
    setState((prev) => clearExpiredAzena(prev));

    const next = getNextAzenaExpiryMs(state);
    if (!next) return;

    const id = window.setTimeout(() => {
      setState((prev) => clearExpiredAzena(prev));
    }, Math.max(0, next - Date.now()));

    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tables, state.activeTableId]);

  useEffect(() => {
    const sync = () => setState((prev) => clearExpiredAzena(prev));
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // ✅ 앱 시작 시 1회 자동 리셋 체크
  useEffect(() => {
    setState((prev) => clearExpiredAzena(applyAutoResetIfNeeded(prev)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 앱 켜둔 채로 6시 넘어가도 반영되게 1분마다 체크
  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => clearExpiredAzena(applyAutoResetIfNeeded(prev)));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // ✅ 자동 저장
  useEffect(() => {
    DEFAULT_TODO_STATE.save(state);
  }, [state]);

  // =========================
  // 표(페이지) 관리
  // =========================
  function setActiveTableId(id: string) {
    setState((prev) => ({ ...prev, activeTableId: id }));
  }

  function addTable() {
    const name = prompt("새 표 이름(예: 본캐/부캐/2원정대)")?.trim();
    if (!name) return;

    const tbl: TodoTable = {
      id: uid("tbl"),
      name,
      characters: [],
      values: {},
      restGauges: {},
    };

    setState((prev) => ({
      ...prev,
      tables: [...prev.tables, tbl],
      activeTableId: tbl.id,
    }));
  }

  function renameTable() {
    const cur = getActiveTable(state);
    const name = prompt("표 이름 변경", cur.name)?.trim();
    if (!name || name === cur.name) return;

    setState((prev) => ({
      ...prev,
      tables: prev.tables.map((t) => (t.id === cur.id ? { ...t, name } : t)),
    }));
  }


  function deleteTable() {
    if (state.tables.length <= 1) {
      alert("표는 최소 1개는 있어야 해요.");
      return;
    }
    const activeTable = getActiveTable(state);
    if (!confirm(`'${activeTable.name}' 표를 삭제할까요? (표 안의 데이터도 삭제됨)`)) return;

    setState((prev) => {
      const nextTables = prev.tables.filter((t) => t.id !== prev.activeTableId);
      const nextActive = nextTables[0].id;

      // secondary가 삭제된 표를 가리키면 닫기
      if (secondaryTableId && !nextTables.some((t) => t.id === secondaryTableId)) {
        setSecondaryTableId("");
      }

      return { ...prev, tables: nextTables, activeTableId: nextActive };
    });
  }

  // =========================
  // 캐릭터 CRUD (activeTable 기준)
  // =========================
  function addCharacter() {
    const name = prompt("캐릭터 이름")?.trim();
    if (!name) return;
    const itemLevel = prompt("아이템레벨 (예: 1712.5)", "")?.trim() ?? "";
    const power = prompt("전투력 (예: 2500+)", "")?.trim() ?? "";

    const next: Character = createCharacter({ name, itemLevel, power });

    setState((prev) => {
      const table = getActiveTable(prev);

      const restGauges: RestGauges = { ...(table.restGauges ?? {}) };
      restGauges[next.id] = { chaos: 0, guardian: 0 };

      const nextTable: TodoTable = {
        ...table,
        characters: [...table.characters, next],
        restGauges,
      };

      return {
        ...prev,
        tables: prev.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
      };
    });
  }

  function editCharacter(ch: Character) {
    const name = prompt("캐릭터 이름", ch.name)?.trim();
    if (!name) return;
    const itemLevel = prompt("아이템레벨", ch.itemLevel ?? "")?.trim() ?? "";
    const power = prompt("전투력", ch.power ?? "")?.trim() ?? "";

    setState((prev) => {
      const table = getActiveTable(prev);

      const nextChars = table.characters.map((c) => (c.id === ch.id ? { ...c, name, itemLevel, power } : c));
      const nextTable: TodoTable = { ...table, characters: nextChars };

      return { ...prev, tables: prev.tables.map((t) => (t.id === nextTable.id ? nextTable : t)) };
    });
  }

  function deleteCharacter(ch: Character) {
    if (!confirm(`'${ch.name}' 캐릭터를 삭제할까요? (해당 캐릭터의 체크 데이터도 제거됨)`)) return;

    setState((prev) => {
      const table = getActiveTable(prev);

      const nextChars = table.characters.filter((c) => c.id !== ch.id);

      const values = { ...(table.values ?? {}) };
      for (const taskId of Object.keys(values)) {
        const row = { ...(values[taskId] ?? {}) };
        delete row[ch.id];
        values[taskId] = row;
      }

      const restGauges = { ...(table.restGauges ?? {}) };
      delete restGauges[ch.id];

      const nextTable: TodoTable = { ...table, characters: nextChars, values, restGauges };

      return { ...prev, tables: prev.tables.map((t) => (t.id === nextTable.id ? nextTable : t)) };
    });
  }

  // =========================
  // 숙제 CRUD (템플릿 공유: state.tasks)
  // =========================
  function addTask(period: "DAILY" | "WEEKLY" | "NONE") {
    const label = period === "DAILY" ? "일일" : period === "WEEKLY" ? "주간" : "기타";
    const title = prompt(`${label} 숙제 이름`)?.trim();
    if (!title) return;

    // ✅ 해금/금제는 “티켓형 UI”니까 cellType TEXT로 강제
    const isTicketTitle = title.includes("해금") || title.includes("금제");

    const defaultType = period === "NONE" ? "TEXT" : "CHECK";
    const cellType = isTicketTitle
      ? "TEXT"
      : ((prompt("셀 타입: CHECK / COUNTER / TEXT / SELECT", defaultType) ?? defaultType)
        .trim()
        .toUpperCase());

    let max: number | undefined = undefined;
    let options: string[] | undefined = undefined;

    if (cellType === "COUNTER") {
      const m = prompt("카운터 최대치(예: 2)")?.trim();
      max = m ? Math.max(1, Number(m)) : 2;
    } else if (cellType === "SELECT") {
      const raw = prompt("선택 옵션을 콤마로 입력 (예: 상,중,하)", "상,중,하")?.trim() ?? "";
      options = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (!options.length) options = ["완료", "미완"];
    }

    const sectionDefault =
      period === "DAILY" ? "일일 숙제" : period === "WEEKLY" ? "주간 레이드" : "기타";

    // ✅ 티켓형이면 섹션도 기본 “기타” 추천 (원하면 prompt 생략 가능)
    const section = isTicketTitle
      ? "기타"
      : (prompt("섹션 이름(예: 일일 숙제 / 주간 레이드 / 기타)", sectionDefault)?.trim() || sectionDefault);

    const t = createTask({
      title,
      period: period as any,
      cellType: cellType as any,
      max,
      options,
      section,
    });

    setState((prev) => ({ ...prev, tasks: [...prev.tasks, t] }));
  }


  function editTask(task: TaskRow) {
    const title = prompt("숙제 이름", task.title)?.trim();
    if (!title) return;
    const section = prompt("섹션", task.section ?? "숙제")?.trim() || "숙제";

    let max = task.max;
    let options = task.options;

    if (task.cellType === "COUNTER") {
      const m = prompt("카운터 최대치", String(task.max ?? 2))?.trim();
      max = m ? Math.max(1, Number(m)) : 2;
    }
    if (task.cellType === "SELECT") {
      const raw = prompt("옵션(콤마 구분)", (task.options ?? []).join(","))?.trim() ?? "";
      options = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (!options.length) options = ["완료", "미완"];
    }

    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, title, section, max, options } : t)),
    }));
  }

  function deleteTask(task: TaskRow) {
    if (!confirm(`'${task.title}' 숙제를 삭제할까요? (모든 표의 해당 숙제 데이터도 삭제됨)`)) return;

    setState((prev) => {
      const nextTasks = prev.tasks.filter((t) => t.id !== task.id);

      const nextTables = prev.tables.map((tbl) => {
        const values = { ...(tbl.values ?? {}) };
        delete values[task.id];
        return { ...tbl, values };
      });

      return { ...prev, tasks: nextTasks, tables: nextTables };
    });
  }

  // =========================
  // 셀 동작 (tableId 기준)
  // =========================
  function onCellClick(tableId: string, task: TaskRow, ch: Character) {
    setState((prev) => {
      const cell = getCellByTableId(prev, tableId, task.id, ch.id);

      if (task.cellType === "CHECK") {
        const nextChecked = !(cell?.type === "CHECK" ? cell.checked : false);
        return setCellByTableId(prev, tableId, task, ch, {
          type: "CHECK",
          checked: nextChecked,
          updatedAt: Date.now(),
        });
      }

      if (task.cellType === "COUNTER") {
        const max = Math.max(1, task.max ?? 1);
        const cur = cell?.type === "COUNTER" ? (cell.count ?? 0) : 0;
        const next = cur >= max ? 0 : cur + 1;

        return setCellByTableId(prev, tableId, task, ch, {
          type: "COUNTER",
          count: next,
          updatedAt: Date.now(),
        });
      }

      return prev;
    });
  }

  function onTextChange(tableId: string, task: TaskRow, ch: Character, text: string) {
    setState((prev) => setCellByTableId(prev, tableId, task, ch, { type: "TEXT", text, updatedAt: Date.now() }));
  }

  function onSelectChange(tableId: string, task: TaskRow, ch: Character, value: string) {
    setState((prev) => setCellByTableId(prev, tableId, task, ch, { type: "SELECT", value, updatedAt: Date.now() }));
  }

  function showExport(json: string) {
    const w = window.open("", "_blank", "width=600,height=600");
    if (!w) return;
    w.document.write(`<textarea style="width:100%;height:100%;">${json}</textarea>`);
    w.document.close();
  }

  function doExport() {
    showExport(exportStateToJson(state));
  }

  function doImport() {
    const raw = prompt("백업 JSON을 붙여넣으세요");
    if (!raw) return;
    try {
      const next = importStateFromJson(raw);
      setState(next);
      alert("가져오기 완료!");
    } catch {
      alert("가져오기 실패: JSON 형식을 확인해주세요.");
    }
  }

  function manualReset(period: "DAILY" | "WEEKLY") {
    if (!confirm(`${period === "DAILY" ? "일일" : "주간"} 데이터를 초기화할까요?`)) return;

    if (period === "DAILY") {
      setState((prev) => runDailyResetNow(prev, true));
      return;
    }
    setState((prev) => resetByPeriod(prev, "WEEKLY", true));
  }

  function reorderCharacters(tableId: string, fromId: string, toId: string) {
    if (fromId === toId) return;

    setState((prev) => {
      const table = getTableById(prev, tableId);
      const list = [...table.characters];

      const fromIdx = list.findIndex((c) => c.id === fromId);
      const toIdx = list.findIndex((c) => c.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;

      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);

      const nextTable: TodoTable = { ...table, characters: list };
      return {
        ...prev,
        tables: prev.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
      };
    });
  }

  // =========================
  // 주간 레이드 골드 계산용 데이터 & 유틸
  // =========================
  type RaidGold = { normal?: number; hard?: number; nightmare?: number };

  const RAID_CLEAR_GOLD: Record<string, RaidGold> = {
    "베히모스": { normal: 7200 },
    "서막": { normal: 6100, hard: 7200 },
    "1막": { normal: 11500, hard: 18000 },
    "2막": { normal: 16500, hard: 23000 },
    "3막": { normal: 21000, hard: 27000 },
    "4막": { normal: 33000, hard: 42000 },
    "종막": { normal: 40000, hard: 52000 },
    "세르카": { normal: 35000, hard: 44000, nightmare: 54000 },
  };

  type RaidPopup = { title: string; x: number; y: number } | null;
  const [raidGoldPopup, setRaidGoldPopup] = useState<RaidPopup>(null);

  // =========================
  // ✅ Top3 골드: 난이도 선택(캐릭터별 저장) + 팝업
  // =========================
  type DiffName = "노말" | "하드" | "나이트메어";
  type WeeklyTop3Popup =
    | { tableId: string; charId: string; charName: string; ilvl: number; x: number; y: number }
    | null;

  const WEEKLY_DIFF_KEY = "loa-weekly-raid-diff:v1";
  const [weeklyDiffByChar, setWeeklyDiffByChar] = useState<Record<string, Record<string, DiffName>>>({});
  const [weeklyTop3Popup, setWeeklyTop3Popup] = useState<WeeklyTop3Popup>(null);

  function weeklyCharKey(tableId: string, charId: string) {
    return `${tableId}:${charId}`;
  }

  function loadWeeklyDiff(tableId: string, charId: string): Record<string, DiffName> {
    try {
      const raw = localStorage.getItem(`${WEEKLY_DIFF_KEY}:${tableId}:${charId}`);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, DiffName>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveWeeklyDiff(tableId: string, charId: string, diffMap: Record<string, DiffName>) {
    try {
      localStorage.setItem(`${WEEKLY_DIFF_KEY}:${tableId}:${charId}`, JSON.stringify(diffMap));
    } catch { }
  }

  // ✅ 표/캐릭터 바뀔 때 로컬저장 값 선로딩(합산값도 바로 반영되게)
  useEffect(() => {
    const next: Record<string, Record<string, DiffName>> = {};

    for (const tbl of state.tables) {
      for (const ch of tbl.characters as any[]) {
        const k = weeklyCharKey(tbl.id, ch.id);
        next[k] = loadWeeklyDiff(tbl.id, ch.id);
      }
    }

    setWeeklyDiffByChar(next);
  }, [state.tables]);

  const tasks = useMemo(() => {
    // ✅ 남은 레이드: 주간 레이드 섹션만 출력
    if (periodTab === "RAID_LEFT") {
      return state.tasks.filter(
        (t) => t.period === "WEEKLY" && t.section === "주간 레이드"
      );
    }

    if (periodTab === "ALL") return state.tasks;
    return state.tasks.filter((t) => t.period === periodTab);
  }, [periodTab, state.tasks]);

  const SECTION_ORDER: Record<string, number> = {
    "일일 숙제": 1,
    "주간 레이드": 2,
    "주간 교환": 3,
  };

  const WEEKLY_RAID_ORDER: Record<string, number> = {
    "1막": 1,
    "2막": 2,
    "3막": 3,
    "4막": 4,
    "종막": 5,
    "세르카": 6,
  };


  const groupedTasks = useMemo(() => {
    const map = new Map<string, TaskRow[]>();

    for (const t of tasks) {
      const key = (t.section ?? "숙제").trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }

    for (const [sectionRaw, arr] of map.entries()) {
      const section = (sectionRaw ?? "").trim();

      arr.sort((a, b) => {
        if (section === "주간 레이드") {
          const at = (a.title ?? "").trim();
          const bt = (b.title ?? "").trim();
          const ai = WEEKLY_RAID_ORDER[at] ?? 999;
          const bi = WEEKLY_RAID_ORDER[bt] ?? 999;
          if (ai !== bi) return ai - bi;
          return at.localeCompare(bt);
        }

        const ao = a.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return (a.title ?? "").localeCompare(b.title ?? "");
      });
    }

    const entries = Array.from(map.entries());
    entries.sort(([a], [b]) => (SECTION_ORDER[a] ?? 999) - (SECTION_ORDER[b] ?? 999));

    return entries;
  }, [tasks]);


  const weeklyRaidTaskIds = useMemo(() => {
    return state.tasks
      .filter((t) => t.period === "WEEKLY" && t.section === "주간 레이드" && t.cellType === "CHECK")
      .map((t) => t.id);
  }, [state.tasks]);

  function getWeeklyRaidCheckedCount(tableId: string, charId: string) {
    let cnt = 0;
    for (const taskId of weeklyRaidTaskIds) {
      const v = getCellByTableId(state, tableId, taskId, charId);
      if (v && v.type === "CHECK" && v.checked) cnt++;
    }
    return cnt;
  }


  function reorderTaskWithinSection(fromTaskId: string, toTaskId: string) {
    if (fromTaskId === toTaskId) return;

    setState((prev) => {
      const from = prev.tasks.find((t) => t.id === fromTaskId);
      const to = prev.tasks.find((t) => t.id === toTaskId);
      if (!from || !to) return prev;

      const fromSec = from.section ?? "숙제";
      const toSec = to.section ?? "숙제";
      if (fromSec !== toSec) return prev;

      const secTasks = prev.tasks
        .filter((t) => (t.section ?? "숙제") === fromSec)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const fromIdx = secTasks.findIndex((t) => t.id === fromTaskId);
      const toIdx = secTasks.findIndex((t) => t.id === toTaskId);
      if (fromIdx < 0 || toIdx < 0) return prev;

      const nextSecTasks = [...secTasks];
      const [moved] = nextSecTasks.splice(fromIdx, 1);
      nextSecTasks.splice(toIdx, 0, moved);

      const base = Date.now();
      const orderMap = new Map<string, number>();
      nextSecTasks.forEach((t, i) => orderMap.set(t.id, base + i));

      return {
        ...prev,
        tasks: prev.tasks.map((t) => (orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id)! } : t)),
      };
    });
  }

  const totalProgress = useMemo(() => {
    let done = 0;
    let all = 0;

    for (const task of tasks) {
      if (task.cellType === "TEXT" || task.cellType === "SELECT") continue;

      for (const ch of activeCharacters) {
        all += 1;
        const cell = getCellByTableId(state, state.activeTableId, task.id, ch.id);
        if (!cell) continue;

        if (cell.type === "CHECK") {
          if (cell.checked) done += 1;
        } else if (cell.type === "COUNTER") {
          const max = Math.max(1, task.max ?? 1);
          if ((cell.count ?? 0) >= max) done += 1;
        }
      }
    }
    return { done, all };
  }, [activeCharacters, state, tasks]);

  // =========================
  // 레이드 Top3 계산
  // =========================
  type RaidDifficulty = { name: "노말" | "하드" | "나이트메어"; minIlvl: number; gold: number };
  type RaidDef = { key: string; name: string; diffs: RaidDifficulty[] };

  const RAID_CATALOG: RaidDef[] = [
    { key: "epic", name: "베히모스", diffs: [{ name: "노말", minIlvl: 1640, gold: 7200 }] },
    { key: "ACT0", name: "서막", diffs: [{ name: "노말", minIlvl: 1620, gold: 6100 }, { name: "하드", minIlvl: 1640, gold: 7200 }] },
    { key: "ACT1", name: "1막", diffs: [{ name: "노말", minIlvl: 1660, gold: 11500 }, { name: "하드", minIlvl: 1680, gold: 18000 }] },
    { key: "ACT2", name: "2막", diffs: [{ name: "노말", minIlvl: 1670, gold: 16500 }, { name: "하드", minIlvl: 1690, gold: 23000 }] },
    { key: "ACT3", name: "3막", diffs: [{ name: "노말", minIlvl: 1680, gold: 21000 }, { name: "하드", minIlvl: 1700, gold: 27000 }] },
    { key: "ACT4", name: "4막", diffs: [{ name: "노말", minIlvl: 1700, gold: 33000 }, { name: "하드", minIlvl: 1720, gold: 42000 }] },
    { key: "FINAL", name: "종막", diffs: [{ name: "노말", minIlvl: 1710, gold: 40000 }, { name: "하드", minIlvl: 1730, gold: 52000 }] },
    { key: "SERKA", name: "세르카", diffs: [{ name: "노말", minIlvl: 1710, gold: 35000 }, { name: "하드", minIlvl: 1730, gold: 44000 }, { name: "나이트메어", minIlvl: 1740, gold: 54000 }] },
  ];

  function parseIlvl(raw?: string): number {
    if (!raw) return NaN;
    const n = Number(String(raw).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : NaN;
  }

  const TASK_MIN_ILVL: Record<string, number> = {
    "할의 모래시계": 1730,
    "1막": 1660,
    "2막": 1670,
    "3막": 1680,
    "4막": 1700,
    "종막": 1710,
    "세르카": 1710,
    "1해금": 1640,
    "2해금": 1680,
    "3해금": 1700,
    "4해금": 1720,
  };

  const getCharIlvl = (ch: any) => {
    const v = ch.itemLevel ?? ch.item_level ?? ch.ilvl ?? ch.iLvl ?? ch.level ?? ch.levelLabel ?? ch.nameLevel;
    try {
      const n = typeof v === "number" ? v : parseIlvl(String(v ?? ""));
      return Number.isFinite(n) ? n : 0;
    } catch {
      const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) ? n : 0;
    }
  };

  const CORE_DAILY_TASK_ID = "MAIN_DAILY";
  function getCoreDailyLabel(ilvl: number) {
    return ilvl >= 1730 ? "혼돈의 균열" : "쿠르잔 전선";
  }

  function pickBestDiff(ilvl: number, raid: RaidDef): RaidDifficulty | null {
    const available = raid.diffs.filter((d) => ilvl >= d.minIlvl);
    if (!available.length) return null;
    return available.reduce((best, cur) => (cur.gold > best.gold ? cur : best));
  }

  function calcWeeklyTop3Gold(ilvl: number) {
    const candidates = RAID_CATALOG.map((raid) => {
      const best = pickBestDiff(ilvl, raid);
      return best ? { raid: raid.name, diff: best.name, gold: best.gold } : null;
    }).filter(Boolean) as { raid: string; diff: string; gold: number }[];

    candidates.sort((a, b) => b.gold - a.gold);
    const top3 = candidates.slice(0, 3);
    const sum = top3.reduce((acc, cur) => acc + cur.gold, 0);
    return { sum, top3, all: candidates };
  }

  function getGoldByDiffName(raidName: string, diff: DiffName) {
    const g = RAID_CLEAR_GOLD[raidName];
    if (!g) return 0;
    if (diff === "노말") return g.normal ?? 0;
    if (diff === "하드") return g.hard ?? 0;
    return g.nightmare ?? 0;
  }

  function availableDiffNames(ilvl: number, raidName: string): DiffName[] {
    const def = RAID_CATALOG.find((r) => r.name === raidName);
    if (!def) return [];

    // RAID_CATALOG의 minIlvl 기준으로 가능한 난이도만 노출
    return def.diffs
      .filter((d) => ilvl >= d.minIlvl)
      .map((d) => d.name);
  }

  /**
   * ✅ Top3는 "레이드 3개는 그대로(top3)" 유지하되
   *   각 레이드 골드는 (선택 난이도 우선) → 없으면 자동 최고난이도
   */
  function calcWeeklyTop3GoldWithPick(ilvl: number, picked: Record<string, DiffName> | undefined) {
    const base = calcWeeklyTop3Gold(ilvl); // top3 레이드 3개는 기존 로직 유지
    const top3 = base.top3.map((x) => {
      const avail = availableDiffNames(ilvl, x.raid);
      const want = picked?.[x.raid];

      // 선택이 가능 난이도면 적용, 아니면 자동(기존 x.diff)
      const diff: DiffName = want && avail.includes(want) ? want : (x.diff as DiffName);
      const gold = diff === x.diff ? x.gold : getGoldByDiffName(x.raid, diff);

      return { raid: x.raid, diff, gold, avail };
    });

    const sum = top3.reduce((acc, cur) => acc + cur.gold, 0);
    return { sum, top3 };
  }

  function getWeeklyTop3RaidNameSet(ilvl: number): Set<string> {
    if (!Number.isFinite(ilvl) || ilvl <= 0) return new Set();
    const r = calcWeeklyTop3Gold(ilvl);
    return new Set(r.top3.map((x) => x.raid));
  }

  function isWeeklyRaidTaskTitle(title: string) {
    return Boolean(RAID_CLEAR_GOLD[title]);
  }

  // =========================
  // ✅ 상단: 주간 레이드 골드 진행률(모든 표/모든 캐릭 · Top3 기준)
  //   - total: 각 캐릭 Top3 합산
  //   - done : 체크된 레이드(Top3에 해당)만 합산
  // =========================
  const weeklyRaidTaskIdByTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of state.tasks) {
      if (t.period !== "WEEKLY") continue;
      if ((t.section ?? "").trim() !== "주간 레이드") continue;
      if (t.cellType !== "CHECK") continue;
      map.set((t.title ?? "").trim(), t.id);
    }
    return map;
  }, [state.tasks]);

  const weeklyGoldProgress = useMemo(() => {
    let total = 0;
    let done = 0;

    for (const tbl of state.tables) {
      for (const ch of tbl.characters as any[]) {
        const ilvl = parseIlvl(ch.itemLevel);
        if (!Number.isFinite(ilvl) || ilvl <= 0) continue;

        const r = calcWeeklyTop3Gold(ilvl);
        total += r.sum;

        for (const x of r.top3) {
          const taskId = weeklyRaidTaskIdByTitle.get((x.raid ?? "").trim());
          if (!taskId) continue;
          const cell = getCellByTableId(state, tbl.id, taskId, ch.id);
          if (cell && cell.type === "CHECK" && cell.checked) done += x.gold;
        }
      }
    }

    const pct = total > 0 ? Math.floor((done / total) * 100) : 0;
    return { done, total, pct };
  }, [state, weeklyRaidTaskIdByTitle]);


  // =========================
  // 2-표 렌더링 (핵심)
  // =========================
  function setRestGaugeInTable(tableId: string, chId: string, next: { chaos?: number; guardian?: number }) {
    setState((prev) => {
      const tbl = getTableById(prev, tableId);
      const cur = tbl.restGauges?.[chId] ?? { chaos: 0, guardian: 0 };

      const nextRest = {
        ...(tbl.restGauges ?? {}),
        [chId]: {
          chaos: next.chaos ?? cur.chaos,
          guardian: next.guardian ?? cur.guardian,
        },
      };

      const nextTbl: TodoTable = { ...tbl, restGauges: nextRest };
      return { ...prev, tables: prev.tables.map((t) => (t.id === nextTbl.id ? nextTbl : t)) };
    });
  }

  function CounterDots({ max, count }: { max: number; count: number }) {
    const dots = Array.from({ length: max }, (_, i) => i + 1);

    return (
      <div className="dots">
        {dots.map((n) => (
          <span key={n} className={`dot ${n <= count ? "filled" : ""}`} />
        ))}
        {max > 1 && <span className="dots-num">{count}/{max}</span>}
      </div>
    );
  }
  function renderRaidLeftUnifiedTable() {
    // 1) 모든 표의 모든 캐릭터를 “열”로 합치기
    const allCols = state.tables.flatMap((tbl) =>
      tbl.characters.map((ch) => ({
        tableId: tbl.id,
        tableName: tbl.name ?? tbl.id,
        ch,
      }))
    );

    // 2) 주간 레이드 체크 3개 미만만 남기기
    // (네가 이미 만들어둔 getWeeklyRaidCheckedCount(tableId, charId) 그대로 사용)
    const visibleCols = allCols.filter(({ tableId, ch }) => getWeeklyRaidCheckedCount(tableId, ch.id) < 3);

    // 3) 남은 캐릭 0명 안내
    if (visibleCols.length === 0) {
      return (
        <div className="tablePane">
          <div className="paneHeader">
            <div className="paneTitle">남은 레이드 · 전체</div>
          </div>
          <div style={{ padding: 16, opacity: 0.7 }}>✅ 남은 레이드(3회 미만) 캐릭터가 없어.</div>
        </div>
      );
    }

    // 4) tasks는 이미 RAID_LEFT에서 “주간 레이드만” 남도록 필터되어 있다고 가정
    // 그래도 groupedTasks 흐름을 맞추려면 section 그룹핑을 그대로 사용


    return (
      <div className="tablePane">
        <div className="paneHeader">
          <div className="paneTitle">남은 레이드 · 전체 ({visibleCols.length}캐릭)</div>
        </div>

        {/* ✅ 표 내부 스크롤은 끄고, 바깥(.raid-left-hscroll)에서 가로 스크롤 */}
        <div className="todo-table-scroll raid-left-mode" style={{ height: "100%" }}>
          <table className="todo-table">
            <thead>
              <tr>
                <th className="todo-sticky-left todo-col-head">숙제</th>

                {visibleCols.map(({ tableId, tableName, ch }) => {
                  const isActiveCol = tableId === state.activeTableId; // ✅ 활성 표 컬럼만 수정/삭제 가능(기존 editCharacter가 active표만 수정하니까)

                  return (
                    <th key={`${tableId}:${ch.id}`} className="todo-col-head">
                      <div className="char-head">
                        {/*표 출처 표시*/}
                        <div className="char-meta" style={{ fontSize: 11, opacity: 0.7 }}>{tableName}</div>


                        <div className="char-name" title={ch.name}>
                          {ch.name}
                        </div>

                        <div className="char-meta">Lv. {ch.itemLevel || "-"}</div>
                        <div className="char-meta">{ch.power || "-"}</div>

                        {/* ✅ 아제나 (기존 그대로) */}
                        {(() => {
                          const enabled = Boolean((ch as any).azenaEnabled);
                          const expiresAt = (ch as any).azenaExpiresAt as string | null | undefined;
                          const expired = enabled && expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
                          const checked = enabled && !expired;

                          return (
                            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => onToggleAzena(tableId, ch.id, e.target.checked)}
                                />
                                <span>아제나</span>
                              </label>

                              <div
                                style={{
                                  fontSize: 11,
                                  opacity: 0.8,
                                  visibility: checked && expiresAt ? "visible" : "hidden",
                                  height: 14,
                                  lineHeight: "14px",
                                }}
                              >
                                ~ {checked && expiresAt ? formatKoreanDateTime(expiresAt) : "0000년 00월 00일(월) 00:00"}
                              </div>
                            </div>
                          );
                        })()}

                        {/* ✅ 캐릭 수정/삭제는 active 표에서만 (기존 UX 유지) */}
                        <div className="char-actions">
                          {isActiveCol && (
                            <>
                              <button className="mini" onClick={() => editCharacter(ch)}>수정</button>
                              <button className="mini" onClick={() => deleteCharacter(ch)}>삭제</button>
                            </>
                          )}
                        </div>
                      </div>
                    </th>
                  );
                })}

              </tr>
            </thead>

            <tbody>
              {groupedTasks.map(([section, rows]) => (
                <React.Fragment key={section}>
                  <tr className="section-row section-strong">
                    <td className="todo-sticky-left section-left" colSpan={1 + visibleCols.length}>
                      {section}
                    </td>
                  </tr>

                  {rows.map((task) => (
                    <tr key={task.id} className="task-row">
                      <td className="todo-sticky-left task-left">
                        <div className="task-left-inner">
                          <div className="task-title raid-title-click">{task.title}</div>

                          <div className="pill weekly">주간</div>

                          <div className="task-actions">
                            <button className="mini" onClick={() => editTask(task)}>수정</button>
                            <button className="mini" onClick={() => deleteTask(task)}>삭제</button>
                          </div>
                        </div>
                      </td>


                      {visibleCols.map(({ tableId, ch }) => {
                        const cell = getCellByTableId(state, tableId, task.id, ch.id);

                        // ✅ 주간 레이드 Top3만 체크 노출(기존 로직 유지)
                        if (section === "주간 레이드" && isWeeklyRaidTaskTitle(task.title)) {
                          const ilvl = getCharIlvl(ch);
                          const top3Set = getWeeklyTop3RaidNameSet(ilvl);
                          if (!top3Set.has(task.title)) {
                            return <td key={`${tableId}:${ch.id}`} className="cell" />;
                          }
                        }

                        const checked = cell?.type === "CHECK" ? cell.checked : false;

                        return (
                          <td key={`${tableId}:${ch.id}`} className="cell">
                            <button
                              type="button"
                              className="cell-check-btn"
                              onClick={() => onCellClick(tableId, task, ch)}
                              title="완료 체크"
                            >
                              <span className={`check ${checked ? "on" : ""}`} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* ✅ 주간 레이드 골드합(Top3) 줄도 유지하고 싶으면 그대로 합쳐서 출력 */}
                  {section === "주간 레이드" && (
                    <tr className="task-row gold-sum-row">
                      <td className="todo-sticky-left task-left">
                        <div className="task-left-inner">
                          <div className="task-title">주간 클리어 골드(추천 Top3)</div>
                          <div className="task-sub">아이템레벨 기준 · 레이드별 최고 난이도만 적용</div>
                        </div>
                      </td>

                      {visibleCols.map(({ tableId, ch }) => {
                        const ilvl = parseIlvl(ch.itemLevel);

                        if (!Number.isFinite(ilvl)) {
                          return (
                            <td key={`${tableId}:${ch.id}`} className="cell">
                              <div className="goldbox muted">Lv 입력 필요</div>
                            </td>
                          );
                        }

                        const charKey = weeklyCharKey(tableId, ch.id); // tableId는 renderTodoTable 인자로 이미 있음
                        const picked = weeklyDiffByChar[charKey] ?? {};
                        const pickedResult = calcWeeklyTop3GoldWithPick(ilvl, picked);

                        const detail = pickedResult.top3
                          .map((x) => `${x.raid} ${x.diff}(${x.gold.toLocaleString()})`)
                          .join(" + ");

                        return (
                          <td key={ch.id} className="cell">
                            <button
                              type="button"
                              className="goldbox goldbox-btn"
                              title={detail}
                              onClick={(e) => {
                                setWeeklyTop3Popup({
                                  tableId,
                                  charId: ch.id,
                                  charName: ch.name,
                                  ilvl,
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              }}
                            >
                              <div className="gold-sum">{pickedResult.sum.toLocaleString()} G</div>
                              <div className="gold-detail">{pickedResult.top3.map((x) => x.raid).join(" / ")}</div>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }


  function renderTodoTable(tableId: string, paneLabel: string) {
    const table = getTableById(state, tableId);
    const characters = table.characters;
    const isActivePane = tableId === state.activeTableId;

    // ✅ 남은 레이드 탭일 때만: 주간 레이드 체크 3개 미만 캐릭만 노출
    const visibleCharacters =
      periodTab === "RAID_LEFT"
        ? characters
          .map((ch) => ({ ch, raidDone: getWeeklyRaidCheckedCount(tableId, ch.id) }))
          .filter(({ raidDone }) => raidDone < 3)
          .map(({ ch }) => ch)
        : characters;


    return (
      <div
        className="tablePane"
        style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        <div className="paneHeader" style={{ position: "relative", paddingRight: 70 }}>
          <div className="paneTitle">
            {paneLabel} · {table.name}
          </div>

          {!isActivePane && (
            <button
              className="btn"
              onClick={() => setSecondaryTableId("")}
              style={{ position: "absolute", left: 500, top: -50 }}
            >
              닫기
            </button>
          )}
        </div>
        <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}>
          <div
            className={`todo-table-scroll ${periodTab === "RAID_LEFT" ? "raid-left-mode" : ""}`}
            style={{ height: "100%" }}
            ref={isActivePane ? tableWrapRef : undefined as any}
          >
            <div className="todo-table-center">
              <div className="todo-table-card" style={{ height: "100%" }}>
                <table className="todo-table">
                  <thead>
                    <tr>
                      <th className="todo-sticky-left head-left">
                        <div className="head-left-top">
                          <span>숙제</span>
                        </div>
                      </th>

                      {visibleCharacters.map((ch) => (
                        <th
                          key={ch.id}
                          className="todo-col-head"
                          onDragOver={(e) => {
                            if (isTouch) return;
                            e.preventDefault();
                          }}
                          onDrop={() => {
                            if (isTouch) return;
                            if (!dragCharId) return;
                            reorderCharacters(tableId, dragCharId, ch.id);
                            setDragCharId(null);
                          }}
                        >
                          <div className="char-head">
                            <div
                              className="char-name"
                              title={isTouch ? ch.name : "드래그해서 캐릭터 순서 변경"}
                              draggable={!isTouch}
                              onDragStart={() => {
                                if (isTouch) return;
                                setDragCharId(ch.id);
                              }}
                              onDragEnd={() => {
                                if (isTouch) return;
                                setDragCharId(null);
                              }}
                              style={{ cursor: isTouch ? "default" : "grab" }}
                            >
                              {ch.name}
                            </div>

                            <div className="char-meta">Lv. {ch.itemLevel || "-"}</div>
                            <div className="char-meta">{ch.power || "-"}</div>

                            {/* 아제나 */}
                            {(() => {
                              const enabled = Boolean((ch as any).azenaEnabled);
                              const expiresAt = (ch as any).azenaExpiresAt as string | null | undefined;
                              const expired = enabled && expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
                              const checked = enabled && !expired;

                              return (
                                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => onToggleAzena(tableId, ch.id, e.target.checked)}
                                    />
                                    <span>아제나</span>
                                  </label>

                                  <div
                                    style={{
                                      fontSize: 11,
                                      opacity: 0.8,
                                      visibility: checked && expiresAt ? "visible" : "hidden", // ✅ 공간은 유지, 글자만 숨김
                                      height: 14,  // ✅ 한 줄 높이 고정(필요시 13~16 조절)
                                      lineHeight: "14px",
                                    }}
                                  >
                                    ~ {checked && expiresAt ? formatKoreanDateTime(expiresAt) : "0000년 00월 00일(월) 00:00"}
                                  </div>

                                </div>
                              );
                            })()}

                            {/* 캐릭 수정/삭제는 active 표에서만 */}
                            <div className="char-actions">
                              {isActivePane && (
                                <>
                                  <button className="mini" onClick={() => editCharacter(ch)}>수정</button>
                                  <button className="mini" onClick={() => deleteCharacter(ch)}>삭제</button>
                                </>
                              )}
                            </div>

                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {[...groupedTasks]
                      .sort(([a], [b]) => {
                        const oa = SECTION_ORDER[a] ?? 999;
                        const ob = SECTION_ORDER[b] ?? 999;
                        return oa - ob || a.localeCompare(b, "ko");
                      })
                      .map(([section, rows]) => {
                        return (
                          <React.Fragment key={section}>
                            <tr
                              className={`section-row ${section === "일일 숙제" || section === "주간 교환" || section === "주간 레이드" ? "section-strong" : ""
                                }`}
                            >
                              <td className="todo-sticky-left section-left" colSpan={1 + visibleCharacters.length}>
                                {section}
                              </td>
                            </tr>



                            {rows.map((task) => {
                              if (task.title === "큐브") return null;

                              const min = TASK_MIN_ILVL[task.title];

                              if (typeof min === "number") {
                                const anyEligible = characters.some((ch) => getCharIlvl(ch) >= min);
                                if (!anyEligible) return null;
                              }

                              return (
                                <tr
                                  key={task.id}
                                  className="task-row"
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={() => {
                                    // 숙제 순서 변경은 전역(템플릿)이라 active에서만 허용
                                    if (!isActivePane) return;
                                    if (!dragTaskId) return;
                                    reorderTaskWithinSection(dragTaskId, task.id);
                                    setDragTaskId(null);
                                  }}
                                >
                                  <td className="todo-sticky-left task-left">
                                    <div className="task-left-inner">
                                      <div
                                        className="task-title raid-title-click"
                                        draggable={isActivePane}
                                        onDragStart={() => isActivePane && setDragTaskId(task.id)}
                                        onDragEnd={() => isActivePane && setDragTaskId(null)}
                                        style={{ cursor: isActivePane ? "grab" : "default" }}
                                        onClick={(e) => {
                                          if (!RAID_CLEAR_GOLD[task.title]) return;
                                          setRaidGoldPopup({ title: task.title, x: e.clientX, y: e.clientY });
                                        }}
                                      >
                                        {task.title}
                                      </div>

                                      <div
                                        className={`pill ${task.period === "DAILY" ? "daily" : task.period === "WEEKLY" ? "weekly" : ""
                                          }`}
                                      >
                                        {LEVEL_PERIODS[task.period]}
                                      </div>

                                      {/* 숙제 수정/삭제는 active에서만 */}
                                      {isActivePane && (
                                        <div className="task-actions">
                                          <button className="mini" onClick={() => editTask(task)}>수정</button>
                                          <button className="mini" onClick={() => deleteTask(task)}>삭제</button>
                                        </div>
                                      )}
                                    </div>
                                  </td>

                                  {visibleCharacters.map((ch) => {
                                    const cell = getCellByTableId(state, tableId, task.id, ch.id);

                                    if (typeof min === "number") {
                                      const eligible = getCharIlvl(ch) >= min;
                                      if (!eligible) return <td key={ch.id} className="cell" />;
                                    }

                                    if (task.cellType === "TEXT") {
                                      const isCubeTicket = task.title.includes("해금") || task.title.includes("금제");

                                      if (isCubeTicket) {
                                        const raw = cell?.type === "TEXT" ? cell.text : "";
                                        const n = raw === "" ? 0 : Number(String(raw).replace(/[^0-9]/g, ""));
                                        const value = Number.isFinite(n) ? n : 0;

                                        const setValue = (next: number) => onTextChange(tableId, task, ch, String(Math.max(0, next)));
                                        const useOnce = () => setValue(value - 1);
                                        const useTriple = () => setValue(value - 3);

                                        return (
                                          <td key={ch.id} className="cell">
                                            <div className="ticket-grid">
                                              <div className="ticket-left">
                                                <input
                                                  inputMode="numeric"
                                                  className="ticket-input"
                                                  value={raw}
                                                  onChange={(e) => {
                                                    const onlyNum = e.target.value.replace(/[^0-9]/g, "");
                                                    onTextChange(tableId, task, ch, onlyNum);
                                                  }}
                                                  placeholder="0"
                                                />

                                                <div className="ticket-left-actions">
                                                  <button type="button" className="ticket-btn" onClick={() => setValue(value + 1)}>추가</button>
                                                  <button type="button" className="ticket-btn" onClick={() => setValue(value - 1)} disabled={value < 1}>
                                                    삭제
                                                  </button>
                                                </div>
                                              </div>

                                              <div className="ticket-right">
                                                <button type="button" className="ticket-btn primary" onClick={useOnce} disabled={value < 1}>1회사용</button>
                                                <button type="button" className="ticket-btn primary" onClick={useTriple} disabled={value < 3}>3회사용</button>
                                              </div>
                                            </div>
                                          </td>
                                        );
                                      }

                                      return (
                                        <td key={ch.id} className="cell">
                                          <input
                                            className="cell-text"
                                            value={cell?.type === "TEXT" ? cell.text : ""}
                                            onChange={(e) => onTextChange(tableId, task, ch, e.target.value)}
                                          />
                                        </td>
                                      );
                                    }

                                    if (task.cellType === "SELECT") {
                                      const opts = task.options ?? ["완료", "미완"];
                                      return (
                                        <td key={ch.id} className="cell">
                                          <select
                                            className="cell-select"
                                            value={cell?.type === "SELECT" ? cell.value : ""}
                                            onChange={(e) => onSelectChange(tableId, task, ch, e.target.value)}
                                          >
                                            <option value="">-</option>
                                            {opts.map((o) => (
                                              <option key={o} value={o}>{o}</option>
                                            ))}
                                          </select>
                                        </td>
                                      );
                                    }

                                    if (task.cellType === "COUNTER") {
                                      const max = Math.max(1, task.max ?? 1);
                                      const count = cell?.type === "COUNTER" ? (cell.count ?? 0) : 0;

                                      const isCore = task.id === CORE_DAILY_TASK_ID;
                                      const isGuardian = task.title === "가디언 토벌";

                                      const restValue = isCore
                                        ? (table.restGauges?.[ch.id]?.chaos ?? 0)
                                        : isGuardian
                                          ? (table.restGauges?.[ch.id]?.guardian ?? 0)
                                          : 0;

                                      const restMax = isCore ? 200 : isGuardian ? 100 : 0;

                                      return (
                                        <td
                                          key={ch.id}
                                          className="cell"
                                          data-counter="1"
                                          data-task-id={task.id}
                                          data-ch-id={ch.id}
                                          onClick={() => onCellClick(tableId, task, ch)}
                                          title={task.id === CORE_DAILY_TASK_ID ? getCoreDailyLabel(getCharIlvl(ch)) : "클릭 토글"}
                                        >
                                          <div className="cell-inline">
                                            <CounterDots max={max} count={count} />

                                            {(isCore || isGuardian) && (
                                              <input
                                                inputMode="numeric"
                                                className="rest-input"
                                                value={String(restValue)}
                                                onChange={(e) => {
                                                  const raw = e.target.value.replace(/[^0-9]/g, "");
                                                  const n = raw === "" ? 0 : Number(raw);
                                                  const clamped = clamp(Number.isFinite(n) ? n : 0, 0, restMax);

                                                  setRestGaugeInTable(tableId, ch.id, {
                                                    chaos: isCore ? clamped : undefined,
                                                    guardian: isGuardian ? clamped : undefined,
                                                  });
                                                }}
                                                title={isCore ? "핵심 콘텐츠 휴식(0~200)" : "가디언 휴식(0~100)"}
                                                onClick={(e) => e.stopPropagation()}
                                              />
                                            )}
                                          </div>
                                        </td>
                                      );
                                    }

                                    // ✅ 주간 레이드: 캐릭터별 Top3 레이드만 체크 버튼 렌더링
                                    if (section === "주간 레이드" && isWeeklyRaidTaskTitle(task.title)) {
                                      const ilvl = getCharIlvl(ch);
                                      const top3Set = getWeeklyTop3RaidNameSet(ilvl);
                                      if (!top3Set.has(task.title)) {
                                        return <td key={ch.id} className="cell" />;
                                      }
                                    }

                                    // CHECK
                                    const checked = cell?.type === "CHECK" ? cell.checked : false;

                                    return (
                                      <td key={ch.id} className="cell">
                                        <button type="button" className="cell-check-btn" onClick={() => onCellClick(tableId, task, ch)} title="완료 체크">
                                          <span className={`check ${checked ? "on" : ""}`} />
                                        </button>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}

                            {section === "주간 레이드" && (
                              <tr className="task-row gold-sum-row">
                                <td className="todo-sticky-left task-left">
                                  <div className="task-left-inner">
                                    <div className="task-title">주간 클리어 골드(추천 Top3)</div>
                                    <div className="task-sub">아이템레벨 기준 · 레이드별 난이도 선택 반영</div>
                                  </div>
                                </td>

                                {visibleCharacters.map((ch) => {
                                  // ✅ parseIlvl 대신 getCharIlvl 사용(“Lv. 1710” 같은 포맷도 안전)
                                  const ilvl = getCharIlvl(ch);

                                  if (!Number.isFinite(ilvl) || ilvl <= 0) {
                                    return (
                                      <td key={ch.id} className="cell">
                                        <div className="goldbox muted">Lv 입력 필요</div>
                                      </td>
                                    );
                                  }

                                  // ✅ 캐릭터별 선택 난이도 로드 + 반영 계산
                                  const charKey = weeklyCharKey(tableId, ch.id);
                                  const picked = weeklyDiffByChar[charKey] ?? {};
                                  const pickedResult = calcWeeklyTop3GoldWithPick(ilvl, picked);

                                  const detail = pickedResult.top3
                                    .map((x) => `${x.raid} ${x.diff}(${x.gold.toLocaleString()})`)
                                    .join(" + ");

                                  return (
                                    <td key={ch.id} className="cell">
                                      <button
                                        type="button"
                                        className="goldbox goldbox-btn"
                                        title={detail}
                                        onClick={(e) => {
                                          setWeeklyTop3Popup({
                                            tableId,
                                            charId: ch.id,
                                            charName: ch.name,
                                            ilvl,
                                            x: e.clientX,
                                            y: e.clientY,
                                          });
                                        }}
                                      >
                                        <div className="gold-sum">{pickedResult.sum.toLocaleString()} G</div>
                                        <div className="gold-detail">{pickedResult.top3.map((x) => x.raid).join(" / ")}</div>
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div >
    );
  }

  return (
    <>
      {azenaModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 14, // ✅ 모바일에서 가장자리 안 잘리게
          }}
        >
          <div
            style={{
              width: 340,
              maxWidth: "100%",
              background: "var(--card)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 14,
              boxShadow: "var(--shadow)",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>아제나 만료 시각 입력</div>

            <input
              type="datetime-local"
              value={azenaModal.value}
              onChange={(e) => setAzenaModal((p) => ({ ...p, value: e.target.value }))}
              style={{
                width: "100%",
                height: 34,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--text)",
                padding: "0 10px",
                fontSize: 13,
                outline: "none",
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={cancelAzena}>
                취소
              </button>
              <button className="btn" onClick={confirmAzena}>
                확인
              </button>
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.35 }}>
              * 지정한 시각이 지나면 자동으로 체크가 해제됩니다. (새로고침/재접속/탭 복귀 시에도 자동 보정)
            </div>
          </div>
        </div>
      )}

      <div className="todo-page">
        <div className="todo-topbar">
          <div className="todo-title">
            <h2>할 일 (To-do)</h2>
            <div className="todo-sub">로스터 기반 숙제 체크리스트 · 일일 6시 / 주간 수요일 6시 자동 초기화</div>

            <div
              className="topbar-controls"
              style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
            >

              <select
                value={state.activeTableId}
                onChange={(e) => setActiveTableId(e.target.value)}
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text)",
                  padding: "0 10px",
                  fontSize: 13,
                }}
                title="왼쪽(편집) 표 선택"
              >

                {state.tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {/* ✅ 오른쪽 표 선택(기존 표 불러오기) */}
              <select
                value={secondaryTableId}
                onChange={(e) => setSecondaryTableId(e.target.value)}
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text)",
                  padding: "0 10px",
                  fontSize: 13,
                }}
                title="오른쪽에 같이 볼 표 선택"
              >
                <option value="">(오른쪽 표)</option>
                {state.tables
                  .filter((t) => t.id !== state.activeTableId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>

              <button className="btn" onClick={addTable}>
                + 표 추가
              </button>
              <button className="btn" onClick={renameTable}>
                표 이름변경
              </button>
              <button className="btn" onClick={deleteTable}>
                표 삭제
              </button>
            </div>
            {/* ✅ 주간 레이드 골드 진행률(Top3 합산) */}
            <div className="weeklyGoldSummary" title="모든 표/모든 캐릭터의 주간 레이드 Top3(아이템레벨 기준) 합산">
              <div className="weeklyGoldTitle">주간 레이드 골드</div>

              {weeklyGoldProgress.total > 0 ? (
                <div className="weeklyGoldValue">
                  <span className="weeklyGoldNum">{weeklyGoldProgress.done.toLocaleString()}</span>
                  <span className="weeklyGoldSep">/</span>
                  <span className="weeklyGoldNum">{weeklyGoldProgress.total.toLocaleString()}</span>
                  <span className="weeklyGoldPct">({weeklyGoldProgress.pct}%)</span>
                </div>
              ) : (
                <div className="weeklyGoldValue muted">아이템레벨 입력 필요</div>
              )}

              <div className="weeklyGoldHint">Top3 기준 · 체크하면 자동 합산</div>
            </div>
          </div>

          <div className="todo-actions">
            <button className="btn" onClick={addCharacter}>
              + 캐릭 추가
            </button>
            <button className="btn" onClick={() => addTask("DAILY")}>
              + 일일 숙제
            </button>
            <button className="btn" onClick={() => addTask("WEEKLY")}>
              + 주간 숙제
            </button>
            <button className="btn" onClick={() => addTask("NONE")}>
              + 기타 숙제
            </button>

            <BidPopover />

            <div className="divider" />


            <div className="divider" />
            <button className="btn" onClick={() => manualReset("DAILY")}>
              일일 초기화
            </button>
            <button className="btn" onClick={() => manualReset("WEEKLY")}>
              주간 초기화
            </button>

            <div className="divider" />
            <button className="btn" onClick={doExport}>
              백업
            </button>
            <button className="btn" onClick={doImport}>
              복원
            </button>

            <button className="btn" onClick={toggleTheme} title="테마 전환">
              {theme === "dark" ? "☀️ 화이트모드" : "🌙 다크모드"}
            </button>
          </div>
          <div className="todo-actions">
            {/* 기존 버튼들 ... */}

            <div className="divider" />

            <div className="friendBox">
              <div className="friendRow">
                <div className="friendLabel">내 코드</div>
                <code className="friendCode">{state.profile.friendCode}</code>
                <button className="mini" onClick={() => navigator.clipboard.writeText(state.profile.friendCode)}>
                  복사
                </button>

                {SERVER_MODE ? (
                  <span className="pill weekly" style={{ marginLeft: 6 }}>
                    서버모드
                  </span>
                ) : (
                  <span className="pill daily" style={{ marginLeft: 6 }}>
                    로컬모드
                  </span>
                )}
              </div>
              {/* ✅ 닉네임 입력 (친구에게 표시될 이름) */}
              <div className="friendRow">
                <div className="friendLabel">닉네임</div>
                <input
                  className="friendInput"
                  placeholder="닉네임(친구에게 표시)"
                  value={(state.profile.nickname ?? "")}
                  onChange={(e) => {
                    setNickSaveState("saving");   // ← 수정 시작하면 바로 저장중 표시
                    setMyNickname(e.target.value);
                  }}
                />
                {/* ✅ 저장 상태 표시 */}
                {nickSaveState !== "idle" && (
                  <span
                    className={[
                      "pill",
                      nickSaveState === "saving" ? "weekly" : nickSaveState === "error" ? "daily" : "weekly",
                    ].join(" ")}
                    style={{ marginLeft: 6 }}
                    title={
                      nickSaveState === "typing"
                        ? "입력 중"
                        : nickSaveState === "saving"
                          ? "서버에 저장 중"
                          : nickSaveState === "saved"
                            ? (SERVER_MODE ? "서버 저장 완료" : "로컬 저장 완료")
                            : "저장 실패"
                    }
                  >
                    {nickSaveState === "typing" && "입력중"}
                    {nickSaveState === "saving" && "저장중…"}
                    {nickSaveState === "saved" && "저장됨"}
                    {nickSaveState === "error" && "실패"}
                  </span>
                )}
              </div>
              <div className="friendRow">
                <div className="friendLabel">공개</div>
                <select
                  className="friendSelect"
                  value={state.profile.shareMode}
                  onChange={(e) => setShareMode(e.target.value as any).catch((err) => alert(String(err)))}
                >
                  <option value="PUBLIC">공개</option>
                  <option value="PRIVATE">비공개</option>
                </select>

                {!SERVER_MODE ? (
                  <button
                    className="mini"
                    onClick={() => {
                      try {
                        const json = exportRaidLeftSnapshot(state, state.activeTableId);
                        navigator.clipboard.writeText(json);
                        alert("남은 레이드 스냅샷을 클립보드에 복사했어!");
                      } catch (e: any) {
                        if (String(e?.message) === "PRIVATE_MODE") alert("비공개면 스냅샷을 만들 수 없어!");
                        else alert("스냅샷 생성 실패");
                      }
                    }}
                  >
                    남은 레이드 스냅샷 복사
                  </button>
                ) : (
                  <button
                    className="mini"
                    onClick={async () => {
                      try {
                        const snapshotJson = exportRaidLeftSnapshot(state, "ALL");

                        await apiFetch2("/api/me/raid-left-snapshot", {
                          method: "PUT",
                          body: JSON.stringify({
                            nickname: state.profile.nickname,
                            snapshotJson,
                          }),
                        });

                        alert("서버에 남은 레이드 스냅샷 업로드 완료!");
                      } catch (e: any) {
                        alert(`업로드 실패: ${String(e)}`);
                      }
                    }}
                  >
                    남은 레이드 서버 업로드
                  </button>
                )}
              </div>

              {SERVER_MODE ? (
                <>
                  <div className="friendRow">
                    <button
                      className="mini"
                      onClick={async () => {
                        const toCode = (prompt("친구 코드(FC_...) 입력") ?? "").trim();
                        if (!toCode) return;

                        try {
                          await apiFetch2("/api/friend-requests", {
                            method: "POST",
                            body: JSON.stringify({ toFriendCode: toCode }),
                          });
                          alert("친구요청 보냄!");
                          await refreshFriends();
                        } catch (e: any) {
                          alert(`친구요청 실패: ${String(e)}`);
                        }
                      }}
                    >
                      친구요청 보내기
                    </button>

                    <button className="mini" disabled={syncingFriends} onClick={() => refreshFriends().catch((e) => alert(String(e)))}>
                      {syncingFriends ? "동기화중..." : "서버 동기화"}
                    </button>
                  </div>

                  {incomingReqs.length > 0 && (
                    <div className="todo-hint" style={{ marginTop: 8 }}>
                      <div>받은 친구요청</div>
                      <ul>
                        {incomingReqs.map((r) => (
                          <li key={r.id}>
                            {r.fromFriendCode}{" "}
                            <button
                              className="mini"
                              onClick={async () => {
                                try {
                                  await apiFetch2(`/api/friend-requests/${r.id}/accept`, { method: "POST" });
                                  await refreshFriends();
                                } catch (e: any) {
                                  alert(`수락 실패: ${String(e)}`);
                                }
                              }}
                            >
                              수락
                            </button>{" "}
                            <button
                              className="mini"
                              onClick={async () => {
                                try {
                                  await apiFetch2(`/api/friend-requests/${r.id}/reject`, { method: "POST" });
                                  await refreshFriends();
                                } catch (e: any) {
                                  alert(`거절 실패: ${String(e)}`);
                                }
                              }}
                            >
                              거절
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="friendRow">
                  <input
                    className="friendInput"
                    placeholder="친구 코드(FC_...)"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const code = (e.currentTarget as HTMLInputElement).value;
                        addFriend(code, code);
                        (e.currentTarget as HTMLInputElement).value = "";
                      }
                    }}
                  />
                  <button
                    className="mini"
                    onClick={() => {
                      const code = prompt("친구 코드(FC_...) 입력") ?? "";
                      if (!code.trim()) return;
                      const nick = prompt("친구 별명(선택)") ?? "";
                      addFriend(code, nick);
                    }}
                  >
                    친구 추가
                  </button>

                  <button
                    className="mini"
                    onClick={() => {
                      const raw = prompt("친구가 준 스냅샷 JSON을 붙여넣어") ?? "";
                      if (!raw.trim()) return;
                      attachSnapshotToFriend(raw);
                    }}
                  >
                    친구 스냅샷 붙여넣기
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="todo-tabs">
          <button className={`tab ${periodTab === "ALL" ? "active" : ""}`} onClick={() => setPeriodTab("ALL")}>
            전체
          </button>
          <button className={`tab ${periodTab === "DAILY" ? "active" : ""}`} onClick={() => setPeriodTab("DAILY")}>
            일일
          </button>
          <button className={`tab ${periodTab === "WEEKLY" ? "active" : ""}`} onClick={() => setPeriodTab("WEEKLY")}>
            주간
          </button>
          <button className={`tab ${periodTab === "NONE" ? "active" : ""}`} onClick={() => setPeriodTab("NONE")}>
            기타
          </button>
          <button className={`tab ${periodTab === "RAID_LEFT" ? "active" : ""}`} onClick={() => setPeriodTab("RAID_LEFT")}>
            남은 레이드
          </button>
          {periodTab === "RAID_LEFT" && (
            <>
              <div className="raidLeftToolbar">
                <select
                  className="friendSelect"
                  value={raidLeftView}
                  onChange={(e) => setRaidLeftView(e.target.value as any)}
                >
                  <option value="ME">내 남은 레이드</option>
                  <option value="FRIEND">친구 남은 레이드</option>
                </select>

                {raidLeftView === "FRIEND" && (
                  <>
                    <select
                      className="friendSelect"
                      value={selectedFriendCode}
                      onChange={(e) => setSelectedFriendCode(e.target.value)}
                    >
                      <option value="">친구 선택</option>
                      {state.friends.map((f) => (
                        <option key={f.code} value={f.code}>
                          {f.nickname}
                        </option>
                      ))}
                    </select>

                    {SERVER_MODE && (
                      <button
                        className="mini"
                        disabled={!selectedFriendCode}
                        onClick={async () => {
                          try {
                            const data = await apiFetch2(
                              `/api/raid-left-snapshot?friendCode=${encodeURIComponent(selectedFriendCode)}`
                            );
                            const snapAny = (data as any).snapshotJson;
                            const snapStr = typeof snapAny === "string" ? snapAny : JSON.stringify(snapAny);
                            attachSnapshotToFriend(snapStr, selectedFriendCode);

                            alert("친구 남은 레이드 불러오기 완료!");
                          } catch (e: any) {
                            alert("불러오기 실패(비공개이거나 친구가 아닐 수 있어)");
                          }
                        }}
                      >
                        서버에서 불러오기
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          <div className="todo-progress">
            진행률(체크/카운터): <b>{totalProgress.done}</b> / {totalProgress.all}
          </div>
        </div>


        {/* ✅ 표 영역 wrapper: 요일별 + 표 그리드를 한 컨테이너로 묶기 */}
        <div className="todo-table-area">
          {/* ✅ 요일별 콘텐츠(계정 공용) - 전체/일일 탭에서 */}
          {(periodTab === "ALL" || periodTab === "DAILY") && (
            secondaryTableId ? (
              <div
                className="accountDailyGrid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  alignItems: "start",
                  marginBottom: 8,
                }}
              >
                <AccountDailyPanel tableId={state.activeTableId} />
                <AccountDailyPanel tableId={secondaryTableId} />
              </div>
            ) : (
              <AccountDailyPanel tableId={state.activeTableId} />
            )
          )}

          {/* ✅ 두 표 동시 렌더 */}
          {periodTab === "RAID_LEFT" ? (
            raidLeftView === "FRIEND" ? (
              <div className="tablePane" style={{ height: "100%", minHeight: 0 }}>
                <div style={{ padding: 12 }}>{renderFriendRaidLeftColumns()}</div> {/* ✅ 교체 */}
              </div>
            ) : (
              <div className="raid-left-hscroll">
                <div style={{ width: "max-content" }}>{renderRaidLeftUnifiedTable()}</div>
              </div>
            )
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: secondaryTableId ? "1fr 1fr" : "1fr",
                gap: 12,
                alignItems: "stretch",
                minHeight: 0,
                flex: "1 1 auto",
              }}
              className="todo-two-table-grid"
            >
              {renderTodoTable(state.activeTableId, "왼쪽(편집)")}
              {secondaryTableId && renderTodoTable(secondaryTableId, "오른쪽")}
            </div>
          )}
        </div>


        <div className="todo-hint">
          <div>팁</div>
          <ul>
            <li>카운터 셀: 클릭으로 토글</li>
            <li>핵심 콘텐츠/가디언: 카운터 옆 휴식게이지(숫자) 입력 가능</li>
            <li>일일 초기화: 휴식게이지 갱신 후 일일 체크 초기화</li>
            <li>리셋: 일일 6시 / 주간 수요일 6시 자동 적용(앱 켜둔 상태에서도)</li>
          </ul>
        </div>

        {raidGoldPopup && (
          <div
            className="raid-gold-pop"
            style={{
              left: raidGoldPopup.x + 12,
              top: raidGoldPopup.y + 12,
            }}
          >
            <div className="raid-gold-head">
              <b>{raidGoldPopup.title}</b>
              <button onClick={() => setRaidGoldPopup(null)}>닫기</button>
            </div>

            <div className="raid-gold-body">
              {RAID_CLEAR_GOLD[raidGoldPopup.title].normal !== undefined && (
                <div>노말: {RAID_CLEAR_GOLD[raidGoldPopup.title].normal!.toLocaleString()} G</div>
              )}
              {RAID_CLEAR_GOLD[raidGoldPopup.title].hard !== undefined && (
                <div>하드: {RAID_CLEAR_GOLD[raidGoldPopup.title].hard!.toLocaleString()} G</div>
              )}
              {RAID_CLEAR_GOLD[raidGoldPopup.title].nightmare !== undefined && (
                <div>나이트메어: {RAID_CLEAR_GOLD[raidGoldPopup.title].nightmare!.toLocaleString()} G</div>
              )}
            </div>
          </div>
        )}
        {(() => {
          const popup = weeklyTop3Popup;

          if (popup === null) {
            return null;
          }

          const charKey = weeklyCharKey(popup.tableId, popup.charId);
          const picked = weeklyDiffByChar[charKey] ?? {};
          const r = calcWeeklyTop3GoldWithPick(popup.ilvl, picked);

          // popup이 null 아닌 블록(분기) 안에서만 실행되게 되어있다는 전제
          const tableId = popup.tableId;
          const charId = popup.charId;

          function setPick(raidName: string, diff: DiffName) {
            setWeeklyDiffByChar((prev) => {
              const nextChar = { ...(prev[charKey] ?? {}), [raidName]: diff };
              const next = { ...prev, [charKey]: nextChar };

              saveWeeklyDiff(tableId, charId, nextChar); // ✅ popup 안 씀 → null 경고 사라짐
              return next;
            });
          }

          return (
            <div className="weekly-top3-pop" style={{ left: popup.x + 12, top: popup.y + 12 }}>
              <div className="weekly-top3-head">
                <b>{popup.charName} · Top3 골드</b>
                <button onClick={() => setWeeklyTop3Popup(null)}>닫기</button>
              </div>

              <div className="weekly-top3-sum">
                합계: <b>{r.sum.toLocaleString()} G</b>
              </div>

              <div className="weekly-top3-body">
                {r.top3.map((x) => (
                  <div key={x.raid} className="weekly-top3-row">
                    <div className="weekly-top3-raid">{x.raid}</div>

                    <div className="weekly-top3-diffs">
                      {(["노말", "하드", "나이트메어"] as DiffName[]).map((d) => {
                        const enabled = x.avail.includes(d);
                        const active = (picked?.[x.raid] ?? x.diff) === d;

                        return (
                          <button
                            key={d}
                            type="button"
                            className={`diff-btn ${active ? "active" : ""}`}
                            disabled={!enabled}
                            onClick={() => setPick(x.raid, d)}
                            title={enabled ? `${getGoldByDiffName(x.raid, d).toLocaleString()} G` : "아이템레벨 부족"}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>

                    <div className="weekly-top3-gold">{x.gold.toLocaleString()} G</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
