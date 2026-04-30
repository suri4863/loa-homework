import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TodoTracker.css";

import type {
  TodoState,
  Character,
  CharacterRole,
  TaskRow,
  TodoTable,
  RestGauges,
  CellValue,
  GridValues,
  KkanbuExcludePair,
  SharedWeeklySchedule,
  SharedScheduleCharacterSnapshot,
  SharedWeeklyScheduleItem,
  WeeklyScheduleDay,
} from "../store/todoStore";
import { isPersistedDefaultTask } from "../store/todoStore";

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
  normalizeFriendRaidSnapshotAfterWeeklyReset,
  exportFriendRaidPlan,
  importFriendRaidPlan,
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

function getAzenaRemainingMs(expiresAt?: string | null) {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return null;
  return t - Date.now();
}

const AZENA_WARNING_MS = 72 * 60 * 60 * 1000; // 3일

function isAzenaEndingSoon(expiresAt?: string | null) {
  const remain = getAzenaRemainingMs(expiresAt);
  if (remain == null) return false;
  return remain > 0 && remain <= AZENA_WARNING_MS;
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
  // ✅ Document Picture-in-Picture (일일숙제 PIP)
  // - 현재 보고 있는 표(state.activeTableId)
  // - 캐릭터 1명씩 + 이전/다음
  // =========================
  const pipTableIdRef = useRef<string | null>(null);
  const pipCubeFlashRef = useRef<Record<string, number>>({});
  const pipWindowRef = useRef<any>(null);
  const pipCharIndexRef = useRef<number>(0);
  const stateRef = useRef<TodoState>(state);

  useEffect(() => {
    stateRef.current = state;
    // state 변경 시 PIP가 열려있으면 화면 갱신
    if (pipWindowRef.current) {
      try {
        renderDailyPip();
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);


  const INCLUDE_BOUND_GOLD_KEY = "loa-include-bound-gold:v1";

  const [includeBoundGold, setIncludeBoundGold] = useState<boolean>(() => {
    const saved = localStorage.getItem(INCLUDE_BOUND_GOLD_KEY);
    return saved !== "0";
  });

  useEffect(() => {
    localStorage.setItem(INCLUDE_BOUND_GOLD_KEY, includeBoundGold ? "1" : "0");
  }, [includeBoundGold]);

  type AuthMode = "signIn" | "signUp";
  type LegacyLinkInfo = {
    friendCode: string;
    nickname?: string | null;
    hasBackup?: boolean;
    updatedAt?: string | null;
  };

  const AUTH_TOKEN_KEY = "loa-auth-token:v1";
  const AUTH_LOGIN_ID_KEY = "loa-auth-login-id:v1";

  const [authToken, setAuthToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY) ?? "");
  const [signedInLoginId, setSignedInLoginId] = useState(() => localStorage.getItem(AUTH_LOGIN_ID_KEY) ?? "");
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [authId, setAuthId] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [legacyCode, setLegacyCode] = useState("");
  const [legacyLoginAllowed, setLegacyLoginAllowed] = useState(true);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyLinkInfo, setLegacyLinkInfo] = useState<LegacyLinkInfo | null>(null);

  const isLoggedIn = Boolean(authToken);


  // =========================
  //  친구/공유 (컴포넌트 스코프)
  // =========================
  const [raidLeftView, setRaidLeftView] = useState<"ME" | "FRIEND">("ME");
  const [selectedFriendCode, setSelectedFriendCode] = useState<string>("");
  const [friendSnapshots, setFriendSnapshots] = useState<Record<string, any>>({});
  const [friendRaidPlans, setFriendRaidPlans] = useState<Record<string, any>>({});

  //  수동 깐부 조합 플래너
  const [kkanbuLevelMin, setKkanbuLevelMin] = useState<string>("1700");
  const [kkanbuLevelMax, setKkanbuLevelMax] = useState<string>("1800");
  const [kkanbuAvgPowerTarget, setKkanbuAvgPowerTarget] = useState<string>("3000");

  type ManualKkanbuPair = {
    myKey: string;
    friendKey: string;
    selectedRaids: string[] | null;
  };

  const [manualKkanbuPairs, setManualKkanbuPairs] = useState<ManualKkanbuPair[]>([
    { myKey: "", friendKey: "", selectedRaids: null },
  ]);

  const [shareKkanbuOpen, setShareKkanbuOpen] = useState(false);
  const [shareKkanbuCopied, setShareKkanbuCopied] = useState(false);

  const WEEK_DAYS: WeeklyScheduleDay[] = ["수", "목", "금", "토", "일", "월", "화"];

  const [weeklySchedules, setWeeklySchedules] = useState<SharedWeeklySchedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>("");
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleTargetDay, setScheduleTargetDay] = useState<WeeklyScheduleDay>("수");
  const [scheduleCreateMode, setScheduleCreateMode] = useState<"NEW" | "EXISTING">("NEW");
  const [schedulePlanningMode, setSchedulePlanningMode] = useState<"CURRENT" | "NEXT_RESET">("CURRENT");
  const [newScheduleTitle, setNewScheduleTitle] = useState("일정표");
  const [dragScheduleItem, setDragScheduleItem] = useState<{
    scheduleId: string;
    itemId: string;
    fromDay: WeeklyScheduleDay;
  } | null>(null);
  const [selectedMyScheduleCharKey, setSelectedMyScheduleCharKey] = useState<string>("");
  const [selectedMyScheduleRaidNames, setSelectedMyScheduleRaidNames] = useState<string[]>([]);

  const excludedKkanbuTableIds = state.profile.kkanbuExcludedTableIds ?? [];

  function isKkanbuExcludedTable(tableId: string) {
    return excludedKkanbuTableIds.includes(tableId);
  }

  function toggleKkanbuExcludedTable(tableId: string) {
    setState((prev) => {
      const prevIds = prev.profile.kkanbuExcludedTableIds ?? [];
      const exists = prevIds.includes(tableId);

      return {
        ...prev,
        profile: {
          ...prev.profile,
          kkanbuExcludedTableIds: exists
            ? prevIds.filter((id) => id !== tableId)
            : [...prevIds, tableId],
        },
      };
    });
  }

  const excludedFriendKkanbuTableNames = state.profile.kkanbuExcludedFriendTableNames ?? [];

  function isKkanbuExcludedFriendTable(tableName: string) {
    return excludedFriendKkanbuTableNames.includes(String(tableName ?? "").trim());
  }

  function toggleKkanbuExcludedFriendTable(tableName: string) {
    const normalized = String(tableName ?? "").trim();
    if (!normalized) return;

    setState((prev) => {
      const prevNames = prev.profile.kkanbuExcludedFriendTableNames ?? [];
      const exists = prevNames.includes(normalized);

      return {
        ...prev,
        profile: {
          ...prev.profile,
          kkanbuExcludedFriendTableNames: exists
            ? prevNames.filter((name) => name !== normalized)
            : [...prevNames, normalized],
        },
      };
    });
  }

  function makeMyCharKey(tableId: string, charId: string) {
    return `${tableId}|${charId}`;
  }

  function isExcludedMyChar(friendCode: string, myCharKey: string) {
    const pairs = state.profile.kkanbuExcludePairs ?? [];
    return pairs.some((p) => p.friendCode === friendCode && p.myCharKey === myCharKey);
  }

  function toggleExcludedMyChar(friendCode: string, myCharKey: string) {
    setState((prev) => {
      const prevPairs = prev.profile.kkanbuExcludePairs ?? [];
      const exists = prevPairs.some(
        (p) => p.friendCode === friendCode && p.myCharKey === myCharKey
      );

      const nextPairs = exists
        ? prevPairs.filter(
          (p) => !(p.friendCode === friendCode && p.myCharKey === myCharKey)
        )
        : [...prevPairs, { friendCode, myCharKey }];

      return {
        ...prev,
        profile: {
          ...prev.profile,
          kkanbuExcludePairs: nextPairs,
        },
      };
    });
  }

  function removeExcludedMyChar(friendCode: string, myCharKey: string) {
    setState((prev) => {
      const prevPairs = prev.profile.kkanbuExcludePairs ?? [];
      return {
        ...prev,
        profile: {
          ...prev.profile,
          kkanbuExcludePairs: prevPairs.filter(
            (p) => !(p.friendCode === friendCode && p.myCharKey === myCharKey)
          ),
        },
      };
    });
  }

  function clearExcludedMyChars(friendCode: string) {
    setState((prev) => {
      const prevPairs = prev.profile.kkanbuExcludePairs ?? [];
      return {
        ...prev,
        profile: {
          ...prev.profile,
          // 현재 친구 기준으로 저장된 제외 기록 전부 삭제
          kkanbuExcludePairs: prevPairs.filter((p) => p.friendCode !== friendCode),
        },
      };
    });
  }

  function clearExcludedMatchHistory(friendCode: string) {
    setState((prev) => {
      const prevPairs = prev.profile.kkanbuExcludePairs ?? [];
      return {
        ...prev,
        profile: {
          ...prev.profile,
          // 현재 선택한 친구 기준으로 저장된 제외 기록 전부 삭제
          kkanbuExcludePairs: prevPairs.filter((p) => p.friendCode !== friendCode),
        },
      };
    });
  }

  type MyCandidate = {
    key: string;
    tableId: string;
    tableName: string;
    charId: string;
    name: string;
    ilvl: number;
    power: number;
    remainingRaids: string[];
    allRaids: string[];
    activeRaids: string[];
  };

  type FriendCandidate = {
    key: string;
    tableName: string;
    name: string;
    ilvl: number;
    power: number;
    remainingRaids: string[];
    allRaids: string[];
    activeRaids: string[];
    clearedRaids: string[];
  };

  // 깐부 매칭(친구 남은 레이드에서)
  function makeFriendCharKey(friendCode: string, tableName: string | undefined, charName: string) {
    return `${friendCode}|${tableName ?? ""}|${charName}`;
  }


  const excludedMyChars = useMemo(() => {
    const pairs = state.profile.kkanbuExcludePairs ?? [];

    return pairs
      .filter((p) => p.friendCode === selectedFriendCode)
      .map((p) => {
        const [tableId, charId] = String(p.myCharKey ?? "").split("|");

        let foundTable: any = null;
        let foundChar: any = null;

        for (const tbl of state.tables) {
          if (tbl.id !== tableId) continue;
          foundTable = tbl;
          foundChar = tbl.characters.find((ch) => ch.id === charId);
          if (foundChar) break;
        }

        return {
          myCharKey: p.myCharKey,
          tableId,
          charId,
          tableName: foundTable?.name ?? tableId,
          name: foundChar?.name ?? "(삭제된 캐릭터)",
          ilvl: foundChar?.itemLevel ?? "",
          power: foundChar?.power ?? "",
          role: foundChar?.role ?? "DEALER",
        };
      });
  }, [state.profile.kkanbuExcludePairs, state.tables, selectedFriendCode]);

  const [friendsDockOpen, setFriendsDockOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("friendsDockOpen:v1") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("friendsDockOpen:v1", friendsDockOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [friendsDockOpen]);

  useEffect(() => {
    setManualKkanbuPairs([{ myKey: "", friendKey: "", selectedRaids: null }]);
  }, [selectedFriendCode]);

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
  const [raidSnapUploadState, setRaidSnapUploadState] = useState<"idle" | "uploading" | "ok" | "error">("idle");
  const [lastRaidSnapUploadedAt, setLastRaidSnapUploadedAt] = useState<number | null>(null);
  const raidSnapUploadingRef = useRef(false);
  const raidSnapAutoTimerRef = useRef<number | null>(null);
  const lastWeeklyResetUploadedRef = useRef<number>(0);

  // 주간 리셋이 실제 반영되면 서버에도 즉시 초기화된 스냅샷 업로드
  useEffect(() => {
    if (!SERVER_MODE) return;
    if (!state.profile.autoRaidLeftUploadEnabled) return;

    const weeklyResetAt = state.reset?.lastWeeklyResetAt ?? 0;
    if (!weeklyResetAt) return;

    if (lastWeeklyResetUploadedRef.current === weeklyResetAt) return;
    lastWeeklyResetUploadedRef.current = weeklyResetAt;

    uploadRaidLeftSnapshot("auto").catch(() => { });
  }, [
    SERVER_MODE,
    state.profile.autoRaidLeftUploadEnabled,
    state.reset?.lastWeeklyResetAt,
  ]);

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
    if (authToken && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${authToken}`);

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

  async function submitAuth() {
    const loginId = authId.trim();
    if (!loginId) return setAuthMessage("아이디를 입력해줘.");
    if (authPassword.length < 6) return setAuthMessage("비밀번호는 6자 이상으로 입력해줘.");

    setAuthBusy(true);
    setAuthMessage("");
    try {
      const res = await fetch(authMode === "signUp" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId,
          password: authPassword,
          friendCode: state.profile.friendCode,
          nickname: state.profile.nickname ?? "",
        }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || res.statusText || `HTTP ${res.status}`);

      const nextToken = String(data?.token ?? "");
      const nextLoginId = String(data?.user?.loginId ?? loginId);
      localStorage.setItem(AUTH_TOKEN_KEY, nextToken);
      localStorage.setItem(AUTH_LOGIN_ID_KEY, nextLoginId);
      setAuthToken(nextToken);
      setSignedInLoginId(nextLoginId);
      setState((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          friendCode: String(data?.user?.friendCode ?? prev.profile.friendCode),
          nickname: data?.user?.nickname ?? prev.profile.nickname,
          shareMode: data?.user?.shareMode ?? prev.profile.shareMode,
        },
      }));
      setAuthPassword("");
      setAuthMessage(authMode === "signUp" ? "회원가입이 완료됐어." : "로그인됐어.");
    } catch (e: any) {
      setAuthMessage(e?.message || String(e));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (authToken) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      }).catch(() => null);
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_LOGIN_ID_KEY);
    setAuthToken("");
    setSignedInLoginId("");
    setLegacyLinkInfo(null);
  }

  useEffect(() => {
    if (!authToken) return;

    let cancelled = false;
    apiFetch2("/api/me/account")
      .then((account: any) => {
        if (cancelled || !account?.friendCode) return;
        setSignedInLoginId(String(account?.loginId ?? signedInLoginId));
        setState((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            friendCode: String(account.friendCode),
            nickname: account.nickname ?? prev.profile.nickname,
            shareMode: account.shareMode ?? prev.profile.shareMode,
          },
        }));
      })
      .catch(() => {
        // ignore sync failures; interactive actions will surface auth errors
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  function formatDateOnly(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getScheduleWeekStartDate(mode: "CURRENT" | "NEXT_RESET") {
    const resetWeekday = state.reset?.weeklyResetWeekday ?? 3; // 수요일
    const resetHour = state.reset?.dailyResetHour ?? 6;

    const now = new Date();
    const base = new Date(now);

    // 로아 기준 게임 날짜
    if (base.getHours() < resetHour) {
      base.setDate(base.getDate() - 1);
    }
    base.setHours(0, 0, 0, 0);

    const currentWeekday = base.getDay();
    const diff = (currentWeekday - resetWeekday + 7) % 7;

    // 이번 주 시작(최근 리셋일)
    base.setDate(base.getDate() - diff);

    if (mode === "NEXT_RESET") {
      base.setDate(base.getDate() + 7);
    }

    return formatDateOnly(base);
  }

  function getWeeklyScheduleTimeState(schedule: SharedWeeklySchedule) {
    if (!schedule.weekStartDate) return "CURRENT" as const;

    const currentWeekStart = getScheduleWeekStartDate("CURRENT");

    if (schedule.weekStartDate < currentWeekStart) return "PAST" as const;
    if (schedule.weekStartDate > currentWeekStart) return "FUTURE" as const;
    return "CURRENT" as const;
  }

  function isPastWeeklySchedule(schedule: SharedWeeklySchedule) {
    return getWeeklyScheduleTimeState(schedule) === "PAST";
  }

  function isFutureWeeklySchedule(schedule: SharedWeeklySchedule) {
    return getWeeklyScheduleTimeState(schedule) === "FUTURE";
  }

  function isCurrentWeeklySchedule(schedule: SharedWeeklySchedule) {
    return getWeeklyScheduleTimeState(schedule) === "CURRENT";
  }

  // 4/23 일정표 제목 상태 보정
  function stripNextResetSuffix(title: string) {
    return String(title ?? "").replace(/\s*\(다음 주\)\s*$/, "").trim();
  }

  // 4/23 현재 시점 기준으로 일정표 제목 자동 표시
  function getDisplayWeeklyScheduleTitle(schedule: SharedWeeklySchedule) {
    const baseTitle = stripNextResetSuffix(schedule.title || "일정표");
    const timeState = getWeeklyScheduleTimeState(schedule);

    return timeState === "FUTURE" ? `${baseTitle} (다음 주)` : baseTitle;
  }

  // 4/23 현재/다음 주 기준에 따라 일정표 목록 필터
  function matchesSchedulePlanningMode(
    schedule: SharedWeeklySchedule,
    mode: "CURRENT" | "NEXT_RESET"
  ) {
    const timeState = getWeeklyScheduleTimeState(schedule);

    if (mode === "CURRENT") {
      return timeState === "CURRENT";
    }

    return timeState === "FUTURE";
  }

  type ScheduleSnapshotSource = {
    key?: string | null;
    tableName?: string | null;
    name?: string | null;
    charName?: string | null;
    power?: number | string | null;
    charPower?: number | string | null;
    itemLevel?: string | null;
    charItemLevel?: string | null;
    ilvl?: number | string | null;
    remainingRaids?: string[];
    activeRaids?: string[];
    allRaids?: string[];
    raidNames?: string[];
    raids?: string[];
  };

  function parseScheduleNumberValue(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const raw = String(value ?? "").replace(/,/g, "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function uniqueScheduleRaids(raids: unknown): string[] {
    if (!Array.isArray(raids)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raid of raids) {
      const normalized = normalizeRaidName(raid);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  function buildScheduleCharacterSnapshot(
    source: ScheduleSnapshotSource | null | undefined
  ): SharedScheduleCharacterSnapshot | null {
    const name = String(source?.name ?? source?.charName ?? "").trim();
    if (!name) return null;
    const itemLevel = source?.itemLevel ?? source?.charItemLevel ?? null;
    const raids =
      source?.raids ??
      source?.remainingRaids ??
      source?.activeRaids ??
      source?.allRaids ??
      source?.raidNames ??
      [];
    return {
      key: source?.key ? String(source.key) : null,
      tableName: source?.tableName ? String(source.tableName) : null,
      name,
      itemLevel: itemLevel != null ? String(itemLevel) : null,
      ilvl: parseScheduleNumberValue(source?.ilvl ?? itemLevel),
      power: parseScheduleNumberValue(source?.power ?? source?.charPower),
      raids: uniqueScheduleRaids(raids),
    };
  }

  function normalizeScheduleCharacterSnapshot(
    snapshot: SharedScheduleCharacterSnapshot | null | undefined,
    fallback: ScheduleSnapshotSource
  ) {
    return buildScheduleCharacterSnapshot({
      ...fallback,
      ...(snapshot ?? {}),
      key: snapshot?.key ?? fallback.key,
      tableName: snapshot?.tableName ?? fallback.tableName,
      name: snapshot?.name ?? fallback.name ?? fallback.charName,
      raids:
        snapshot?.raids ??
        fallback.raidNames ??
        fallback.remainingRaids ??
        fallback.activeRaids ??
        fallback.allRaids,
    });
  }

  function normalizeSharedScheduleItem(item: SharedWeeklyScheduleItem): SharedWeeklyScheduleItem {
    const raidNames = getScheduleItemRaidNames(item);
    const mySnapshot = normalizeScheduleCharacterSnapshot(item.mySnapshot, {
      key: item.myCharKey,
      tableName: item.myTableName,
      name: item.myCharName,
      power: item.myCharPower,
      raidNames,
    });
    const friendSnapshot = normalizeScheduleCharacterSnapshot(item.friendSnapshot, {
      key: item.friendCharKey,
      tableName: item.friendTableName,
      name: item.friendCharName,
      power: item.friendCharPower,
      raidNames,
    });
    return {
      ...item,
      mySnapshot,
      friendSnapshot,
      myWeeklyRaidPickKey:
        String(item.myWeeklyRaidPickKey ?? "").trim() || resolveScheduleWeeklyPickKey(item),
    };
  }

  function buildScheduleItemsFromMySlots(
    myList: Array<{
      key: string;
      tableName?: string;
      name: string;
      power: number;
      remainingRaids: string[];
    }>,
    targetDay: WeeklyScheduleDay
  ): SharedWeeklyScheduleItem[] {
    return myList.map((me, index) => ({
      id: `slot_${Date.now()}_${index}`,
      day: targetDay,

      myCharKey: me.key,
      myCharName: me.name,
      myTableName: me.tableName ?? null,
      myCharPower: me.power ?? null,
      mySnapshot: buildScheduleCharacterSnapshot(me),

      friendCharKey: null,
      friendCharName: null,
      friendTableName: null,
      friendCharPower: null,
      friendSnapshot: null,

      mode: "OPEN_SLOT",

      baseRaidNames: [...me.remainingRaids],
      raidNames: [...me.remainingRaids],

      avgPower: null,
      memo: "",
      order: index,
    }));
  }

  function buildScheduleItemsFromPairs(
    pairResults: Array<{
      my: any;
      friend: any;
      commonRaids: string[];
      activeSelectedRaids: string[];
      avgPower?: number | null;
    }>,
    targetDay: WeeklyScheduleDay
  ): SharedWeeklyScheduleItem[] {
    return pairResults.map((result, index) => {
      const raidNames =
        result.activeSelectedRaids.length > 0
          ? result.activeSelectedRaids
          : result.commonRaids;

      return {
        id: `item_${Date.now()}_${index}`,
        day: targetDay,

        myCharKey: result.my.key,
        myCharName: result.my.name,
        myTableName: result.my.tableName ?? null,
        myCharPower: result.my.power ?? null,
        mySnapshot: buildScheduleCharacterSnapshot(result.my),
        myWeeklyRaidPickKey: weeklyCharKey(result.my.tableId, result.my.charId), // 4/22 일정표 레이드 난이도 표시용

        friendCharKey: result.friend.key,
        friendCharName: result.friend.name,
        friendTableName: result.friend.tableName ?? null,
        friendCharPower: result.friend.power ?? null,
        friendSnapshot: buildScheduleCharacterSnapshot(result.friend),

        mode: "MATCHED",

        baseRaidNames: [...raidNames],
        raidNames: [...raidNames],

        avgPower: result.avgPower ?? null,
        memo: "",
        order: index,
      };
    });
  }


  async function refreshWeeklySchedules() {
    if (!SERVER_MODE) return;

    setScheduleLoading(true);
    try {
      const rows: any[] = await apiFetch2("/api/weekly-schedules");
      const parsed: SharedWeeklySchedule[] = rows.map((row) => {
        const raw = JSON.parse(String(row.scheduleJson ?? "{}"));

        const items = Array.isArray(raw.items) ? raw.items : [];

        return {
          id: String(row.id),
          ownerFriendCode: String(row.ownerFriendCode ?? ""),
          targetFriendCode: String(row.targetFriendCode ?? ""),
          title: String(row.title ?? "일정표"),
          weekStartDate: String(row.weekStartDate ?? ""),
          items: items.map((item: SharedWeeklyScheduleItem) => normalizeSharedScheduleItem(item)),
          updatedAt: new Date(row.updatedAt).getTime(),
        };
      });

      setWeeklySchedules(parsed);
    } finally {
      setScheduleLoading(false);
    }
  }

  // 4/23 미래 일정표가 실제 현재 주가 되면 자동으로 현재 주 기준으로 전환
  useEffect(() => {
    if (!selectedScheduleId) return;

    const selectedSchedule = weeklySchedules.find((s) => s.id === selectedScheduleId);
    if (!selectedSchedule) return;

    const timeState = getWeeklyScheduleTimeState(selectedSchedule);

    if (schedulePlanningMode === "NEXT_RESET" && timeState === "CURRENT") {
      setSchedulePlanningMode("CURRENT");
    }
  }, [selectedScheduleId, weeklySchedules, schedulePlanningMode]);

  useEffect(() => {
    if (!SERVER_MODE) return;

    refreshFriends().catch((e) => {
      console.error("친구 목록 불러오기 실패", e);
    });

    refreshWeeklySchedules().catch((e) => {
      console.error("일정표 불러오기 실패", e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SERVER_MODE, authToken]);

  async function createWeeklyScheduleFromRecommendation(
    pairResults: Array<{
      my: any;
      friend: any;
      commonRaids: string[];
      activeSelectedRaids: string[];
    }>,
    targetDay: WeeklyScheduleDay
  ) {
    if (!SERVER_MODE) {
      alert("서버 모드에서만 일정표 공유가 가능해.");
      return;
    }

    if (!selectedFriendCode) {
      alert("먼저 친구를 선택해줘.");
      return;
    }

    const items = buildScheduleItemsFromPairs(pairResults, targetDay);
    if (!items.length) {
      alert("일정표로 만들 추천 매칭이 없어.");
      return;
    }

    const title = newScheduleTitle.trim() || "일정표";

    const payload = {
      title:
        schedulePlanningMode === "NEXT_RESET"
          ? `${title} (다음 주)`
          : title,
      weekStartDate: getScheduleWeekStartDate(schedulePlanningMode),
      items,
    };

    const hydratedPayload = hydrateScheduleWithLocalCompletion({
      id: "",
      ownerFriendCode: getCurrentFriendCode(),
      targetFriendCode: selectedFriendCode,
      title: payload.title,
      weekStartDate: payload.weekStartDate,
      items: payload.items,
      updatedAt: Date.now(),
    });

    const created = await apiFetch2("/api/weekly-schedules", {
      method: "POST",
      body: JSON.stringify({
        targetFriendCode: selectedFriendCode,
        title: payload.title,
        weekStartDate: payload.weekStartDate,
        scheduleJson: JSON.stringify({
          ...payload,
          items: hydratedPayload.items,
        }),
      }),
    });

    await refreshWeeklySchedules();

    if (created?.id) setSelectedScheduleId(String(created.id));

    setManualKkanbuPairs([{ myKey: "", friendKey: "", selectedRaids: null }]);

    alert(`새 일정표 생성 완료! (${targetDay}요일)`);
  }

  async function appendToExistingWeeklySchedule(
    scheduleId: string,
    pairResults: Array<{
      my: any;
      friend: any;
      commonRaids: string[];
      activeSelectedRaids: string[];
    }>,
    targetDay: WeeklyScheduleDay
  ) {
    if (!SERVER_MODE) {
      alert("서버 모드에서만 일정표 공유가 가능해.");
      return;
    }

    const schedule = weeklySchedules.find((s) => s.id === scheduleId);
    if (!schedule) {
      alert("추가할 일정표를 먼저 선택해줘.");
      return;
    }

    const newItems = buildScheduleItemsFromPairs(pairResults, targetDay);
    if (!newItems.length) {
      alert("추가할 추천 매칭이 없어.");
      return;
    }

    const nextSchedule: SharedWeeklySchedule = {
      ...schedule,
      items: [
        ...schedule.items,
        ...newItems.map((item, index) => ({
          ...item,
          order: schedule.items.length + index,
        })),
      ],
    };

    await saveWeeklySchedule(nextSchedule);
    setSelectedScheduleId(schedule.id);

    setManualKkanbuPairs([{ myKey: "", friendKey: "", selectedRaids: null }]);

    alert(`기존 일정표에 추가 완료! (${targetDay}요일)`);
  }

  async function renameWeeklySchedule(scheduleId: string, nextTitle: string) {
    const schedule = weeklySchedules.find((s) => s.id === scheduleId);
    if (!schedule) return;

    await saveWeeklySchedule({
      ...schedule,
      title: nextTitle.trim() || "일정표",
    });
  }

  async function deleteWeeklySchedule(scheduleId: string) {
    if (!SERVER_MODE) return;
    if (!confirm("이 일정표를 삭제할까요?")) return;

    await apiFetch2(`/api/weekly-schedules?id=${scheduleId}`, {
      method: "DELETE",
    });

    await refreshWeeklySchedules();
    if (selectedScheduleId === scheduleId) {
      setSelectedScheduleId("");
    }
  }

  function removeScheduleItem(scheduleId: string, itemId: string) {
    setWeeklySchedules((prev) =>
      prev.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule;

        const nextItems = schedule.items
          .filter((item) => item.id !== itemId)
          .map((item, index) => ({ ...item, order: index }));

        return {
          ...schedule,
          items: nextItems,
        };
      })
    );
  }

  function parseScheduleMyCharKey(myCharKey: string) {
    const [tableId, charId] = String(myCharKey ?? "").split("|");
    return { tableId: tableId ?? "", charId: charId ?? "" };
  }

  function getCurrentFriendCode() {
    return String(state.profile.friendCode ?? "").trim();
  }

  function getSchedulePerspectiveForCurrentUser(schedule: SharedWeeklySchedule) {
    const currentFriendCode = getCurrentFriendCode();
    return {
      isOwnerView: schedule.ownerFriendCode === currentFriendCode,
      isTargetView: schedule.targetFriendCode === currentFriendCode,
    };
  }

  function getLocalWeeklyRaidTaskId(raidName: string) {
    const normalizedTarget = normalizeRaidName(raidName);

    const task = state.tasks.find(
      (t) =>
        t.period === "WEEKLY" &&
        (t.section ?? "").trim() === "주간 레이드" &&
        normalizeRaidName(String(t.title ?? "")) === normalizedTarget
    );

    return task?.id ?? "";
  }

  function isLocalScheduleCharRaidCleared(charKey: string | null | undefined, raidName: string) {
    const { tableId, charId } = parseScheduleMyCharKey(String(charKey ?? ""));
    if (!tableId || !charId) return false;

    const table = state.tables.find((t) => t.id === tableId);
    if (!table || !table.characters.some((ch) => ch.id === charId)) return false;

    const taskId = getLocalWeeklyRaidTaskId(raidName);
    if (!taskId) return false;

    const cell = getCellByTableId(state, tableId, taskId, charId);
    return !!(cell && cell.type === "CHECK" && cell.checked);
  }

  function getLocalClearedRaidNamesForScheduleChar(
    charKey: string | null | undefined,
    raidNames: string[]
  ) {
    return raidNames.filter((raid) => isLocalScheduleCharRaidCleared(charKey, raid));
  }

  function isStoredScheduleRaidCleared(
    storedRaidNames: string[] | null | undefined,
    raidName: string
  ) {
    if (!Array.isArray(storedRaidNames)) return false;
    const normalizedTarget = normalizeRaidName(raidName);
    return storedRaidNames.some((raid) => normalizeRaidName(raid) === normalizedTarget);
  }

  function compactScheduleKeysForItem(keys: Array<string | null | undefined>) {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const key of keys) {
      const value = String(key ?? "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }

    return out;
  }

  function getScheduleSnapshotCandidateKeyForItem(
    tableName?: string | null,
    charName?: string | null
  ) {
    const name = String(charName ?? "").trim();
    if (!name) return "";
    const table = String(tableName ?? "").trim();
    return table ? `${table}|${name}` : name;
  }

  function hasLocalScheduleCharKeyForItem(charKey: string | null | undefined) {
    const key = String(charKey ?? "").trim();
    if (!key || !key.includes("|")) return false;
    const [tableId, charId] = key.split("|");

    return state.tables.some(
      (table) =>
        table.id === tableId && table.characters.some((ch) => ch.id === charId)
    );
  }

  function findLocalScheduleCharKeyByNameForItem(
    name?: string | null,
    tableName?: string | null
  ) {
    const normalizedName = String(name ?? "").trim();
    const normalizedTable = String(tableName ?? "").trim();
    if (!normalizedName) return "";

    if (normalizedTable) {
      for (const table of state.tables) {
        if (String(table.name ?? "").trim() !== normalizedTable) continue;
        const ch = table.characters.find(
          (candidate) => String(candidate.name ?? "").trim() === normalizedName
        );
        if (ch) return `${table.id}|${ch.id}`;

        const placeholderIndex = Number(normalizedName.match(/(\d+)$/)?.[1] ?? 0);
        if (placeholderIndex > 0 && placeholderIndex <= table.characters.length) {
          const fallbackChar = table.characters[placeholderIndex - 1];
          if (fallbackChar) return `${table.id}|${fallbackChar.id}`;
        }
      }
    }

    for (const table of state.tables) {
      const ch = table.characters.find(
        (candidate) => String(candidate.name ?? "").trim() === normalizedName
      );
      if (ch) return `${table.id}|${ch.id}`;
    }

    return "";
  }

  function resolveLocalScheduleCharKeyForItem(
    charKey: string | null | undefined,
    snapshot?: SharedScheduleCharacterSnapshot | null,
    fallbackName?: string | null,
    fallbackTableName?: string | null
  ) {
    const direct = String(charKey ?? "").trim();
    if (hasLocalScheduleCharKeyForItem(direct)) return direct;

    const snapshotKey = String(snapshot?.key ?? "").trim();
    if (hasLocalScheduleCharKeyForItem(snapshotKey)) return snapshotKey;

    return findLocalScheduleCharKeyByNameForItem(
      snapshot?.name ?? fallbackName,
      snapshot?.tableName ?? fallbackTableName
    );
  }

  function getScheduleCandidateKeysForItem(
    charKey: string | null | undefined,
    tableName: string | null | undefined,
    charName: string | null | undefined,
    snapshot?: SharedScheduleCharacterSnapshot | null
  ) {
    const name = String(snapshot?.name ?? charName ?? "").trim();
    const table = String(snapshot?.tableName ?? tableName ?? "").trim();
    const localKey = resolveLocalScheduleCharKeyForItem(charKey, snapshot, charName, tableName);

    return compactScheduleKeysForItem([
      localKey,
      charKey,
      snapshot?.key,
      name,
      getScheduleSnapshotCandidateKeyForItem(table, name),
    ]);
  }

  function getScheduleSnapshotPowerForItem(
    snapshot: SharedScheduleCharacterSnapshot | null | undefined,
    fallback: number | null | undefined
  ) {
    return parseScheduleNumberValue(snapshot?.power ?? fallback);
  }

  function getScheduleItemRaidNames(item: SharedWeeklyScheduleItem) {
    return Array.isArray(item.raidNames) && item.raidNames.length > 0
      ? item.raidNames
      : item.baseRaidNames ?? [];
  }

  function hydrateScheduleWithLocalCompletion(schedule: SharedWeeklySchedule) {
    const { isOwnerView, isTargetView } = getSchedulePerspectiveForCurrentUser(schedule);

    return {
      ...schedule,
      items: schedule.items.map((item) => {
        const raidNames = getScheduleItemRaidNames(item);
        const myLocalKey = resolveLocalScheduleCharKeyForItem(
          item.myCharKey,
          item.mySnapshot,
          item.myCharName,
          item.myTableName
        );
        const friendLocalKey = resolveLocalScheduleCharKeyForItem(
          item.friendCharKey,
          item.friendSnapshot,
          item.friendCharName,
          item.friendTableName
        );

        return {
          ...item,
          ...(isOwnerView
            ? {
              myClearedRaidNames: getLocalClearedRaidNamesForScheduleChar(
                myLocalKey,
                raidNames
              ),
            }
            : {}),
          ...(isTargetView
            ? {
              friendClearedRaidNames: getLocalClearedRaidNamesForScheduleChar(
                friendLocalKey,
                raidNames
              ),
            }
            : {}),
        };
      }),
    };
  }

  function resolveScheduleWeeklyPickKey(item: SharedWeeklyScheduleItem) {
    const directPickKey = String(item.myWeeklyRaidPickKey ?? "").trim();
    if (directPickKey) return directPickKey;

    const rawMyCharKey = String(item.myCharKey ?? "").trim();
    if (!rawMyCharKey) return "";

    // 4/22 구버전 일정표 키 보정: tableId|charId -> tableId:charId
    if (rawMyCharKey.includes("|")) {
      const [tableId, charId] = rawMyCharKey.split("|");
      if (tableId && charId) return weeklyCharKey(tableId, charId);
    }

    return rawMyCharKey;
  }

  function isScheduleRaidCleared(
    schedule: SharedWeeklySchedule,
    item: SharedWeeklyScheduleItem,
    raidName: string
  ) {
    // 미래 일정표는 항상 클린
    if (isFutureWeeklySchedule(schedule)) return false;

    const { isOwnerView, isTargetView } = getSchedulePerspectiveForCurrentUser(schedule);

    if (isStoredScheduleRaidCleared(item.myClearedRaidNames, raidName)) return true;
    if (isStoredScheduleRaidCleared(item.friendClearedRaidNames, raidName)) return true;

    const myLocalKey = resolveLocalScheduleCharKeyForItem(
      item.myCharKey,
      item.mySnapshot,
      item.myCharName,
      item.myTableName
    );
    const friendLocalKey = resolveLocalScheduleCharKeyForItem(
      item.friendCharKey,
      item.friendSnapshot,
      item.friendCharName,
      item.friendTableName
    );

    if (isOwnerView && isLocalScheduleCharRaidCleared(myLocalKey, raidName)) return true;
    if (isTargetView && isLocalScheduleCharRaidCleared(friendLocalKey, raidName)) return true;

    return false;
  }


  function formatScheduleRaidNameWithDifficulty(
    item: SharedWeeklyScheduleItem,
    raidName: string
  ) {
    const canonical = canonicalRaidName(raidName);
    const pickKey = resolveScheduleWeeklyPickKey(item);

    if (!pickKey) return canonical;

    const pick = weeklyRaidPickByChar[pickKey];
    const diff =
      pick?.diffs?.[canonical] ??
      pick?.diffs?.[raidName];

    return diff ? `${canonical} ${diff}` : canonical;
  }

  function getScheduleRaidCompletion(
    schedule: SharedWeeklySchedule,
    item: SharedWeeklyScheduleItem
  ) {
    const raids = Array.isArray(item.raidNames) ? item.raidNames : [];
    const clearedMap = raids.map((raid) => ({
      raid,
      cleared: isScheduleRaidCleared(schedule, item, raid),
    }));

    const clearedCount = clearedMap.filter((x) => x.cleared).length;
    const allCleared = raids.length > 0 && clearedCount === raids.length;
    const timeState = getWeeklyScheduleTimeState(schedule);

    return {
      clearedMap,
      clearedCount,
      allCleared,
      timeState,
      isPast: timeState === "PAST",
      isCurrent: timeState === "CURRENT",
      isFuture: timeState === "FUTURE",
    };
  }

  function moveScheduleItem(
    scheduleId: string,
    itemId: string,
    nextDay: WeeklyScheduleDay,
    nextIndex?: number
  ) {
    setWeeklySchedules((prev) =>
      prev.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule;

        const movingItem = schedule.items.find((item) => item.id === itemId);
        if (!movingItem) return schedule;

        const withoutMoving = schedule.items.filter((item) => item.id !== itemId);

        const targetDayItems = withoutMoving
          .filter((item) => item.day === nextDay)
          .sort((a, b) => a.order - b.order);

        const insertIndex =
          typeof nextIndex === "number"
            ? Math.max(0, Math.min(nextIndex, targetDayItems.length))
            : targetDayItems.length;

        const movedItem: SharedWeeklyScheduleItem = {
          ...movingItem,
          day: nextDay,
        };

        const rebuiltTargetDayItems = [...targetDayItems];
        rebuiltTargetDayItems.splice(insertIndex, 0, movedItem);

        const nextItems: SharedWeeklyScheduleItem[] = [];

        for (const day of WEEK_DAYS) {
          const dayItems =
            day === nextDay
              ? rebuiltTargetDayItems
              : withoutMoving
                .filter((item) => item.day === day)
                .sort((a, b) => a.order - b.order);

          dayItems.forEach((item, index) => {
            nextItems.push({
              ...item,
              order: index,
            });
          });
        }

        return {
          ...schedule,
          items: nextItems,
        };
      })
    );
  }

  function getMyAllWeeklyRaids(
    tableId: string,
    charId: string,
    ilvl: number
  ): string[] {
    const charKey = weeklyCharKey(tableId, charId);
    const pick =
      Number.isFinite(ilvl) && ilvl > 0
        ? (weeklyRaidPickByChar[charKey] ?? getDefaultWeeklyRaidPick(ilvl))
        : { raids: [], diffs: {} };

    const selectedRaids: string[] = Array.isArray(pick?.raids)
      ? uniqueCanonicalRaidNames(pick.raids)
      : [];

    return selectedRaids.filter(Boolean);
  }

  function toggleSelectedScheduleRaid(raidName: string) {
    const normalized = normalizeRaidName(raidName);

    setSelectedMyScheduleRaidNames((prev) => {
      const exists = prev.some((x) => normalizeRaidName(x) === normalized);

      if (exists) {
        return prev.filter((x) => normalizeRaidName(x) !== normalized);
      }

      return [...prev, raidName];
    });
  }

  function addMyCharSlotToSchedule(
    scheduleId: string,
    me: {
      key: string;
      tableId: string;
      tableName?: string;
      charId: string;
      name: string;
      power: number;
      activeRaids: string[];
    },
    targetDay: WeeklyScheduleDay,
    selectedRaidNames?: string[]
  ) {
    setWeeklySchedules((prev) =>
      prev.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule;

        const targetDayCount = schedule.items.filter((item) => item.day === targetDay).length;

        const scheduledRaidSet = new Set<string>();
        for (const item of schedule.items) {
          const myItemKeys = getScheduleCandidateKeysForItem(
            item.myCharKey,
            item.myTableName,
            item.myCharName,
            item.mySnapshot
          );
          const friendItemKeys = getScheduleCandidateKeysForItem(
            item.friendCharKey,
            item.friendTableName,
            item.friendCharName,
            item.friendSnapshot
          );

          if (!myItemKeys.includes(me.key) && !friendItemKeys.includes(me.key)) continue;

          for (const raid of getScheduleItemRaidNames(item)) {
            scheduledRaidSet.add(normalizeRaidName(raid));
          }
        }

        const baseRaids =
          Array.isArray(selectedRaidNames) && selectedRaidNames.length > 0
            ? selectedRaidNames.filter(
              (raid) => !scheduledRaidSet.has(normalizeRaidName(raid))
            )
            : me.activeRaids.filter(
              (raid) => !scheduledRaidSet.has(normalizeRaidName(raid))
            );

        if (!baseRaids.length) return schedule;

        const newItem: SharedWeeklyScheduleItem = {
          id: `slot_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          day: targetDay,

          myCharKey: me.key,
          myCharName: me.name,
          myTableName: me.tableName ?? null,
          myCharPower: me.power ?? null,
          mySnapshot: buildScheduleCharacterSnapshot(me),
          myWeeklyRaidPickKey: weeklyCharKey(me.tableId, me.charId), // 4/22 일정표 레이드 난이도 표시용

          friendCharKey: null,
          friendCharName: null,
          friendTableName: null,
          friendCharPower: null,

          mode: "OPEN_SLOT",

          baseRaidNames: [...baseRaids],
          raidNames: [...baseRaids],

          avgPower: null,
          memo: "",
          order: targetDayCount,
        };

        return {
          ...schedule,
          items: [...schedule.items, newItem],
        };
      })
    );
  }

  async function saveWeeklySchedule(schedule: SharedWeeklySchedule) {
    if (!SERVER_MODE) return;

    const hydratedSchedule = hydrateScheduleWithLocalCompletion(schedule);

    setScheduleSaving(true);
    try {
      await apiFetch2(`/api/weekly-schedules?id=${schedule.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: schedule.title,
          weekStartDate: schedule.weekStartDate,
          scheduleJson: JSON.stringify({
            items: hydratedSchedule.items,
          }),
        }),
      });

      await refreshWeeklySchedules();
    } finally {
      setScheduleSaving(false);
    }
  }

  // ✅ 메모장 (표별 간단 메모)
  const memoKey = useMemo(() => `todoMemo:v1:${state.activeTableId}`, [state.activeTableId]);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoText, setMemoText] = useState<string>("");

  useEffect(() => {
    try {
      setMemoText(localStorage.getItem(memoKey) ?? "");
    } catch {
      setMemoText("");
    }
  }, [memoKey]);

  useEffect(() => {
    try {
      localStorage.setItem(memoKey, memoText);
    } catch {
      // ignore
    }
  }, [memoKey, memoText]);

  // =========================
  // ✅ 남은 레이드 스냅샷 업로드 (수동/자동)
  // =========================
  function setAutoRaidLeftUploadEnabled(enabled: boolean) {
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        autoRaidLeftUploadEnabled: enabled,
        autoRaidLeftUploadMinutes: prev.profile.autoRaidLeftUploadMinutes ?? 60,
      },
    }));
  }

  function setAutoRaidLeftUploadMinutes(minutes: number) {
    const m = Number(minutes);
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        autoRaidLeftUploadMinutes: Number.isFinite(m) && m > 0 ? m : 60,
      },
    }));
  }

  async function uploadFriendRaidPlan() {
    if (!SERVER_MODE) return;

    const s = state;
    const planJson = exportFriendRaidPlan(s, "ALL", weeklyRaidPickRef.current);

    await apiFetch2("/api/me/raid-plan", {
      method: "PUT",
      body: JSON.stringify({
        nickname: s.profile.nickname,
        planJson,
      }),
    });
  }

  async function uploadRaidLeftSnapshot(source: "manual" | "auto") {
    if (!SERVER_MODE) return;
    if (raidSnapUploadingRef.current) return;

    raidSnapUploadingRef.current = true;
    setRaidSnapUploadState("uploading");

    try {
      const s = state;

      // 자동 업로드라도 weeklyRaidPick이 없다고 건너뛰지 않음.
      // todoStore 쪽에서 weeklyRaidPick이 없으면 캐릭터 ilvl 기준 전체 주간 레이드 후보로 fallback 하므로
      // 다음 주 계획용 데이터가 항상 서버에 올라가게 한다.

      const snapshotJson = exportRaidLeftSnapshot(s, "ALL", weeklyRaidPickRef.current);

      await apiFetch2("/api/me/raid-left-snapshot", {
        method: "PUT",
        body: JSON.stringify({
          nickname: s.profile.nickname,
          snapshotJson,
          source,
        }),
      });

      // 다음 주 계획용 레이드 plan도 같이 업로드
      await uploadFriendRaidPlan();

      setLastRaidSnapUploadedAt(Date.now());
      setRaidSnapUploadState("ok");
      window.setTimeout(() => setRaidSnapUploadState("idle"), 1200);
    } catch (e) {
      setRaidSnapUploadState("error");
      window.setTimeout(() => setRaidSnapUploadState("idle"), 2000);

      if (source === "manual") throw e;
    } finally {
      raidSnapUploadingRef.current = false;
    }
  }

  //  자동 업로드 타이머 (서버모드에서만)
  useEffect(() => {
    if (!SERVER_MODE) return;

    // 기존 타이머 정리
    if (raidSnapAutoTimerRef.current) {
      window.clearInterval(raidSnapAutoTimerRef.current);
      raidSnapAutoTimerRef.current = null;
    }

    if (!state.profile.autoRaidLeftUploadEnabled) return;

    const minutes = Number(state.profile.autoRaidLeftUploadMinutes ?? 60);
    const intervalMs = (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) * 60_000;

    const id = window.setInterval(() => {
      uploadRaidLeftSnapshot("auto").catch(() => { });
    }, intervalMs);

    raidSnapAutoTimerRef.current = id;

    return () => {
      window.clearInterval(id);
      if (raidSnapAutoTimerRef.current === id) raidSnapAutoTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SERVER_MODE, state.profile.autoRaidLeftUploadEnabled, state.profile.autoRaidLeftUploadMinutes]);

  // ✅ 서버 백업 비밀번호
  const [backupPassword, setBackupPassword] = useState("");

  // ✅ 서버로 전체 state 백업 업로드
  async function uploadBackupToServer() {
    if (!SERVER_MODE) return alert("서버 모드가 꺼져 있어요. VITE_SERVER_MODE=1로 켜주세요.");
    const pw = backupPassword.trim();
    if (!pw) return alert("백업 비밀번호를 입력해주세요.");

    const stateJson = exportStateToJson(state);

    await apiFetch2("/api/me/state-backup", {
      method: "PUT",
      body: JSON.stringify({ password: pw, stateJson }),
    });

    alert("서버 백업 업로드 완료!");
  }

  const [restoreCode, setRestoreCode] = useState("");
  // ✅ 서버에서 전체 state 백업 다운로드/복원
  async function downloadBackupFromServer() {
    if (!SERVER_MODE) return alert("서버 모드가 꺼져 있어요. VITE_SERVER_MODE=1로 켜주세요.");
    const pw = backupPassword.trim();
    if (!pw) return alert("백업 비밀번호를 입력해주세요.");

    const r: any = await apiFetch2("/api/me/state-backup", {
      method: "POST",
      body: JSON.stringify({ password: pw }),
    });

    const next = importStateFromJson(String(r?.stateJson ?? ""));
    setState(next);
    alert("서버 백업 다운로드/복원 완료!");
  }

  async function downloadBackupWithCode(code: string) {
    if (!SERVER_MODE) {
      alert("서버 모드가 꺼져 있어요.");
      return;
    }

    const pw = backupPassword.trim();
    const trimmedCode = code.trim(); // ✅ 반드시 있어야 함

    if (!trimmedCode) return alert("코드를 입력해주세요.");
    if (!pw) return alert("백업 비밀번호를 입력해주세요.");

    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("x-friend-code", trimmedCode);

    const res = await fetch("/api/me/state-backup", {
      method: "POST",
      headers,
      body: JSON.stringify({ password: pw }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const next = importStateFromJson(String(data?.stateJson ?? ""));

    // ✅ friendCode도 그 코드로 고정
    setState({
      ...next,
      profile: {
        ...next.profile,
        friendCode: trimmedCode
      }
    });

    alert("서버 복원 완료!");
  }

  async function requestLegacyLink(action: "verify" | "load" | "claim") {
    if (!isLoggedIn) return alert("먼저 로그인해줘.");

    const friendCode = legacyCode.trim();
    const password = backupPassword.trim();
    if (!friendCode) return alert("FC 코드를 입력해줘.");
    if (!password) return alert("서버 백업 비밀번호를 입력해줘.");

    setLegacyBusy(true);
    try {
      const data: any = await apiFetch2("/api/me/link-legacy", {
        method: "POST",
        body: JSON.stringify({
          friendCode,
          password,
          action,
          legacyLoginAllowed,
        }),
      });

      if (action === "load") {
        const next = importStateFromJson(String(data?.stateJson ?? ""));
        setState({
          ...next,
          profile: {
            ...next.profile,
            friendCode,
          },
        });
        alert("연동된 기존 데이터를 불러왔어.");
      } else {
        setLegacyLinkInfo({
          friendCode,
          nickname: data?.nickname ?? null,
          hasBackup: data?.hasBackup,
          updatedAt: data?.updatedAt ?? null,
        });

        if (action === "claim") {
          const nextToken = String(data?.token ?? "");
          if (nextToken) {
            localStorage.setItem(AUTH_TOKEN_KEY, nextToken);
            setAuthToken(nextToken);
          }
          const claimedStateRaw = String(data?.stateJson ?? "");
          if (claimedStateRaw) {
            const next = importStateFromJson(claimedStateRaw);
            setState({
              ...next,
              profile: {
                ...next.profile,
                friendCode,
                nickname: data?.nickname ?? next.profile.nickname,
              },
            });
          } else {
            setState((prev) => ({
              ...prev,
              profile: {
                ...prev.profile,
                friendCode,
                nickname: data?.nickname ?? prev.profile.nickname,
              },
            }));
          }
          await refreshFriends(nextToken || undefined).catch((e) => {
            console.error("친구 목록 동기화 실패", e);
          });
          alert("이 계정에 기존 데이터를 귀속했어.");
        }
      }
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setLegacyBusy(false);
    }
  }

  function parseNum(v: any): number | null {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    // "2500+" 같은 형태도 숫자만 뽑기
    const m = s.match(/(\d+(\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function raidsKey(row: any): string {
    const raidsRaw = Array.isArray(row?.remainingRaids) ? row.remainingRaids.slice(0, 3) : [];

    // ✅ 레이드 순서 표준화 (순서 달라도 같은 조합이면 같은 키)
    const order = (label: string) => {
      const base = String(label).trim().split(/\s+/)[0]; // "세르카 노말" -> "세르카"
      if (base === "세르카") return 0;
      if (base === "종막") return 1;
      if (base === "4막") return 2;
      return 999;
    };

    const norm: string[] = raidsRaw
      .map((x: any) => String(x ?? "").trim())
      .filter(Boolean);

    norm.sort((a: string, b: string) => order(a) - order(b) || a.localeCompare(b, "ko"));

    return norm.join(" | ");
  }
  function inLevelBand(row: any, base: number): boolean {
    const ilvl = parseNum(row?.charItemLevel);
    if (ilvl == null) return false;
    return ilvl >= base && ilvl <= base + 9;
  }

  function renderRoleBadge(role?: CharacterRole) {
    const isSupport = role === "SUPPORT";

    return (
      <span className={`raidBadge role ${isSupport ? "support" : "dealer"}`}>
        <span className="roleIcon">{isSupport ? "✚" : "⚔"}</span>
        {isSupport ? "서폿" : "딜러"}
      </span>
    );
  }
  function recalcScheduleItemAvgPower(item: SharedWeeklyScheduleItem) {
    const myPower = getScheduleSnapshotPowerForItem(item.mySnapshot, item.myCharPower);
    const friendPower = getScheduleSnapshotPowerForItem(item.friendSnapshot, item.friendCharPower);

    return myPower != null && friendPower != null
      ? Math.round((myPower + friendPower) / 2)
      : null;
  }

  function syncSchedulePowerSnapshotsForChar(
    schedules: SharedWeeklySchedule[],
    myFriendCode: string,
    tableId: string,
    charId: string,
    nextPower: number | null
  ) {
    const myCharKey = `${tableId}|${charId}`;

    return schedules.map((schedule) => {
      const isOwnerView = schedule.ownerFriendCode === myFriendCode;
      const isTargetView = schedule.targetFriendCode === myFriendCode;

      const nextItems = schedule.items.map((item) => {
        let changed = false;
        let nextItem = item;

        // 내가 owner일 때: 내 캐릭은 myCharKey
        if (isOwnerView && item.myCharKey === myCharKey) {
          nextItem = {
            ...nextItem,
            myCharPower: nextPower,
          };
          changed = true;
        }

        // 내가 target일 때: 내 캐릭은 friendCharKey로 들어있음
        if (
          isTargetView &&
          getScheduleCandidateKeysForItem(
            item.friendCharKey,
            item.friendTableName,
            item.friendCharName,
            item.friendSnapshot
          ).includes(myCharKey)
        ) {
          nextItem = {
            ...nextItem,
            friendCharPower: nextPower,
          };
          changed = true;
        }

        if (!changed) return item;

        return {
          ...nextItem,
          avgPower: recalcScheduleItemAvgPower(nextItem),
        };
      });

      return nextItems === schedule.items
        ? schedule
        : {
          ...schedule,
          items: nextItems,
        };
    });
  }

  function renderFriendRaidLeftColumns() {
    if (!selectedFriendCode) return <div className="todo-hint">친구를 선택해줘.</div>;

    const f = state.friends.find((x) => x.code === selectedFriendCode);
    if (!f) return <div className="todo-hint">친구를 찾을 수 없어.</div>;

    const rawSnap: any = friendSnapshots[selectedFriendCode];
    const rawPlan: any = friendRaidPlans[selectedFriendCode];

    if (schedulePlanningMode === "CURRENT") {
      if (!rawSnap?.data) {
        return <div className="todo-hint">친구 스냅샷이 없어. (서버에서 불러오기 또는 스냅샷 붙여넣기)</div>;
      }
      if (rawSnap.shareMode === "PRIVATE") {
        return <div className="todo-hint">친구가 비공개야.</div>;
      }
    }

    const nextResetPlanMissing =
      schedulePlanningMode === "NEXT_RESET" &&
      !(Array.isArray(rawPlan?.data) && rawPlan.data.length > 0) &&
      !(Array.isArray(rawSnap?.data) && rawSnap.data.length > 0);

    const nextResetPlanPrivate =
      schedulePlanningMode === "NEXT_RESET" && rawPlan?.shareMode === "PRIVATE";

    const snap =
      rawSnap?.data
        ? (normalizeFriendRaidSnapshotAfterWeeklyReset(
          rawSnap,
          state.reset?.weeklyResetWeekday ?? 3,
          state.reset?.dailyResetHour ?? 6
        ) as typeof rawSnap & { isStaleAfterWeeklyReset?: boolean })
        : null;

    const isStaleFriendSnapshot = Boolean(snap?.isStaleAfterWeeklyReset);

    type FriendSnapshotRow = {
      charKey?: string;
      charName: string;
      charItemLevel?: string;
      charPower?: string;
      tableName?: string;
      ilvl?: number;
      allRaids: string[];
      activeRaids?: string[];
      remainingRaids: string[];
      clearedRaids?: string[];
      clearedCount: number;
      totalCount: number;
    };

    const normalizeRaidName = (name: string) =>
      String(name ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\s*(노말|하드|나이트메어|1단계|2단계|3단계)\s*$/g, "");

    function getFriendNextResetDefaultRaids(ilvl: number, fallbackRaids: string[]): string[] {
      const normalizedFallbackRaids = Array.isArray(fallbackRaids)
        ? fallbackRaids.map((raid: string) => normalizeRaidName(raid)).filter(Boolean)
        : [];

      if (normalizedFallbackRaids.length > 0) {
        return normalizedFallbackRaids;
      }

      const WEEKLY_RAID_MIN_ILVL: Record<string, number> = {
        "1막": 1660,
        "2막": 1670,
        "3막": 1680,
        "4막": 1700,
        "종막": 1710,
        "세르카": 1710,
        "지평의 성당": 1700,
      };

      const fullEligibleRaids = Object.entries(WEEKLY_RAID_MIN_ILVL)
        .filter(([, minIlvl]) => Number.isFinite(ilvl) && ilvl >= minIlvl)
        .map(([raidName]) => normalizeRaidName(raidName));

      return fullEligibleRaids;
    }

    const nextResetRowMap = new Map<string, any>();

    const normalizedSnapRows =
      Array.isArray(snap?.data) ? snap.data : Array.isArray(rawSnap?.data) ? rawSnap.data : [];

    const planRows = Array.isArray(rawPlan?.data) ? rawPlan.data : [];

    const makeFriendRowKey = (row: any) =>
      `${String(row?.tableName ?? "").trim()}|${String(row?.charName ?? "").trim()}`;

    // 1순위: 다음 주 계획(plan)
    for (const row of planRows) {
      nextResetRowMap.set(makeFriendRowKey(row), row);
    }

    // 2순위: 정규화된 스냅샷
    for (const row of normalizedSnapRows) {
      const key = makeFriendRowKey(row);
      if (!nextResetRowMap.has(key)) {
        nextResetRowMap.set(key, row);
      }
    }

    const nextResetSourceRows = Array.from(nextResetRowMap.values());

    const rows: FriendSnapshotRow[] =
      schedulePlanningMode === "NEXT_RESET"
        ? nextResetSourceRows
          .map((row: any): FriendSnapshotRow => {
            const rowIlvl =
              typeof row?.ilvl === "number"
                ? row.ilvl
                : Number(row?.charItemLevel ?? 0);

            const normalizedAllRaids = Array.isArray(row?.allRaids)
              ? row.allRaids.map((raid: string) => normalizeRaidName(raid)).filter(Boolean)
              : [];

            const normalizedRemainingRaids = Array.isArray(row?.remainingRaids)
              ? row.remainingRaids.map((raid: string) => normalizeRaidName(raid)).filter(Boolean)
              : [];

            const fallbackRaids = getFriendNextResetDefaultRaids(
              rowIlvl,
              normalizedAllRaids.length > 0 ? normalizedAllRaids : normalizedRemainingRaids
            );

            return {
              charKey: row?.charKey ? String(row.charKey) : undefined,
              charName: String(row?.charName ?? ""),
              charItemLevel: row?.charItemLevel ? String(row.charItemLevel) : undefined,
              charPower: row?.charPower ? String(row.charPower) : undefined,
              tableName: row?.tableName ? String(row.tableName) : "",
              ilvl: rowIlvl,
              allRaids: fallbackRaids,
              remainingRaids: [...fallbackRaids],
              clearedCount: 0,
              totalCount: fallbackRaids.length,
            };
          })
          .filter((r: FriendSnapshotRow) => Boolean(r && r.charName && r.remainingRaids.length > 0))
        : (Array.isArray(snap?.data) ? snap.data : [])
          .map((row: any): FriendSnapshotRow => {
            const rowIlvl =
              typeof row?.ilvl === "number"
                ? row.ilvl
                : Number(row?.charItemLevel ?? 0);

            const normalizedAllRaids = Array.isArray(row?.allRaids)
              ? row.allRaids.map((raid: string) => normalizeRaidName(raid)).filter(Boolean)
              : [];

            const normalizedRemainingRaids = Array.isArray(row?.remainingRaids)
              ? row.remainingRaids.map((raid: string) => normalizeRaidName(raid)).filter(Boolean)
              : [];
            const displayAllRaids = normalizedAllRaids.length > 0 ? normalizedAllRaids : normalizedRemainingRaids;

            return {
              ...row,
              charKey: row?.charKey ? String(row.charKey) : undefined,
              charName: String(row?.charName ?? ""),
              charItemLevel: row?.charItemLevel ? String(row.charItemLevel) : undefined,
              charPower: row?.charPower ? String(row.charPower) : undefined,
              tableName: row?.tableName ? String(row.tableName) : "",
              ilvl: rowIlvl,
              allRaids: displayAllRaids,
              remainingRaids: normalizedRemainingRaids,
              clearedCount: Number(row?.clearedCount ?? 0),
              totalCount: Number(row?.totalCount ?? displayAllRaids.length),
            };
          })
          .filter((r: FriendSnapshotRow) => Boolean(r && r.charName));

    const friendTableNames: string[] = Array.from(
      new Set<string>(
        rows
          .map((row: FriendSnapshotRow) => String(row.tableName ?? "").trim())
          .filter((name: string) => Boolean(name))
      )
    );

    const levelRange = {
      min: Number(kkanbuLevelMin) || 0,
      max: Number(kkanbuLevelMax) || Number.MAX_SAFE_INTEGER,
    };

    const avgTarget = Number(String(kkanbuAvgPowerTarget ?? "").replace(/[^\d.]/g, "")) || 0;

    const weeklyRaidTasks = state.tasks.filter(
      (t) =>
        t.period === "WEEKLY" &&
        (t.section ?? "").trim() === "주간 레이드" &&
        t.cellType === "CHECK"
    );

    const weeklyRaidTitleToId = new Map(
      weeklyRaidTasks.map((task) => [normalizeRaidName(task.title), task.id] as const)
    );

    function parsePowerValue(power?: string): number {
      if (!power) return 0;

      const cleaned = String(power)
        .trim()
        .replace(/,/g, "")
        .replace(/[^\d.]/g, ""); // +, 공백, 문자 제거

      const num = Number(cleaned);
      return Number.isFinite(num) ? num : 0;
    }

    const myCandidates: MyCandidate[] = state.tables
      .filter((tbl) => !excludedKkanbuTableIds.includes(tbl.id)) // 제외 표는 매칭 후보에서 제거
      .flatMap((tbl) =>
        tbl.characters
          .map((ch) => {
            const ilvl = getCharIlvl(ch);
            const power = parsePowerValue(ch.power);

            const charKey = weeklyCharKey(tbl.id, ch.id);
            const pick =
              Number.isFinite(ilvl) && ilvl > 0
                ? (weeklyRaidPickByChar[charKey] ?? getDefaultWeeklyRaidPick(ilvl))
                : { raids: [], diffs: {} };

            const selectedRaids: string[] = Array.isArray(pick?.raids)
              ? pick.raids.map((raid: string) => normalizeRaidName(raid))
              : [];

            const allRaids: string[] = getMyAllWeeklyRaids(tbl.id, ch.id, ilvl);

            const remainingRaids: string[] = allRaids.filter((raidName: string) => {
              const taskId = weeklyRaidTitleToId.get(normalizeRaidName(raidName));
              if (!taskId) return false;

              const cell = getCellByTableId(state, tbl.id, taskId, ch.id);
              const checked = cell?.type === "CHECK" ? cell.checked : false;
              return !checked;
            });

            const activeRaids =
              schedulePlanningMode === "NEXT_RESET" ? allRaids : remainingRaids;

            return {
              key: `${tbl.id}|${ch.id}`,
              tableId: tbl.id,
              tableName: tbl.name ?? "",
              charId: ch.id,
              name: ch.name,
              ilvl,
              power,
              remainingRaids,
              allRaids,
              activeRaids,
            };
          })
          .filter(
            (x: MyCandidate) =>
              x.ilvl >= levelRange.min &&
              x.ilvl <= levelRange.max &&
              x.allRaids.length > 0
          )
      );

    const schedule = weeklySchedules.find((s) => s.id === selectedScheduleId);

    function getScheduledRaidSetForMyScheduleCandidate(
      schedule: SharedWeeklySchedule,
      me: MyCandidate
    ) {
      const scheduledRaidSet = new Set<string>();

      for (const item of schedule.items) {
        const itemKeys = getScheduleCandidateKeys(
          item.myCharKey,
          item.myTableName,
          item.myCharName,
          item.mySnapshot
        );
        const friendItemKeys = getScheduleCandidateKeys(
          item.friendCharKey,
          item.friendTableName,
          item.friendCharName,
          item.friendSnapshot
        );

        if (!itemKeys.includes(me.key) && !friendItemKeys.includes(me.key)) continue;

        for (const raid of getScheduleItemRaidNames(item)) {
          scheduledRaidSet.add(normalizeRaidName(raid));
        }
      }

      return scheduledRaidSet;
    }

    function getAvailableRaidsForMyScheduleCandidate(
      schedule: SharedWeeklySchedule,
      me: MyCandidate
    ) {
      const scheduledRaidSet = getScheduledRaidSetForMyScheduleCandidate(schedule, me);

      return me.activeRaids.filter(
        (raid) => !scheduledRaidSet.has(normalizeRaidName(raid))
      );
    }

    const selectableMyScheduleCandidates = myCandidates.filter((me) => {
      if (!schedule) return false;

      return getAvailableRaidsForMyScheduleCandidate(schedule, me).length > 0;
    });

    // 공유 일정표에 이미 들어간 레이드 표시용
    const scheduledMyRaidSetByChar = new Map<string, Set<string>>();
    const scheduledFriendRaidSetByChar = new Map<string, Set<string>>();

    function addScheduledRaids(
      map: Map<string, Set<string>>,
      charKey: string | null | undefined,
      raidNames: string[]
    ) {
      const key = String(charKey ?? "").trim();
      if (!key) return;
      const prev = map.get(key) ?? new Set<string>();
      raidNames.forEach((raid) => prev.add(raid));
      map.set(key, prev);
    }

    function addScheduledRaidsToKeys(
      map: Map<string, Set<string>>,
      keys: string[],
      raidNames: string[]
    ) {
      keys.forEach((key) => addScheduledRaids(map, key, raidNames));
    }

    function getSnapshotCandidateKey(tableName: string | null | undefined, charName: string | null | undefined) {
      const name = String(charName ?? "").trim();
      if (!name) return "";
      return `${String(tableName ?? "").trim()}|${name}`;
    }

    if (schedule) {
      const { isTargetView } = getSchedulePerspectiveForCurrentUser(schedule);

      for (const item of schedule.items) {
        // 4/26 실제 일정표에 들어간 레이드만 흑백 처리되도록 수정
        const itemScheduledRaids = getScheduleItemRaidNames(item).map((raid) => normalizeRaidName(raid));

        if (isTargetView) {
          addScheduledRaidsToKeys(
            scheduledMyRaidSetByChar,
            getScheduleCandidateKeys(
              item.friendCharKey,
              item.friendTableName,
              item.friendCharName,
              item.friendSnapshot
            ),
            itemScheduledRaids
          );

          // 친구가 보는 화면에서는 owner 캐릭터가 오른쪽 "친구 캐릭터" 목록에 있다.
          // 최신 일정표는 tableName|charName으로 맞추고, 구버전 일정표는 이름만으로도 보정한다.
          addScheduledRaidsToKeys(
            scheduledFriendRaidSetByChar,
            getScheduleCandidateKeys(
              item.myCharKey,
              item.myTableName,
              item.myCharName,
              item.mySnapshot
            ),
            itemScheduledRaids
          );
        } else {
          addScheduledRaidsToKeys(
            scheduledMyRaidSetByChar,
            getScheduleCandidateKeys(
              item.myCharKey,
              item.myTableName,
              item.myCharName,
              item.mySnapshot
            ),
            itemScheduledRaids
          );
          addScheduledRaidsToKeys(
            scheduledFriendRaidSetByChar,
            getScheduleCandidateKeys(
              item.friendCharKey,
              item.friendTableName,
              item.friendCharName,
              item.friendSnapshot
            ),
            itemScheduledRaids
          );
        }
      }
    }
    function getRemainScheduleState(
      charKey: string,
      targetRaids: string[],
      raidSetMap: Map<string, Set<string>>,
      extraKeys: string[] = []
    ) {
      const scheduledSet = new Set<string>();
      compactScheduleKeys([charKey, ...extraKeys]).forEach((key) => {
        const directSet = raidSetMap.get(key);
        if (directSet) directSet.forEach((raid) => scheduledSet.add(raid));

        const charNameFallback = key.includes("|")
          ? key.split("|").slice(-1)[0]
          : "";

        if (charNameFallback) {
          const nameSet = raidSetMap.get(charNameFallback);
          if (nameSet) nameSet.forEach((raid) => scheduledSet.add(raid));
        }
      });

      const scheduledRaids = targetRaids.filter((raid) =>
        scheduledSet.has(normalizeRaidName(raid))
      );

      const allScheduled =
        targetRaids.length > 0 && scheduledRaids.length === targetRaids.length;

      return {
        scheduledSet,
        scheduledRaids,
        allScheduled,
      };
    }

    const friendCandidates = rows
      .filter((row: any) => {
        const tableName = String(row.tableName ?? "").trim();
        return !excludedFriendKkanbuTableNames.includes(tableName);
      })
      .map((row: any) => {
        const ilvl = Number(row.ilvl) || parsePowerValue(row.charItemLevel);
        const power = parsePowerValue(row.charPower);

        const normalizedRemainingRaids =
          Array.isArray(row.remainingRaids) && row.remainingRaids.length > 0
            ? row.remainingRaids.map((raid: string) => normalizeRaidName(raid))
            : [];

        const normalizedAllRaids =
          Array.isArray(row.allRaids) && row.allRaids.length > 0
            ? row.allRaids.map((raid: string) => normalizeRaidName(raid))
            : normalizedRemainingRaids;

        const computedNextResetRaids = getFriendNextResetDefaultRaids(
          ilvl,
          normalizedAllRaids.length > 0 ? normalizedAllRaids : normalizedRemainingRaids
        );

        const allRaids =
          schedulePlanningMode === "NEXT_RESET"
            ? computedNextResetRaids
            : normalizedAllRaids;

        const remainingRaids =
          schedulePlanningMode === "NEXT_RESET"
            ? computedNextResetRaids
            : normalizedRemainingRaids;

        const clearedRaids = Array.isArray(row.clearedRaids)
          ? row.clearedRaids.map((raid: string) => normalizeRaidName(raid))
          : [];

        const activeRaids =
          schedulePlanningMode === "NEXT_RESET" ? allRaids : remainingRaids;

        return {
          key: String(row.charKey ?? "").trim() || `${row.tableName ?? ""}|${row.charName ?? ""}`,
          tableName: row.tableName ?? "",
          name: row.charName ?? "",
          ilvl,
          power,
          remainingRaids,
          allRaids,
          activeRaids,
          clearedRaids,
        };
      })
      .filter(
        (x: FriendCandidate) =>
          x.ilvl >= levelRange.min &&
          x.ilvl <= levelRange.max &&
          x.allRaids.length > 0
      );

    const hasNoFriendCandidates = friendCandidates.length === 0;
    const hasNoMyCandidates = myCandidates.length === 0;

    const pairResults = manualKkanbuPairs.map((pair: ManualKkanbuPair, idx: number) => {
      const my = myCandidates.find((x: MyCandidate) => x.key === pair.myKey) ?? null;
      const friend = friendCandidates.find((x: FriendCandidate) => x.key === pair.friendKey) ?? null;

      const commonRaids: string[] =
        my && friend
          ? my.activeRaids
            .map((raid: string) => normalizeRaidName(raid))
            .filter((raid: string, index: number, arr: string[]) => arr.indexOf(raid) === index)
            .filter((raid: string) =>
              friend.activeRaids.some((fr: string) => normalizeRaidName(fr) === raid)
            )
          : [];

      const activeSelectedRaids: string[] =
        commonRaids.length === 0
          ? []
          : (pair.selectedRaids === null ? commonRaids : pair.selectedRaids).filter((raid) =>
            commonRaids.some((cr) => normalizeRaidName(cr) === normalizeRaidName(raid))
          );

      const avgPower =
        my && friend && my.power > 0 && friend.power > 0
          ? Math.round((my.power + friend.power) / 2)
          : null;

      const diffFromTarget =
        avgPower != null && avgTarget > 0 ? Math.abs(avgPower - avgTarget) : null;

      return {
        idx,
        my,
        friend,
        commonRaids,
        activeSelectedRaids,
        avgPower,
        diffFromTarget,
      };
    });

    const shareablePairResults = pairResults.filter((result) => result.my && result.friend);

    const buildKkanbuShareText = () => {
      if (!shareablePairResults.length) {
        return [
          "[깐부 추천 매칭]",
          `레벨대: ${kkanbuLevelMin}~${kkanbuLevelMax} / 목표 깐평: ${kkanbuAvgPowerTarget}`,
          "",
          "공유할 매칭 결과가 아직 없어.",
        ].join("\n");
      }

      return [
        "[깐부 추천 매칭]",
        `레벨대: ${kkanbuLevelMin}~${kkanbuLevelMax} / 목표 깐평: ${kkanbuAvgPowerTarget}`,
        "",
        ...shareablePairResults.map((result, idx) => {
          const myName = result.my?.name ?? "-";
          const friendName = result.friend?.name ?? "-";
          const avg = result.avgPower ?? "-";
          const diff =
            result.diffFromTarget != null ? ` (목표 차이 ${result.diffFromTarget})` : "";
          const raids = result.activeSelectedRaids.length
            ? result.activeSelectedRaids.join(", ")
            : "선택 안 됨";

          return [
            `${idx + 1}. ${myName} ↔ ${friendName}`,
            `- 깐평: ${avg}${diff}`,
            `- 같이 가는 레이드: ${raids}`,
          ].join("\n");
        }),
      ].join("\n");
    };

    const handleCopyKkanbuShare = async () => {
      try {
        await navigator.clipboard.writeText(buildKkanbuShareText());
        setShareKkanbuCopied(true);
        window.setTimeout(() => setShareKkanbuCopied(false), 1500);
      } catch {
        setShareKkanbuCopied(false);
        alert("복사에 실패했어. 다시 시도해줘.");
      }
    };

    const myScheduleCandidates: FriendCandidate[] = myCandidates.map((me) => ({
      key: me.key,
      tableName: me.tableName,
      name: me.name,
      ilvl: me.ilvl,
      power: me.power,
      remainingRaids: me.remainingRaids,
      allRaids: me.allRaids,
      activeRaids: me.activeRaids,
      clearedRaids: [],
    }));

    const myFriendCode = String(state.profile.friendCode ?? "").trim();

    function getLivePowerFromMyTables(charKey: string): number | null {
      const [tableId, charId] = String(charKey ?? "").split("|");
      if (!tableId || !charId) return null;

      const table = state.tables.find((t) => t.id === tableId);
      const ch = table?.characters.find((c) => c.id === charId);
      if (!ch) return null;

      return parsePowerValue(ch.power);
    }

    function compactScheduleKeys(keys: Array<string | null | undefined>) {
      const seen = new Set<string>();
      const out: string[] = [];

      for (const key of keys) {
        const value = String(key ?? "").trim();
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.push(value);
      }

      return out;
    }

    function getScheduleSnapshotCandidateKey(
      tableName?: string | null,
      charName?: string | null
    ) {
      const name = String(charName ?? "").trim();
      if (!name) return "";
      const table = String(tableName ?? "").trim();
      return table ? `${table}|${name}` : name;
    }

    function hasLocalScheduleCharKey(charKey: string | null | undefined) {
      const key = String(charKey ?? "").trim();
      if (!key || !key.includes("|")) return false;
      const [tableId, charId] = key.split("|");

      return state.tables.some(
        (table) =>
          table.id === tableId && table.characters.some((ch) => ch.id === charId)
      );
    }

    function findLocalScheduleCharKeyByName(
      name?: string | null,
      tableName?: string | null
    ) {
      const normalizedName = String(name ?? "").trim();
      const normalizedTable = String(tableName ?? "").trim();
      if (!normalizedName) return "";

      if (normalizedTable) {
        for (const table of state.tables) {
          if (String(table.name ?? "").trim() !== normalizedTable) continue;
          const ch = table.characters.find(
            (candidate) => String(candidate.name ?? "").trim() === normalizedName
          );
          if (ch) return `${table.id}|${ch.id}`;

          const placeholderIndex = Number(normalizedName.match(/(\d+)$/)?.[1] ?? 0);
          if (placeholderIndex > 0 && placeholderIndex <= table.characters.length) {
            const fallbackChar = table.characters[placeholderIndex - 1];
            if (fallbackChar) return `${table.id}|${fallbackChar.id}`;
          }
        }
      }

      for (const table of state.tables) {
        const ch = table.characters.find(
          (candidate) => String(candidate.name ?? "").trim() === normalizedName
        );
        if (ch) return `${table.id}|${ch.id}`;
      }

      return "";
    }

    function resolveLocalScheduleCharKey(
      charKey: string | null | undefined,
      snapshot?: SharedScheduleCharacterSnapshot | null,
      fallbackName?: string | null,
      fallbackTableName?: string | null
    ) {
      const direct = String(charKey ?? "").trim();
      if (hasLocalScheduleCharKey(direct)) return direct;

      const snapshotKey = String(snapshot?.key ?? "").trim();
      if (hasLocalScheduleCharKey(snapshotKey)) return snapshotKey;

      return findLocalScheduleCharKeyByName(
        snapshot?.name ?? fallbackName,
        snapshot?.tableName ?? fallbackTableName
      );
    }

    function getScheduleCandidateKeys(
      charKey: string | null | undefined,
      tableName: string | null | undefined,
      charName: string | null | undefined,
      snapshot?: SharedScheduleCharacterSnapshot | null
    ) {
      const name = String(snapshot?.name ?? charName ?? "").trim();
      const table = String(snapshot?.tableName ?? tableName ?? "").trim();
      const localKey = resolveLocalScheduleCharKey(charKey, snapshot, charName, tableName);

      return compactScheduleKeys([
        localKey,
        charKey,
        snapshot?.key,
        name,
        getScheduleSnapshotCandidateKey(table, name),
      ]);
    }

    function isSameFriendScheduleCandidate(
      friend: FriendCandidate,
      charKey: string | null | undefined,
      tableName: string | null | undefined,
      charName: string | null | undefined,
      snapshot?: SharedScheduleCharacterSnapshot | null
    ) {
      const scheduleKeys = getScheduleCandidateKeys(charKey, tableName, charName, snapshot);
      const friendKey = String(friend.key ?? "").trim();
      const friendName = String(friend.name ?? "").trim();
      const friendTable = String(friend.tableName ?? "").trim();
      const friendTableNameKey = getScheduleSnapshotCandidateKey(friendTable, friendName);

      if (friendKey && scheduleKeys.includes(friendKey)) return true;
      if (friendTableNameKey && scheduleKeys.includes(friendTableNameKey)) return true;

      const scheduleTable = String(snapshot?.tableName ?? tableName ?? "").trim();
      return Boolean(
        friendName &&
          scheduleKeys.includes(friendName) &&
          (!friendTable || !scheduleTable)
      );
    }

    function getScheduleSnapshotPower(
      snapshot: SharedScheduleCharacterSnapshot | null | undefined,
      fallback: number | null | undefined
    ) {
      return parseScheduleNumberValue(snapshot?.power ?? fallback);
    }

    function getScheduleMyDisplayName(item: SharedWeeklyScheduleItem) {
      return item.mySnapshot?.name || item.myCharName || "내 캐릭";
    }

    function getScheduleFriendDisplayName(item: SharedWeeklyScheduleItem) {
      return item.friendSnapshot?.name || item.friendCharName || "";
    }

    function getScheduleFriendSelectValue(
      schedule: SharedWeeklySchedule,
      item: SharedWeeklyScheduleItem
    ) {
      const resolved = resolveLocalScheduleCharKey(
        item.friendCharKey,
        item.friendSnapshot,
        item.friendCharName,
        item.friendTableName
      );

      return (
        resolved ||
        String(
          item.friendCharKey ??
            item.friendSnapshot?.key ??
            getScheduleSnapshotCandidateKey(
              item.friendSnapshot?.tableName ?? item.friendTableName,
              item.friendSnapshot?.name ?? item.friendCharName
            )
        ).trim()
      );
    }

    function getLiveSchedulePower(
      charKey: string | null | undefined,
      snapshot: SharedScheduleCharacterSnapshot | null | undefined,
      fallbackName?: string | null,
      fallbackTableName?: string | null
    ) {
      const localKey = resolveLocalScheduleCharKey(charKey, snapshot, fallbackName, fallbackTableName);
      return localKey ? getLivePowerFromMyTables(localKey) : null;
    }

    function getScheduleViewerPerspective(schedule: SharedWeeklySchedule) {
      const isOwnerView = schedule.ownerFriendCode === myFriendCode;
      const isTargetView = schedule.targetFriendCode === myFriendCode;

      return {
        isOwnerView,
        isTargetView,
      };
    }

    function getDisplayedSchedulePowers(
      schedule: SharedWeeklySchedule,
      item: SharedWeeklyScheduleItem
    ) {
      const { isOwnerView, isTargetView } = getScheduleViewerPerspective(schedule);

      // owner가 볼 때:
      // - myChar = 내 로컬 캐릭이므로 실시간 조회 가능
      // - friendChar = 스냅샷/선택값 기준
      if (isOwnerView) {
        const myPower =
          getLiveSchedulePower(item.myCharKey, item.mySnapshot, item.myCharName, item.myTableName) ??
          getScheduleSnapshotPower(item.mySnapshot, item.myCharPower);
        const friendPower = getScheduleSnapshotPower(item.friendSnapshot, item.friendCharPower);

        return {
          myPower,
          friendPower,
          avgPower:
            myPower != null && friendPower != null
              ? Math.round((myPower + friendPower) / 2)
              : null,
        };
      }

      // target이 볼 때:
      // - friendCharKey가 "내 캐릭"이므로 로컬에서 실시간 조회 가능
      // - myCharPower는 상대(owner) 저장값 사용
      if (isTargetView) {
        const myPower = getScheduleSnapshotPower(item.mySnapshot, item.myCharPower);
        const friendPower =
          getLiveSchedulePower(item.friendCharKey, item.friendSnapshot, item.friendCharName, item.friendTableName) ??
          getScheduleSnapshotPower(item.friendSnapshot, item.friendCharPower);

        return {
          myPower,
          friendPower,
          avgPower:
            myPower != null && friendPower != null
              ? Math.round((myPower + friendPower) / 2)
              : null,
        };
      }

      return {
        myPower: getScheduleSnapshotPower(item.mySnapshot, item.myCharPower),
        friendPower: getScheduleSnapshotPower(item.friendSnapshot, item.friendCharPower),
        avgPower: item.avgPower ?? null,
      };
    }

    function getLiveFriendCharPower(
      schedule: SharedWeeklySchedule,
      item: SharedWeeklyScheduleItem
    ): number | null {
      const selectedKey = getScheduleFriendSelectValue(schedule, item);
      if (!selectedKey && !item.friendSnapshot && !item.friendCharName) return null;

      const candidateKeys = getScheduleCandidateKeys(
        item.friendCharKey,
        item.friendTableName,
        item.friendCharName,
        item.friendSnapshot
      );
      const sourceCandidates = getScheduleAssignableCandidates(schedule);
      const friend = sourceCandidates.find(
        (fr) => fr.key === selectedKey || candidateKeys.includes(fr.key)
      );
      if (!friend) return getScheduleSnapshotPower(item.friendSnapshot, item.friendCharPower);

      return friend.power ?? getScheduleSnapshotPower(item.friendSnapshot, item.friendCharPower);
    }

    function getScheduleAssignableCandidates(
      schedule: SharedWeeklySchedule
    ): FriendCandidate[] {
      if (schedule.targetFriendCode === myFriendCode) {
        return myScheduleCandidates;
      }

      return friendCandidates;
    }

    function getSchedulableRaidsForFriendCandidate(friend: FriendCandidate) {
      const clearedSet = new Set(
        (friend.clearedRaids ?? []).map((raid: string) => normalizeRaidName(raid))
      );
      const seen = new Set<string>();
      const raids: string[] = [];

      for (const raid of [
        ...friend.activeRaids,
        ...friend.remainingRaids,
        ...friend.allRaids,
      ]) {
        const normalized = normalizeRaidName(raid);
        if (!normalized || seen.has(normalized) || clearedSet.has(normalized)) continue;
        seen.add(normalized);
        raids.push(raid);
      }

      return raids;
    }

    function getCommonRaidsForScheduleItem(
      item: SharedWeeklyScheduleItem,
      friend: FriendCandidate
    ): string[] {
      const baseRaids =
        Array.isArray(item.baseRaidNames) && item.baseRaidNames.length
          ? item.baseRaidNames
          : item.raidNames ?? [];
      const candidateRaids = getSchedulableRaidsForFriendCandidate(friend);

      return baseRaids
        .map((raid: string) => normalizeRaidName(raid))
        .filter((raid: string, index: number, arr: string[]) => arr.indexOf(raid) === index)
        .filter((raid: string) =>
          candidateRaids.some((fr: string) => normalizeRaidName(fr) === raid)
        );
    }

    function getSelectableFriendOptionsForScheduleItem(
      schedule: SharedWeeklySchedule,
      item: SharedWeeklyScheduleItem
    ): Array<{
      key: string;
      tableName?: string;
      name: string;
      ilvl: number;
      power: number;
      remainingRaids: string[];
      commonRaids: string[];
    }> {
      const currentSelectedKey = getScheduleFriendSelectValue(schedule, item);
      const sourceCandidates = getScheduleAssignableCandidates(schedule);

      const options = sourceCandidates
        .map((fr: FriendCandidate) => {
          const usedRaidSet = new Set<string>(
            schedule.items
              .filter(
                (x: SharedWeeklyScheduleItem) =>
                  x.id !== item.id &&
                  (isSameFriendScheduleCandidate(
                    fr,
                    x.friendCharKey,
                    x.friendTableName,
                    x.friendCharName,
                    x.friendSnapshot
                  ) ||
                    isSameFriendScheduleCandidate(
                      fr,
                      x.myCharKey,
                      x.myTableName,
                      x.myCharName,
                      x.mySnapshot
                    ))
              )
              .flatMap((x: SharedWeeklyScheduleItem) => x.raidNames ?? [])
              .map((raid: string) => normalizeRaidName(raid))
          );

          const commonRaids = getCommonRaidsForScheduleItem(item, fr).filter(
            (raid: string) => !usedRaidSet.has(normalizeRaidName(raid))
          );

          return {
            ...fr,
            commonRaids,
          };
        })
        .filter((fr: FriendCandidate & { commonRaids: string[] }) => {
          return fr.commonRaids.length > 0;
        });

      if (false &&
        currentSelectedKey &&
        !options.some((fr) => fr.key === currentSelectedKey) &&
        (item.friendSnapshot?.name || item.friendCharName)
      ) {
        const snapshotRaids = Array.isArray(item.friendSnapshot?.raids)
          ? item.friendSnapshot?.raids?.map((raid) => normalizeRaidName(raid)) ?? []
          : getScheduleItemRaidNames(item);

        options.unshift({
          key: currentSelectedKey,
          tableName: item.friendSnapshot?.tableName ?? item.friendTableName ?? "",
          name: item.friendSnapshot?.name ?? item.friendCharName ?? "친구 캐릭",
          ilvl: parseScheduleNumberValue(item.friendSnapshot?.ilvl ?? item.friendSnapshot?.itemLevel) ?? 0,
          power: getScheduleSnapshotPower(item.friendSnapshot, item.friendCharPower) ?? 0,
          remainingRaids: snapshotRaids,
          allRaids: snapshotRaids,
          activeRaids: snapshotRaids,
          clearedRaids: [],
          commonRaids: getScheduleItemRaidNames(item),
        });
      }

      return options;
    }

    function assignFriendToScheduleItem(
      scheduleId: string,
      itemId: string,
      friendKey: string
    ) {
      setWeeklySchedules((prev) =>
        prev.map((schedule) => {
          if (schedule.id !== scheduleId) return schedule;

          const nextItems = schedule.items.map((item) => {
            if (item.id !== itemId) return item;

            // 선택 해제
            if (!friendKey) {
              return {
                ...item,
                mode: "OPEN_SLOT" as const,
                friendCharKey: null,
                friendCharName: null,
                friendTableName: null,
                friendCharPower: null,
                friendSnapshot: null,
                friendClearedRaidNames: [],
                raidNames: Array.isArray(item.baseRaidNames) ? [...item.baseRaidNames] : [],
                avgPower: null,
              };
            }

            const candidatePool = getScheduleAssignableCandidates(schedule);
            const friend = candidatePool.find((fr) => fr.key === friendKey);
            if (!friend) return item;

            const usedRaidSet = new Set(
              schedule.items
                .filter(
                  (x) =>
                    x.id !== item.id &&
                    (isSameFriendScheduleCandidate(
                      friend,
                      x.friendCharKey,
                      x.friendTableName,
                      x.friendCharName,
                      x.friendSnapshot
                    ) ||
                      isSameFriendScheduleCandidate(
                        friend,
                        x.myCharKey,
                        x.myTableName,
                        x.myCharName,
                        x.mySnapshot
                      ))
                )
                .flatMap((x) => x.raidNames ?? [])
                .map((raid) => normalizeRaidName(raid))
            );

            const commonRaids = getCommonRaidsForScheduleItem(item, friend).filter(
              (raid) => !usedRaidSet.has(normalizeRaidName(raid))
            );

            const myPower = getScheduleSnapshotPower(item.mySnapshot, item.myCharPower);
            const avgPower =
              myPower != null && friend.power > 0
                ? Math.round((myPower + friend.power) / 2)
                : null;

            return {
              ...item,
              mode: "MATCHED" as const,
              friendCharKey: friend.key,
              friendCharName: friend.name,
              friendTableName: friend.tableName ?? null,
              friendCharPower: friend.power ?? null,
              friendSnapshot: buildScheduleCharacterSnapshot(friend),
              raidNames: [...commonRaids],
              avgPower,
            };
          });

          return {
            ...schedule,
            items: nextItems,
          };
        })
      );
    }

    function getCommonRaidsBetween(
      my: MyCandidate & { remainingRaids?: string[] },
      friend: FriendCandidate & { remainingRaids?: string[] }
    ): string[] {
      const mySource =
        Array.isArray(my.remainingRaids) ? my.remainingRaids : my.activeRaids;

      const friendSource =
        Array.isArray(friend.remainingRaids) ? friend.remainingRaids : friend.activeRaids;

      return mySource
        .map((raid: string) => normalizeRaidName(raid))
        .filter((raid: string, index: number, arr: string[]) => arr.indexOf(raid) === index)
        .filter((raid: string) =>
          friendSource.some((fr: string) => normalizeRaidName(fr) === raid)
        );
    }


    function autoBuildRecommendedPairs(): ManualKkanbuPair[] {
      const myPool: MyCandidate[] = myCandidates.map((x) => ({
        ...x,
        remainingRaids: [...x.activeRaids],
      }));

      const friendPool: FriendCandidate[] = friendCandidates.map((x) => ({
        ...x,
        remainingRaids: [...x.activeRaids],
      }));

      const result: ManualKkanbuPair[] = [];

      while (true) {
        let best:
          | {
            myIndex: number;
            friendIndex: number;
            commonRaids: string[];
            avgPower: number;
            diffFromTarget: number;
            score: number;
          }
          | null = null;

        for (let mi = 0; mi < myPool.length; mi++) {
          const my = myPool[mi];
          if (!my.remainingRaids.length) continue;

          for (let fi = 0; fi < friendPool.length; fi++) {
            const friend = friendPool[fi];
            if (!friend.remainingRaids.length) continue;

            const commonRaids = getCommonRaidsBetween(my, friend);
            if (!commonRaids.length) continue;

            const avgPower =
              my.power > 0 && friend.power > 0
                ? Math.round((my.power + friend.power) / 2)
                : 0;

            const diffFromTarget =
              avgTarget > 0 ? Math.abs(avgPower - avgTarget) : 0;

            // 점수 높을수록 우선
            // 공통 레이드 수 우선 + 목표 깐평 차이 적을수록 우선
            const score = commonRaids.length * 100000 - diffFromTarget;

            if (!best || score > best.score) {
              best = {
                myIndex: mi,
                friendIndex: fi,
                commonRaids,
                avgPower,
                diffFromTarget,
                score,
              };
            }
          }
        }

        if (!best) break;

        const my = myPool[best.myIndex];
        const friend = friendPool[best.friendIndex];

        result.push({
          myKey: my.key,
          friendKey: friend.key,
          selectedRaids: best.commonRaids,
        });

        const usedSet = new Set(best.commonRaids.map((r) => normalizeRaidName(r)));

        myPool[best.myIndex] = {
          ...my,
          remainingRaids: my.remainingRaids.filter(
            (raid: string) => !usedSet.has(normalizeRaidName(raid))
          ),
        };

        friendPool[best.friendIndex] = {
          ...friend,
          remainingRaids: friend.remainingRaids.filter(
            (raid: string) => !usedSet.has(normalizeRaidName(raid))
          ),
        };
      }

      return result.length
        ? result
        : [{ myKey: "", friendKey: "", selectedRaids: null }];
    }

    const usedRaidsByMyKey = new Map<string, Set<string>>();
    const usedRaidsByFriendKey = new Map<string, Set<string>>();

    for (const result of pairResults) {
      if (!result.my || !result.friend) continue;

      if (!usedRaidsByMyKey.has(result.my.key)) {
        usedRaidsByMyKey.set(result.my.key, new Set<string>());
      }
      if (!usedRaidsByFriendKey.has(result.friend.key)) {
        usedRaidsByFriendKey.set(result.friend.key, new Set<string>());
      }

      for (const raid of result.activeSelectedRaids) {
        usedRaidsByMyKey.get(result.my.key)!.add(normalizeRaidName(raid));
        usedRaidsByFriendKey.get(result.friend.key)!.add(normalizeRaidName(raid));
      }
    }

    // 4/23 현재 주 기준에서도 아래 목록은 전체 후보를 보여주고,
    // 일정표에 이미 전부 들어간 캐릭터는 흐리게만 표시되도록 분리
    const displayMyCandidates = myCandidates.map((me) => {
      const used = usedRaidsByMyKey.get(me.key) ?? new Set<string>();

      const unscheduledRaids = me.activeRaids.filter(
        (raid: string) => !used.has(normalizeRaidName(raid))
      );

      return {
        ...me,
        unscheduledRaids,
      };
    });

    const displayFriendCandidates = friendCandidates.map((fr) => {
      const used = usedRaidsByFriendKey.get(fr.key) ?? new Set<string>();

      const unscheduledRaids = fr.activeRaids.filter(
        (raid: string) => !used.has(normalizeRaidName(raid))
      );

      return {
        ...fr,
        unscheduledRaids,
      };
    });

    // 4/23 조합 추가 버튼 / 새 매칭 생성에는 "진짜 아직 일정표에 안 들어간 캐릭터"만 사용
    const remainingMyCandidates = displayMyCandidates.filter(
      (me) => me.unscheduledRaids.length > 0
    );

    const remainingFriendCandidates = displayFriendCandidates.filter(
      (fr) => fr.unscheduledRaids.length > 0
    );

    const updateManualPair = (
      index: number,
      field: "myKey" | "friendKey",
      value: string
    ) => {
      setManualKkanbuPairs((prev) =>
        prev.map((p, i) =>
          i === index
            ? {
              ...p,
              [field]: value,
              selectedRaids: null, // 캐릭 바꾸면 기본 전체선택 상태로 초기화
            }
            : p
        )
      );
    };

    const toggleManualPairRaid = (index: number, raid: string) => {
      const normalizedRaid = normalizeRaidName(raid);

      setManualKkanbuPairs((prev) =>
        prev.map((p, i) => {
          if (i !== index) return p;

          const my = myCandidates.find((x) => x.key === p.myKey) ?? null;
          const friend = friendCandidates.find((x) => x.key === p.friendKey) ?? null;

          const commonRaids: string[] =
            my && friend
              ? my.activeRaids
                .map((r: string) => normalizeRaidName(r))
                .filter((r: string, idx: number, arr: string[]) => arr.indexOf(r) === idx)
                .filter((r: string) =>
                  friend.activeRaids.some((fr: string) => normalizeRaidName(fr) === r)
                )
              : [];

          const currentBase: string[] =
            p.selectedRaids === null ? commonRaids : p.selectedRaids;

          const hasRaid = currentBase.some(
            (r) => normalizeRaidName(r) === normalizedRaid
          );

          return {
            ...p,
            selectedRaids: hasRaid
              ? currentBase.filter((r) => normalizeRaidName(r) !== normalizedRaid)
              : [...currentBase, normalizedRaid],
          };
        })
      );
    };

    const addManualPair = () => {
      setManualKkanbuPairs((prev) => [
        ...prev,
        { myKey: "", friendKey: "", selectedRaids: null },
      ]);
    };

    const removeManualPair = (index: number) => {
      setManualKkanbuPairs((prev) => {
        const next = prev.filter((_, i) => i !== index);
        return next.length
          ? next
          : [{ myKey: "", friendKey: "", selectedRaids: null }];
      });
    };

    async function createEmptyWeeklySchedule() {
      if (!SERVER_MODE) {
        alert("서버 모드에서만 일정표 공유가 가능해.");
        return;
      }

      if (!selectedFriendCode) {
        alert("먼저 친구를 선택해줘.");
        return;
      }

      const payload = {
        title:
          schedulePlanningMode === "NEXT_RESET"
            ? `${(newScheduleTitle.trim() || "일정표")} (다음 주)`
            : (newScheduleTitle.trim() || "일정표"),
        weekStartDate: getScheduleWeekStartDate(schedulePlanningMode),
        items: [],
      };

      const created = await apiFetch2("/api/weekly-schedules", {
        method: "POST",
        body: JSON.stringify({
          targetFriendCode: selectedFriendCode,
          title: payload.title,
          weekStartDate: payload.weekStartDate,
          scheduleJson: JSON.stringify(payload),
        }),
      });

      await refreshWeeklySchedules();
      if (created?.id) setSelectedScheduleId(String(created.id));
      alert("빈 일정표 생성 완료!");
    }

    return (
      <div className="raidLeftColsWrap">
        <div className="weeklyScheduleSection">
          <div className="weeklyScheduleHeader">
            <div className="weeklyScheduleHeaderLeft">
              {nextResetPlanMissing ? (
                <div className="todo-hint" style={{ marginBottom: 12 }}>
                  친구 레이드 계획 정보가 없어. 새로고침하거나 친구가 서버 업로드했는지 확인해줘.
                </div>
              ) : null}

              {nextResetPlanPrivate ? (
                <div className="todo-hint" style={{ marginBottom: 12 }}>
                  친구가 비공개야.
                </div>
              ) : null}
              <div className="weeklyScheduleTitle">공유 일정표</div>

              <select
                className="friendSelect weeklySchedulePicker"
                value={selectedScheduleId}
                onChange={(e) => setSelectedScheduleId(e.target.value)}
              >
                <option value="">일정표 선택</option>
                {weeklySchedules
                  .filter(
                    (s) =>
                      (s.targetFriendCode === selectedFriendCode ||
                        s.ownerFriendCode === selectedFriendCode) &&
                      matchesSchedulePlanningMode(s, schedulePlanningMode)
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {getDisplayWeeklyScheduleTitle(s)}
                    </option>
                  ))}
              </select>
              {selectedScheduleId && (
                <div className="weeklyScheduleHeaderRight">
                  <button
                    type="button"
                    className="mini"
                    onClick={() => {
                      const schedule = weeklySchedules.find((s) => s.id === selectedScheduleId);
                      if (!schedule) return;

                      const nextTitle = prompt(
                        "일정표 이름 변경",
                        getDisplayWeeklyScheduleTitle(schedule)
                      )?.trim();
                      if (!nextTitle) return;

                      renameWeeklySchedule(schedule.id, nextTitle).catch((e) => {
                        alert(`이름 변경 실패: ${String(e)}`);
                      });
                    }}
                  >
                    이름 변경
                  </button>

                  <button
                    type="button"
                    className="mini"
                    onClick={() => {
                      deleteWeeklySchedule(selectedScheduleId).catch((e) => {
                        alert(`일정표 삭제 실패: ${String(e)}`);
                      });
                    }}
                  >
                    일정표 삭제
                  </button>

                  {SERVER_MODE && (
                    <button
                      type="button"
                      className="mini"
                      onClick={() => refreshWeeklySchedules().catch((e) => alert(String(e)))}
                    >
                      {scheduleLoading ? "불러오는 중..." : "새로고침"}
                    </button>
                  )}
                </div>
              )}

            </div>
          </div>
          {selectedScheduleId && (
            <div className="weeklyScheduleAddRow">
              {selectedMyScheduleCharKey ? (() => {
                const selectedMe = selectableMyScheduleCandidates.find(
                  (x) => x.key === selectedMyScheduleCharKey
                );

                if (!selectedMe || !schedule) return null;

                const availableRaids = getAvailableRaidsForMyScheduleCandidate(schedule, selectedMe);

                if (!availableRaids.length) return null;

                return (
                  <div className="weeklyScheduleRaidPicker">
                    <div className="weeklyScheduleRaidPickerLabel">추가할 레이드</div>

                    <div className="weeklyScheduleRaidPickerList">
                      {availableRaids.map((raid) => {
                        const active = selectedMyScheduleRaidNames.some(
                          (x) => normalizeRaidName(x) === normalizeRaidName(raid)
                        );

                        return (
                          <button
                            key={raid}
                            type="button"
                            className={`manualRaidChipBtn ${active ? "active" : ""}`}
                            onClick={() => toggleSelectedScheduleRaid(raid)}
                          >
                            {raid}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })() : null}
              <div className="weeklyScheduleAddLabel">캐릭 추가</div>

              <select
                className="friendSelect manualKkanbuDaySelect"
                value={selectedMyScheduleCharKey}
                onChange={(e) => {
                  const nextKey = e.target.value;
                  setSelectedMyScheduleCharKey(nextKey);

                  const me = selectableMyScheduleCandidates.find((x) => x.key === nextKey);

                  if (!me || !schedule) {
                    setSelectedMyScheduleRaidNames([]);
                    return;
                  }

                  const availableRaids = getAvailableRaidsForMyScheduleCandidate(schedule, me);

                  setSelectedMyScheduleRaidNames(availableRaids);
                }}
              >
                <option value="">선택</option>
                {selectableMyScheduleCandidates.map((me) => (
                  <option key={me.key} value={me.key}>
                    {me.name} / Lv {me.ilvl} / 전투력 {me.power}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="mini"
                disabled={
                  !schedule ||
                  !selectedMyScheduleCharKey ||
                  selectedMyScheduleRaidNames.length === 0
                }
                onClick={() => {
                  const me = selectableMyScheduleCandidates.find(
                    (x) => x.key === selectedMyScheduleCharKey
                  );
                  if (!me) return;

                  addMyCharSlotToSchedule(
                    selectedScheduleId,
                    me,
                    scheduleTargetDay,
                    selectedMyScheduleRaidNames
                  );

                  setSelectedMyScheduleCharKey("");
                  setSelectedMyScheduleRaidNames([]);
                }}
              >
                추가
              </button>


              <button
                className="btn"
                onClick={() => {
                  const schedule = weeklySchedules.find((s) => s.id === selectedScheduleId);
                  if (!schedule) return;
                  saveWeeklySchedule(schedule).catch((e) => {
                    alert(`일정표 저장 실패: ${String(e)}`);
                  });
                }}
              >
                {scheduleSaving ? "저장 중..." : "일정표 저장"}
              </button>
            </div>
          )}

          {selectedScheduleId ? (() => {
            const schedule = weeklySchedules.find((s) => s.id === selectedScheduleId);
            if (!schedule) return <div className="manualKkanbuEmpty">선택한 일정표가 없어.</div>;

            return (
              <div className="weeklyScheduleGrid">
                {WEEK_DAYS.map((day) => {
                  const dayItems = schedule.items
                    .filter((item) => item.day === day)
                    .sort((a, b) => a.order - b.order);

                  return (
                    <div
                      key={day}
                      className={`weeklyDayCard ${dragScheduleItem ? "drop-active" : ""
                        }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                      }}
                      onDrop={() => {
                        if (!dragScheduleItem) return;
                        if (dragScheduleItem.scheduleId !== schedule.id) return;

                        moveScheduleItem(
                          dragScheduleItem.scheduleId,
                          dragScheduleItem.itemId,
                          day
                        );
                        setDragScheduleItem(null);
                      }}
                    >
                      <div className="weeklyDayTitle">{day}</div>

                      {dayItems.length ? (
                        <div
                          className="weeklyDayList"
                          onDragOver={(e) => {
                            e.preventDefault();
                          }}
                          onDrop={() => {
                            if (!dragScheduleItem) return;
                            if (dragScheduleItem.scheduleId !== schedule.id) return;

                            moveScheduleItem(
                              dragScheduleItem.scheduleId,
                              dragScheduleItem.itemId,
                              day,
                              dayItems.length
                            );
                            setDragScheduleItem(null);
                          }}
                        >
                          {dayItems.map((item, index) => {
                            const completion = getScheduleRaidCompletion(schedule, item);
                            const displayedPowers = getDisplayedSchedulePowers(schedule, item);
                            const liveMyPower = displayedPowers.myPower;
                            const liveFriendPower = displayedPowers.friendPower;
                            const liveAvgPower = displayedPowers.avgPower;

                            return (
                              <div
                                key={item.id}
                                className={`weeklyScheduleItem ${dragScheduleItem?.itemId === item.id ? "dragging" : ""} ${completion.isPast ? "is-past" : ""} ${completion.isFuture ? "is-future" : ""}`}
                                draggable
                                onDragStart={() => {
                                  setDragScheduleItem({
                                    scheduleId: schedule.id,
                                    itemId: item.id,
                                    fromDay: day,
                                  });
                                }}
                                onDragEnd={() => {
                                  setDragScheduleItem(null);
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();

                                  if (!dragScheduleItem) return;
                                  if (dragScheduleItem.scheduleId !== schedule.id) return;

                                  moveScheduleItem(
                                    dragScheduleItem.scheduleId,
                                    dragScheduleItem.itemId,
                                    day,
                                    index
                                  );
                                  setDragScheduleItem(null);
                                }}
                                title="드래그해서 요일 이동 또는 위아래 순서 변경"
                              >
                                <div className="weeklyScheduleItemTop">
                                  <div className="weeklySchedulePairBlock">
                                    <div className="weeklyScheduleMyCharRow">
                                      <div
                                        className={`weeklyScheduleMyChar ${completion.allCleared ? "is-cleared" : ""} ${completion.isPast ? "is-past" : ""}`}
                                      >
                                        {getScheduleFriendDisplayName(item)
                                          ? `${getScheduleMyDisplayName(item)} - ${getScheduleFriendDisplayName(item)}`
                                          : getScheduleMyDisplayName(item)}
                                      </div>

                                      {!getScheduleFriendDisplayName(item) && (
                                        <div className="weeklyScheduleOpenBadge">
                                          선택 대기중
                                        </div>
                                      )}
                                    </div>

                                    <div
                                      className={`weeklySchedulePower ${completion.allCleared ? "is-cleared" : ""} ${completion.isPast ? "is-past" : ""}`}
                                    >
                                      전투력{" "}
                                      {liveFriendPower != null
                                        ? `${liveMyPower ?? "-"} - ${liveFriendPower}`
                                        : `${liveMyPower ?? "-"}`}
                                    </div>

                                    <select
                                      className="friendSelect weeklyScheduleFriendSelect"
                                      value={getScheduleFriendSelectValue(schedule, item)}
                                      onChange={(e) =>
                                        assignFriendToScheduleItem(schedule.id, item.id, e.target.value)
                                      }
                                    >
                                      <option value="">
                                        {schedule.targetFriendCode === myFriendCode
                                          ? "내 캐릭"
                                          : "친구 캐릭"}
                                      </option>
                                      {getSelectableFriendOptionsForScheduleItem(schedule, item).map((fr) => (
                                        <option key={fr.key} value={fr.key}>
                                          {fr.name} / Lv {fr.ilvl} / 전투력 {fr.power > 0 ? fr.power : "-"}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <button
                                    type="button"
                                    className="mini"
                                    onClick={() => removeScheduleItem(schedule.id, item.id)}
                                    title="이 매칭 삭제"
                                  >
                                    삭제
                                  </button>
                                </div>

                                <div className="weeklyScheduleAvgPower">
                                  깐평: {liveAvgPower && liveAvgPower > 0 ? liveAvgPower : "-"}
                                </div>

                                <div className="weeklyScheduleRaids">
                                  {(completion.clearedMap ?? []).length ? (
                                    completion.clearedMap.map((raidItem, raidIndex) => (
                                      <React.Fragment key={`${item.id}_${raidItem.raid}`}>
                                        <span
                                          className={`weeklyScheduleRaidText ${raidItem.cleared ? "is-cleared" : ""} ${completion.isPast ? "is-past" : ""}`}
                                        >
                                          {formatScheduleRaidNameWithDifficulty(item, raidItem.raid)}
                                        </span>
                                        {raidIndex < completion.clearedMap.length - 1 ? ", " : ""}
                                      </React.Fragment>
                                    ))
                                  ) : (
                                    "공통 레이드 없음"
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="manualKkanbuEmpty">배정 없음</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })() : (
            <div className="manualKkanbuEmpty">일정표를 선택하거나 새로 만들어줘.</div>
          )}
        </div>
        <div className="raidLeftColsTitle">깐부 수동 조합 플래너</div>
        <div style={{ marginBottom: 12 }}>
          <div className="manualKkanbuLabel" style={{ marginBottom: 6 }}>내 표 제외</div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {state.tables.map((tbl) => (
              <label
                key={tbl.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--card)",
                  color: "var(--text)",
                }}
              >
                <input
                  type="checkbox"
                  checked={isKkanbuExcludedTable(tbl.id)}
                  onChange={() => toggleKkanbuExcludedTable(tbl.id)}
                />
                <span>{tbl.name}</span>
              </label>
            ))}
          </div>

          <div className="manualKkanbuLabel" style={{ marginBottom: 6 }}>친구 표 제외</div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {friendTableNames.map((tableName: string) => (
              <label
                key={tableName}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "var(--card)",
                  color: "var(--text)",
                }}
              >
                <input
                  type="checkbox"
                  checked={isKkanbuExcludedFriendTable(tableName)}
                  onChange={() => toggleKkanbuExcludedFriendTable(tableName)}
                />
                <span>{tableName}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="manualKkanbuTopBar">
          <div className="manualKkanbuTopField">
            <div className="manualKkanbuLabel">레벨대</div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                className="friendInput manualKkanbuInput"
                type="text"
                inputMode="numeric"
                value={kkanbuLevelMin}
                onChange={(e) => setKkanbuLevelMin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="1700"
              />

              <span style={{ color: "var(--muted)", fontWeight: 700 }}>~</span>

              <input
                className="friendInput manualKkanbuInput"
                type="text"
                inputMode="numeric"
                value={kkanbuLevelMax}
                onChange={(e) => setKkanbuLevelMax(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="1720"
              />
            </div>
          </div>

          <div className="manualKkanbuTopField">
            <div className="manualKkanbuLabel">목표 깐평</div>
            <input
              className="friendInput manualKkanbuInput"
              type="text"
              inputMode="numeric"
              value={kkanbuAvgPowerTarget}
              onChange={(e) => setKkanbuAvgPowerTarget(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="예: 3000"
            />
          </div>

          <div className="manualKkanbuTopSummary">
            <div>내 캐릭 {myCandidates.length}명</div>
            <div>친구 캐릭 {friendCandidates.length}명</div>

            <button
              type="button"
              className="btn"
              disabled={hasNoMyCandidates || hasNoFriendCandidates}
              onClick={() => {
                const recommended = autoBuildRecommendedPairs();
                setManualKkanbuPairs(recommended);
              }}
            >
              추천 매칭
            </button>
            <select
              className="friendSelect manualKkanbuDaySelect"
              value={schedulePlanningMode}
              onChange={(e) =>
                setSchedulePlanningMode(e.target.value as "CURRENT" | "NEXT_RESET")
              }
            >
              <option value="CURRENT">현재 주 기준</option>
              <option value="NEXT_RESET">다음 주 초기화 기준</option>
            </select>

            <select
              className="friendSelect manualKkanbuDaySelect"
              value={scheduleTargetDay}
              onChange={(e) => setScheduleTargetDay(e.target.value as WeeklyScheduleDay)}
              title="일정표 생성 시 배치할 요일"
            >
              {WEEK_DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}요일에 넣기
                </option>
              ))}
            </select>

            <select
              className="friendSelect manualKkanbuDaySelect"
              value={scheduleCreateMode}
              onChange={(e) => setScheduleCreateMode(e.target.value as "NEW" | "EXISTING")}
            >
              <option value="NEW">새 일정표 만들기</option>
              <option value="EXISTING">기존 일정표에 추가</option>
            </select>

            {scheduleCreateMode === "NEW" ? (
              <input
                className="friendInput manualKkanbuScheduleInput"
                value={newScheduleTitle}
                onChange={(e) => setNewScheduleTitle(e.target.value)}
                placeholder="새 일정표 이름"
              />
            ) : (
              <select
                className="friendSelect manualKkanbuDaySelect"
                value={selectedScheduleId}
                onChange={(e) => setSelectedScheduleId(e.target.value)}
              >
                <option value="">추가할 일정표 선택</option>
                {weeklySchedules
                  .filter(
                    (s) =>
                      (s.targetFriendCode === selectedFriendCode ||
                        s.ownerFriendCode === selectedFriendCode) &&
                      matchesSchedulePlanningMode(s, schedulePlanningMode)
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {getDisplayWeeklyScheduleTitle(s)}
                    </option>
                  ))}
              </select>
            )}

            <button
              type="button"
              className="btn"
              disabled={!selectedFriendCode}
              onClick={() => {
                createEmptyWeeklySchedule().catch((e) => {
                  alert(`일정표 생성 실패: ${String(e)}`);
                });
              }}
            >
              빈 일정표 만들기
            </button>

            <button
              type="button"
              className="btn"
              disabled={
                !selectedFriendCode ||
                shareablePairResults.length === 0 ||
                (scheduleCreateMode === "EXISTING" && !selectedScheduleId)
              }
              onClick={() => {
                const action =
                  scheduleCreateMode === "NEW"
                    ? createWeeklyScheduleFromRecommendation(
                      shareablePairResults,
                      scheduleTargetDay
                    )
                    : appendToExistingWeeklySchedule(
                      selectedScheduleId,
                      shareablePairResults,
                      scheduleTargetDay
                    );

                action.catch((e) => {
                  alert(`일정표 반영 실패: ${String(e)}`);
                });
              }}
            >
              일정표에 넣기
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => setShareKkanbuOpen(true)}
            >
              공유하기
            </button>
          </div>
        </div>

        <div className="manualKkanbuPlanner">
          {hasNoFriendCandidates || hasNoMyCandidates ? (
            <div className="manualKkanbuEmpty" style={{ marginBottom: 12 }}>
              {hasNoMyCandidates && hasNoFriendCandidates
                ? "해당 레벨대에 내 캐릭터와 친구 캐릭터가 없어."
                : hasNoMyCandidates
                  ? "해당 레벨대에 내 캐릭터가 없어."
                  : "해당 레벨대에 친구 캐릭터가 없어."}
            </div>
          ) : null}

          {manualKkanbuPairs.map((pair, index) => {
            const result = pairResults[index];

            const buildRemainingCandidatesUntil = (pairIndex: number) => {
              const usedMy = new Map<string, Set<string>>();
              const usedFriend = new Map<string, Set<string>>();

              for (let i = 0; i < pairIndex; i++) {
                const result = pairResults[i];
                if (!result?.my || !result?.friend) continue;

                if (!usedMy.has(result.my.key)) usedMy.set(result.my.key, new Set<string>());
                if (!usedFriend.has(result.friend.key)) usedFriend.set(result.friend.key, new Set<string>());

                for (const raid of result.activeSelectedRaids) {
                  usedMy.get(result.my.key)!.add(normalizeRaidName(raid));
                  usedFriend.get(result.friend.key)!.add(normalizeRaidName(raid));
                }
              }

              const selectableMy = myCandidates
                .map((me: MyCandidate) => {
                  const used = usedMy.get(me.key) ?? new Set<string>();
                  return {
                    ...me,
                    remainingRaids: me.activeRaids.filter(
                      (raid: string) => !used.has(normalizeRaidName(raid))
                    ),
                  };
                })
                .filter((me: MyCandidate & { remainingRaids: string[] }) => me.remainingRaids.length > 0);

              const selectableFriend = friendCandidates
                .map((fr: FriendCandidate) => {
                  const used = usedFriend.get(fr.key) ?? new Set<string>();
                  return {
                    ...fr,
                    remainingRaids: fr.activeRaids.filter(
                      (raid: string) => !used.has(normalizeRaidName(raid))
                    ),
                  };
                })
                .filter((fr: FriendCandidate & { remainingRaids: string[] }) => fr.remainingRaids.length > 0);

              return { selectableMy, selectableFriend };
            };

            const { selectableMy, selectableFriend } = buildRemainingCandidatesUntil(index);

            return (
              <div key={index} className="manualKkanbuPairCard">
                <div className="manualKkanbuPairHeader">
                  <div className="manualKkanbuPairTitle">조합 {index + 1}</div>
                  <button className="mini" onClick={() => removeManualPair(index)}>
                    삭제
                  </button>
                </div>

                <div className="manualKkanbuPairGrid">
                  <div className="manualKkanbuField">
                    <div className="manualKkanbuLabel">내 캐릭터</div>
                    <select
                      className="friendSelect manualKkanbuSelect"
                      value={pair.myKey}
                      onChange={(e) => updateManualPair(index, "myKey", e.target.value)}
                    >
                      <option value="">내 캐릭 선택</option>
                      {selectableMy.map((me) => (
                        <option key={me.key} value={me.key}>
                          {me.name} / Lv {me.ilvl} / 전투력 {me.power}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="manualKkanbuField">
                    <div className="manualKkanbuLabel">친구 캐릭터</div>
                    <select
                      className="friendSelect manualKkanbuSelect"
                      value={pair.friendKey}
                      onChange={(e) => updateManualPair(index, "friendKey", e.target.value)}
                    >
                      <option value="">친구 캐릭 선택</option>
                      {selectableFriend.map((fr) => (
                        <option key={fr.key} value={fr.key}>
                          {fr.name} / Lv {fr.ilvl} / 전투력 {fr.power > 0 ? fr.power : "-"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {result.my && result.friend ? (
                  <div className="manualKkanbuPairResult">
                    <div className="manualKkanbuResultMain">
                      <b>{result.my.name}</b> ↔ <b>{result.friend.name}</b>
                    </div>

                    <div className="manualKkanbuBadges">
                      <span className="raidBadge ilvl">내 Lv {result.my.ilvl}</span>
                      <span className="raidBadge power">내 전투력 {result.my.power}</span>
                      <span className="raidBadge ilvl">친구 Lv {result.friend.ilvl}</span>
                      <span className="raidBadge power">친구 전투력 {result.friend.power}</span>
                    </div>

                    <div className="manualKkanbuAvgLine">
                      깐평: <b>{result.avgPower ?? "-"}</b>
                      {result.diffFromTarget != null ? (
                        <>
                          {" "} / 목표 차이: <b>{result.diffFromTarget}</b>
                        </>
                      ) : null}
                    </div>

                    <div className="manualKkanbuAvgLine">
                      같이 가는 레이드:{" "}
                      <b>
                        {result.activeSelectedRaids.length
                          ? result.activeSelectedRaids.join(", ")
                          : "선택 안 됨"}
                      </b>
                    </div>

                    <div className="manualKkanbuRaidBox">
                      <div className="manualKkanbuRaidTitle">공통 레이드</div>
                      {result.commonRaids.length ? (
                        <div className="manualKkanbuRaidList">
                          {result.commonRaids.map((raid) => {
                            const isActive = result.activeSelectedRaids.some(
                              (x) => normalizeRaidName(x) === normalizeRaidName(raid)
                            );

                            return (
                              <button
                                key={raid}
                                type="button"
                                className={`manualRaidChipBtn ${isActive ? "active" : ""}`}
                                onClick={() => toggleManualPairRaid(index, raid)}
                              >
                                {raid}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="manualKkanbuEmpty">공통 레이드 없음</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="manualKkanbuEmpty">
                    내 캐릭터와 친구 캐릭터를 선택하면 깐평과 공통 레이드가 보여.
                  </div>
                )}
              </div>
            );
          })}

          <div className="manualKkanbuActions">
            <button
              className="btn"
              onClick={addManualPair}
              disabled={
                hasNoMyCandidates ||
                hasNoFriendCandidates ||
                !remainingMyCandidates.length ||
                !remainingFriendCandidates.length
              }
            >
              조합 추가
            </button>
          </div>
        </div>

        <>
          <div className="manualKkanbuRemainWrap manualKkanbuRemainTop">
            <div className="manualRemainCard">
              <div className="manualRemainTitle">남은 내 캐릭터</div>
              {displayMyCandidates.length ? (
                <div className="manualRemainList">
                  {displayMyCandidates.map((me) => {
                    // 4/26 다음 주 초기화 기준도 새 일정표에 넣은 레이드는 흑백 처리되도록 수정
                    const scheduleState = getRemainScheduleState(
                      me.key,
                      me.allRaids,
                      scheduledMyRaidSetByChar,
                      [me.name, getScheduleSnapshotCandidateKey(me.tableName, me.name)]
                    );
                    // 4/26 다음 주 초기화 기준은 레이드는 초기화값으로 보되, 일정표에 넣은 레이드는 흑백 처리
                    const allVisibleRaidsMuted =
                      me.allRaids.length > 0 &&
                      me.allRaids.every((raid) => {
                        const normalized = normalizeRaidName(raid);
                        const isScheduled = scheduleState.scheduledSet.has(normalized);
                        // 4/26 다음 주 초기화 기준일 때는 모든 표시 레이드를 남은 레이드로 처리
                        const isRemaining =
                          schedulePlanningMode === "NEXT_RESET" ||
                          me.remainingRaids.some((x) => normalizeRaidName(x) === normalized);

                        return !isRemaining || isScheduled;
                      });

                    return (
                      <div
                        key={me.key}
                        className={`manualRemainItem ${allVisibleRaidsMuted ? "is-schedule-full" : ""}`}
                      >
                        <div
                          className={`manualRemainName ${allVisibleRaidsMuted ? "is-schedule-full" : ""}`}
                        >
                          {me.name}{" "}
                          <span className="manualRemainMeta">
                            Lv {me.ilvl} / 전투력 {me.power}
                          </span>
                        </div>

                        <div className="manualRemainRaids">
                          {me.allRaids.map((raid) => {
                            const normalized = normalizeRaidName(raid);
                            const isScheduled = scheduleState.scheduledSet.has(normalized);

                            // 4/26 다음 주 초기화 기준일 때는 기존 클리어 체크를 무시하고 전부 남은 레이드로 처리
                            const isRemaining =
                              schedulePlanningMode === "NEXT_RESET" ||
                              me.remainingRaids.some((x) => normalizeRaidName(x) === normalized);

                            return (
                              <span
                                key={raid}
                                className={`manualRaidChip ${!isRemaining || isScheduled ? "is-scheduled" : ""
                                  } ${allVisibleRaidsMuted ? "is-schedule-full" : ""}`}
                              >
                                {raid}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="manualKkanbuEmpty">남은 내 캐릭터 없음</div>
              )}
            </div>

            <div className="manualRemainCard">
              <div className="manualRemainTitle">남은 친구 캐릭터</div>
              {displayFriendCandidates.length ? (
                <div className="manualRemainList">
                  {displayFriendCandidates.map((fr: FriendCandidate) => {
                    const visibleFriendRaids =
                      fr.allRaids.length > 0
                        ? fr.allRaids
                        : fr.activeRaids.length > 0
                          ? fr.activeRaids
                          : fr.remainingRaids;

                    // 4/26 다음 주 초기화 기준은 친구 클리어 기록은 무시하고, 새 일정표에 넣은 레이드만 흑백 처리
                    const clearedRaidSet = new Set(
                      schedulePlanningMode === "NEXT_RESET"
                        ? []
                        : (fr.clearedRaids ?? []).map((raid: string) => normalizeRaidName(raid))
                    );

                    const scheduleState = getRemainScheduleState(
                      fr.key,
                      visibleFriendRaids,
                      scheduledFriendRaidSetByChar,
                      [fr.name, getScheduleSnapshotCandidateKey(fr.tableName, fr.name)]
                    );

                    // 4/23 현재 화면에 보이는 레이드칩이 전부 회색 조건이면 이름도 같이 회색
                    const allVisibleRaidsMuted =
                      visibleFriendRaids.length > 0 &&
                      visibleFriendRaids.every((raid: string) => {
                        const normalized = normalizeRaidName(raid);
                        const isScheduled = scheduleState.scheduledSet.has(normalized);
                        const isCleared = clearedRaidSet.has(normalized);

                        return isScheduled || isCleared;
                      });

                    return (
                      <div
                        key={fr.key}
                        className={`manualRemainItem ${allVisibleRaidsMuted ? "is-schedule-full" : ""}`}
                      >
                        <div
                          className={`manualRemainName ${allVisibleRaidsMuted ? "is-schedule-full" : ""}`}
                        >
                          {fr.name}{" "}
                          <span className="manualRemainMeta">
                            Lv {fr.ilvl} / 전투력 {fr.power}
                          </span>
                        </div>

                        <div className="manualRemainRaids">
                          {visibleFriendRaids.map((raid: string) => {
                            const normalized = normalizeRaidName(raid);
                            const isScheduled = scheduleState.scheduledSet.has(normalized);
                            const isCleared = clearedRaidSet.has(normalized);

                            return (
                              <span
                                key={raid}
                                className={`manualRaidChip ${isScheduled || isCleared ? "is-scheduled" : ""
                                  } ${allVisibleRaidsMuted ? "is-schedule-full" : ""}`}
                              >
                                {raid}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="manualKkanbuEmpty">남은 친구 캐릭터 없음</div>
              )}
            </div>
          </div>
        </>
        {shareKkanbuOpen ? (
          <div className="kkanbuShareOverlay" onClick={() => setShareKkanbuOpen(false)}>
            <div
              className="kkanbuShareModal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="kkanbuShareHead">
                <div className="kkanbuShareTitle">매칭 결과 공유</div>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setShareKkanbuOpen(false)}
                >
                  닫기
                </button>
              </div>

              <div className="kkanbuSharePreview">
                <pre className="kkanbuSharePre">{buildKkanbuShareText()}</pre>
              </div>

              <div className="kkanbuShareActions">
                <button
                  type="button"
                  className="btn"
                  onClick={handleCopyKkanbuShare}
                >
                  {shareKkanbuCopied ? "복사 완료!" : "텍스트 복사"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }


  async function refreshFriends(tokenOverride?: string) {
    if (!SERVER_MODE) return;
    setSyncingFriends(true);
    try {
      const headers = tokenOverride ? { Authorization: `Bearer ${tokenOverride}` } : undefined;
      const friendsRes = await apiFetch2("/api/friends", { headers });
      const incomingRes = await apiFetch2("/api/friend-requests?type=incoming", { headers });

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

      const nextFriends = friendsArr
        .map((f: any) => ({
          code: String(f.friendCode ?? f.code ?? "").trim(),
          nickname: String(f.nickname ?? f.alias ?? f.friendCode ?? f.code ?? "").trim(),
          addedAt: Date.now(),
        }))
        .filter((x: any) => x.code);

      setState((prev) => {
        const mergedFriends = [...prev.friends];
        const existingCodes = new Set(mergedFriends.map((f) => f.code));

        for (const friend of nextFriends) {
          const index = mergedFriends.findIndex((f) => f.code === friend.code);
          if (index >= 0) {
            mergedFriends[index] = { ...mergedFriends[index], ...friend };
          } else if (!existingCodes.has(friend.code)) {
            mergedFriends.push(friend);
            existingCodes.add(friend.code);
          }
        }

        return {
          ...prev,
          friends: mergedFriends,
        };
      });

      // ✅ 현재 친구 목록에 없는 snapshot 정리
      setFriendSnapshots((prev) => {
        const aliveCodes = new Set(nextFriends.map((f: any) => f.code));
        const next: Record<string, any> = {};

        for (const code of Object.keys(prev)) {
          if (aliveCodes.has(code)) {
            next[code] = prev[code];
          }
        }

        return next;
      });

      setIncomingReqs(incomingArr);
    } finally {
      setSyncingFriends(false);
    }
  }

  async function refreshFriendRaidPlan(friendCode: string) {
    if (!SERVER_MODE) return;

    const code = String(friendCode ?? "").trim();
    if (!code) return;

    const data = await apiFetch2(`/api/raid-plan?friendCode=${encodeURIComponent(code)}`);

    const parsed =
      typeof data?.plan_json === "string"
        ? importFriendRaidPlan(data.plan_json)
        : importFriendRaidPlan(data);

    setFriendRaidPlans((prev) => ({
      ...prev,
      [code]: parsed,
    }));
  }

  async function refreshFriendSnapshot(friendCode: string) {
    if (!SERVER_MODE) return;

    const code = String(friendCode ?? "").trim();
    if (!code) return;

    const data = await apiFetch2(
      `/api/raid-left-snapshot?friendCode=${encodeURIComponent(code)}`
    );

    const snapAny = (data as any).snapshotJson;
    const snapStr = typeof snapAny === "string" ? snapAny : JSON.stringify(snapAny);
    attachSnapshotToFriend(snapStr, code, { suppressAlerts: true });
  }

  useEffect(() => {
    if (!SERVER_MODE) return;
    if (!selectedFriendCode) return;
    if (schedulePlanningMode !== "NEXT_RESET") return;

    refreshFriendRaidPlan(selectedFriendCode).catch((e) => {
      console.error("친구 레이드 계획 불러오기 실패", e);
    });
  }, [SERVER_MODE, selectedFriendCode, schedulePlanningMode]);

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

  async function removeFriend(friendCode: string) {
    const code = String(friendCode ?? "").trim();
    if (!code) return;

    const ok = window.confirm(`친구(${code})를 삭제할까?`);
    if (!ok) return;

    // 1) 로컬 state에서 즉시 제거
    setState((prev) => ({ ...prev, friends: prev.friends.filter((f) => f.code !== code) }));

    // ✅ snapshot도 같이 제거
    setFriendSnapshots((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });

    // 선택 중이던 친구면 선택 해제
    setSelectedFriendCode((cur) => (cur === code ? "" : cur));

    // 2) 서버모드면 서버에서도 삭제 + 최종 재동기화
    if (SERVER_MODE) {
      try {
        await apiFetch2(`/api/friends?friendCode=${encodeURIComponent(code)}`, { method: "DELETE" });
      } catch {
        alert("서버에서 친구 삭제 실패(네트워크/권한 확인)");
      }

      try {
        await refreshFriends();
      } catch {
        // ignore
      }
    }
  }

  function attachSnapshotToFriend(
    snapshotRaw: string,
    targetFriendCode?: string,
    options?: { suppressAlerts?: boolean }
  ) {
    const suppressAlerts = options?.suppressAlerts === true;
    let snap;
    try {
      snap = importRaidLeftSnapshot(snapshotRaw);
    } catch {
      if (!suppressAlerts) {
        alert("스냅샷 JSON 형식이 올바르지 않아");
      }
      return;
    }

    if (snap.shareMode === "PRIVATE") {
      if (!suppressAlerts) {
        alert("친구가 비공개로 설정했어. 확인 불가!");
      }
      return;
    }

    const codeToAttach = (targetFriendCode || snap.friendCode || "").trim();

    if (!codeToAttach) {
      if (!suppressAlerts) {
        alert("친구 코드가 비어있어. 스냅샷을 연결할 수 없어");
      }
      return;
    }

    // 1) 친구 목록에는 메타데이터만 저장
    setState((prev) => {
      const exists = prev.friends.some((f) => f.code === codeToAttach);
      if (exists) return prev;

      return {
        ...prev,
        friends: [
          ...prev.friends,
          { code: codeToAttach, nickname: codeToAttach, addedAt: Date.now() },
        ],
      };
    });

    // 2) 무거운 스냅샷 데이터는 별도 state로 분리
    setFriendSnapshots((prev) => ({
      ...prev,
      [codeToAttach]: snap,
    }));
  }

  useEffect(() => {
    const t = setInterval(() => forceTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);


  const loaGameDate = useMemo(() => getLoaGameDate(resetHour), [resetHour]);
  const loaDateKey = useMemo(() => formatLocalDateKey(loaGameDate), [loaGameDate]);
  const loaWeekday = useMemo(() => loaGameDate.getDay(), [loaGameDate]);
  const todayAccountContents = useMemo(() => WEEKLY_ACCOUNT_CONTENT[loaWeekday] ?? [], [loaWeekday]);

  type TodayMustDoSettings = {
    coreDaily1730: boolean;
    guardian1730: boolean;
    accountContent: boolean;
    restFull: boolean;
    azenaDaily: boolean;
  };

  const DEFAULT_TODAY_MUST_DO_SETTINGS: TodayMustDoSettings = {
    coreDaily1730: true,
    guardian1730: true,
    accountContent: true,
    restFull: true,
    azenaDaily: true,
  };

  type WeeklyMustDoSettings = {
    sandglass: boolean;
    sky: boolean;
    bloodstone: boolean;
    clearMedal: boolean;
  };

  const DEFAULT_WEEKLY_MUST_DO_SETTINGS: WeeklyMustDoSettings = {
    sandglass: true,
    sky: true,
    bloodstone: true,
    clearMedal: true,
  };

  type TodayMustDoTaskEntry = {
    label: string;
    reasons: string[];
  };

  type TodayMustDoItem = {
    key: string;
    tableId: string;
    tableName: string;
    charId?: string;
    charName?: string;
    tasks: TodayMustDoTaskEntry[];
  };

  // ✅ 계정 콘텐츠 체크(카게/필보): tableId별로 저장/로드 (06:00 리셋 기준)
  const [accountChecksByTable, setAccountChecksByTable] = useState<Record<string, Record<string, boolean>>>({});
  const [todayMustDoOpen, setTodayMustDoOpen] = useState(false);
  const [weeklyMustDoOpen, setWeeklyMustDoOpen] = useState(false);


  const [todayMustDoSettings, setTodayMustDoSettings] = useState<TodayMustDoSettings>(() => {
    try {
      const raw = localStorage.getItem("loa-today-must-do-settings:v1");
      if (!raw) return DEFAULT_TODAY_MUST_DO_SETTINGS;
      return { ...DEFAULT_TODAY_MUST_DO_SETTINGS, ...(JSON.parse(raw) ?? {}) };
    } catch {
      return DEFAULT_TODAY_MUST_DO_SETTINGS;
    }
  });

  const [weeklyMustDoSettings, setWeeklyMustDoSettings] = useState<WeeklyMustDoSettings>(() => {
    try {
      const raw = localStorage.getItem("loa-weekly-must-do-settings:v1");
      if (!raw) return DEFAULT_WEEKLY_MUST_DO_SETTINGS;
      return { ...DEFAULT_WEEKLY_MUST_DO_SETTINGS, ...(JSON.parse(raw) ?? {}) };
    } catch {
      return DEFAULT_WEEKLY_MUST_DO_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("loa-today-must-do-settings:v1", JSON.stringify(todayMustDoSettings));
    } catch {
      // ignore
    }
  }, [todayMustDoSettings]);

  useEffect(() => {
    try {
      localStorage.setItem("loa-weekly-must-do-settings:v1", JSON.stringify(weeklyMustDoSettings));
    } catch {
      // ignore
    }
  }, [weeklyMustDoSettings]);

  type WeeklyMustDoTaskEntry = {
    label: string;
    reasons: string[];
  };

  type WeeklyMustDoItem = {
    key: string;
    tableId: string;
    tableName: string;
    charId: string;
    charName: string;
    tasks: WeeklyMustDoTaskEntry[];
  };

  const TASK_MIN_ILVL: Record<string, number> = {
    "할의 모래시계": 1730,
    "1막": 1660,
    "2막": 1670,
    "3막": 1680,
    "4막": 1700,
    "종막": 1710,
    "세르카": 1710,
    "지평의 성당": 1700,
    "1해금": 1640,
    "2해금": 1680,
    "3해금": 1700,
    "4해금": 1720,
  };

  function isCheckedCell(tableId: string, taskId: string, charId: string) {
    const cell = getCellByTableId(state, tableId, taskId, charId);
    if (!cell) return false;
    if (cell.type === "CHECK") return !!cell.checked;
    if (cell.type === "COUNTER") return Number(cell.count ?? 0) >= 1;
    return false;
  }

  function parseIlvl(raw?: string): number {
    if (!raw) return NaN;
    const n = Number(String(raw).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : NaN;
  }

  const getCharIlvl = (ch: any) => {
    const v =
      ch.itemLevel ??
      ch.item_level ??
      ch.ilvl ??
      ch.iLvl ??
      ch.level ??
      ch.levelLabel ??
      ch.nameLevel;

    try {
      const n = typeof v === "number" ? v : parseIlvl(String(v ?? ""));
      return Number.isFinite(n) ? n : 0;
    } catch {
      const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) ? n : 0;
    }
  };

  const weeklyMustDoItems = useMemo<WeeklyMustDoItem[]>(() => {
    const result: WeeklyMustDoItem[] = [];

    const weeklyTargets = [
      {
        enabled: weeklyMustDoSettings.sandglass,
        title: "할의 모래시계",
        reason: "주간 체크 안 됨",
      },
      {
        enabled: weeklyMustDoSettings.sky,
        title: "천상",
        reason: "주간 체크 안 됨",
      },
      {
        enabled: weeklyMustDoSettings.bloodstone,
        title: "혈석 교환",
        reason: "주간 체크 안 됨",
      },
      {
        enabled: weeklyMustDoSettings.clearMedal,
        title: "클리어메달 교환",
        reason: "주간 체크 안 됨",
      },
    ].filter((x) => x.enabled);

    for (const table of state.tables) {
      for (const ch of table.characters) {
        const tasks: WeeklyMustDoTaskEntry[] = [];
        const ilvl = getCharIlvl(ch as any);

        for (const target of weeklyTargets) {
          const minIlvl = TASK_MIN_ILVL[target.title] ?? 0;
          if (minIlvl > 0 && ilvl < minIlvl) continue;

          const task = state.tasks.find(
            (t) => t.period === "WEEKLY" && (t.title ?? "").trim() === target.title
          );
          if (!task) continue;

          const cell = getCellByTableId(state, table.id, task.id, ch.id);
          const checked = !!(cell && cell.type === "CHECK" && cell.checked);

          if (!checked) {
            tasks.push({
              label: target.title,
              reasons: [target.reason],
            });
          }
        }

        if (tasks.length > 0) {
          result.push({
            key: `${table.id}-${ch.id}`,
            tableId: table.id,
            tableName: table.name ?? "표",
            charId: ch.id,
            charName: ch.name,
            tasks,
          });
        }
      }
    }

    return result;
  }, [state, weeklyMustDoSettings]);


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

  // ✅ 전체 표의 계정 콘텐츠 체크를 로드
  useEffect(() => {
    const ids = state.tables.map((t) => t.id);
    setAccountChecksByTable(() => {
      const next: Record<string, Record<string, boolean>> = {};
      for (const id of ids) next[id] = readAccountChecks(id);
      return next;
    });
  }, [loaDateKey, state.tables]);

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

  // 레이드 이름 비교용 정규화
  function normalizeRaidName(name: string) {
    return name.replace(/\s+/g, "").toLowerCase();
  }

  const CORE_DAILY_TASK_ID = "MAIN_DAILY";

  function getCoreDailyLabel(ilvl: number) {
    return ilvl >= 1730 ? "혼돈의 균열" : "쿠르잔 전선";
  }

  const todayMustDoItems = useMemo<TodayMustDoItem[]>(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        tableId: string;
        tableName: string;
        charId?: string;
        charName?: string;
        taskMap: Map<string, Set<string>>;
      }
    >();

    const guardianTask = state.tasks.find(
      (t) =>
        t.period === "DAILY" &&
        (t.title ?? "").trim() === "가디언 토벌"
    );

    function ensureGroup(base: {
      key: string;
      tableId: string;
      tableName: string;
      charId?: string;
      charName?: string;
    }) {
      const found = grouped.get(base.key);
      if (found) return found;

      const created = {
        ...base,
        taskMap: new Map<string, Set<string>>(),
      };
      grouped.set(base.key, created);
      return created;
    }

    function addGroupedReason(
      base: {
        key: string;
        tableId: string;
        tableName: string;
        charId?: string;
        charName?: string;
      },
      label: string,
      reason: string
    ) {
      const group = ensureGroup(base);
      const reasonSet = group.taskMap.get(label) ?? new Set<string>();
      reasonSet.add(reason);
      group.taskMap.set(label, reasonSet);
    }

    for (const table of state.tables) {
      const tableName = table.name ?? "표";
      const accountChecks = accountChecksByTable[table.id] ?? readAccountChecks(table.id);

      // 1) 계정 콘텐츠 (카게/필보) - 표 단위 그룹
      if (todayMustDoSettings.accountContent) {
        for (const content of todayAccountContents) {
          const checked = !!accountChecks[content.id];
          if (!checked) {
            addGroupedReason(
              {
                key: `account:${table.id}`,
                tableId: table.id,
                tableName,
              },
              content.label,
              `${tableName}에서 아직 체크 안 됨`
            );
          }
        }
      }

      // 2) 캐릭터별 검사 - 캐릭 단위 그룹
      for (const ch of table.characters as any[]) {
        const ilvl = getCharIlvl(ch);
        const coreChecked = isCheckedCell(table.id, CORE_DAILY_TASK_ID, ch.id);
        const guardianChecked = guardianTask ? isCheckedCell(table.id, guardianTask.id, ch.id) : false;

        const rest = table.restGauges?.[ch.id] ?? { chaos: 0, guardian: 0 };
        const coreLabel = getCoreDailyLabel(ilvl);

        const groupBase = {
          key: `char:${table.id}:${ch.id}`,
          tableId: table.id,
          tableName,
          charId: ch.id,
          charName: ch.name,
        };

        if (todayMustDoSettings.coreDaily1730 && ilvl >= 1730 && !coreChecked) {
          addGroupedReason(groupBase, coreLabel, "1730+ 캐릭터인데 아직 체크 안 됨");
        }

        if (todayMustDoSettings.guardian1730 && ilvl >= 1730 && guardianTask && !guardianChecked) {
          addGroupedReason(groupBase, "가디언 토벌", "1730+ 캐릭터인데 아직 체크 안 됨");
        }

        if (todayMustDoSettings.restFull) {
          if (rest.chaos >= 200 && !coreChecked) {
            addGroupedReason(groupBase, coreLabel, "휴식게이지 풀(200)인데 아직 체크 안 됨");
          }

          if (rest.guardian >= 100 && guardianTask && !guardianChecked) {
            addGroupedReason(groupBase, "가디언 토벌", "휴식게이지 풀(100)인데 아직 체크 안 됨");
          }
        }

        if (todayMustDoSettings.azenaDaily && ch.azenaEnabled) {
          if (!coreChecked) {
            addGroupedReason(groupBase, coreLabel, "아제나 캐릭터인데 아직 안 함");
          }

          if (guardianTask && !guardianChecked) {
            addGroupedReason(groupBase, "가디언 토벌", "아제나 캐릭터인데 아직 안 함");
          }
        }
      }
    }

    return Array.from(grouped.values()).map((group) => ({
      key: group.key,
      tableId: group.tableId,
      tableName: group.tableName,
      charId: group.charId,
      charName: group.charName,
      tasks: Array.from(group.taskMap.entries()).map(([label, reasonSet]) => ({
        label,
        reasons: Array.from(reasonSet),
      })),
    }));
  }, [state, accountChecksByTable, todayAccountContents, todayMustDoSettings]);

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

        {/* 생명의 기운(항상 표시) */}
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
              </label>
            ))}
          </div>
        ) : (
          <div className="accountDailyEmpty">카게/필보 없음</div>
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

  //  앱 시작 시 1회 자동 리셋 체크
  useEffect(() => {
    setState((prev) => clearExpiredAzena(applyAutoResetIfNeeded(prev)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  //  앱 켜둔 채로 6시 넘어가도 반영되게 1분마다 체크
  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => clearExpiredAzena(applyAutoResetIfNeeded(prev)));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  //  자동 저장
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

  // 아제나 남은 시간 텍스트 변환
  const getAzenaRemainText = (remainHours: number | null) => {
    if (remainHours == null) return "";

    return remainHours >= 24
      ? `${Math.ceil(remainHours / 24)}일 남음`
      : `${remainHours}시간 남음`;
  };

  // =========================
  // 캐릭터 CRUD (activeTable 기준)
  // =========================
  function addCharacter() {
    const name = prompt("캐릭터 이름")?.trim();
    if (!name) return;
    const itemLevel = prompt("아이템레벨 (예: 1712.5)", "")?.trim() ?? "";
    const power = prompt("전투력 (예: 2500+)", "")?.trim() ?? "";
    const roleInput = (prompt("역할 입력: DEALER 또는 SUPPORT", "DEALER") ?? "").trim().toUpperCase();
    const role = roleInput === "SUPPORT" ? "SUPPORT" : "DEALER";

    const next: Character = createCharacter({ name, itemLevel, power, role });

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

    const roleInput = (prompt("역할 입력 (DEALER 또는 SUPPORT)", ch.role ?? "DEALER") ?? "")
      .trim()
      .toUpperCase();

    const role: CharacterRole = roleInput === "SUPPORT" ? "SUPPORT" : "DEALER";
    const nextPower = parseNum(power);

    setState((prev) => {
      const table = getActiveTable(prev);

      const nextChars: Character[] = table.characters.map((c) =>
        c.id === ch.id ? { ...c, name, itemLevel, power, role } : c
      );

      const nextTable: TodoTable = { ...table, characters: nextChars };

      return {
        ...prev,
        tables: prev.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
      };
    });

    setWeeklySchedules((prev) =>
      syncSchedulePowerSnapshotsForChar(
        prev,
        String(state.profile.friendCode ?? "").trim(),
        state.activeTableId,
        ch.id,
        nextPower
      )
    );
  }

  async function syncCharacterFromOfficial(tableId: string, ch: Character) {
    const nickname = String(ch.name ?? "").trim();
    if (!nickname) return;

    try {
      const response = await fetch(`/api/growth/kloa-character?nickname=${encodeURIComponent(nickname)}`);
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.detail || data?.error || "공식 캐릭터 정보를 불러오지 못했어.");
      }

      const itemLevel =
        typeof data.currentItemLevel === "number" && Number.isFinite(data.currentItemLevel)
          ? String(data.currentItemLevel)
          : "";
      const combatPower =
        typeof data.combatPower === "number" && Number.isFinite(data.combatPower)
          ? String(data.combatPower)
          : "";

      if (!itemLevel && !combatPower) {
        alert("공식 캐릭터 정보에서 아이템레벨/전투력을 찾지 못했어.");
        return;
      }

      const applyPower = combatPower ? confirm(`${nickname} 전투력 ${combatPower}도 불러올까요?`) : false;

      setState((prev) => {
        const table = getTableById(prev, tableId);
        const nextChars: Character[] = table.characters.map((c) =>
          c.id === ch.id
            ? {
                ...c,
                itemLevel: itemLevel || c.itemLevel,
                power: applyPower && combatPower ? combatPower : c.power,
              }
            : c
        );
        const nextTable: TodoTable = { ...table, characters: nextChars };
        return {
          ...prev,
          tables: prev.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
        };
      });
    } catch (error: any) {
      alert(error?.message || "공식 캐릭터 정보를 불러오지 못했어.");
    }
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

  // ✅ "기본은 숨김, 추가할 때만 보이게"용 프리셋
  // - 기본 상태/마이그레이션에서는 만들지 않지만,
  // - 사용자가 "추가" 할 때는 빠르게 선택할 수 있게 제공
  const WEEKLY_EXCHANGE_PRESETS = [
    { title: "천상", cellType: "CHECK" as const },
    { title: "혈석 교환", cellType: "CHECK" as const },
    { title: "클리어메달 교환", cellType: "CHECK" as const },
    { title: "해적주화 교환", cellType: "CHECK" as const },
  ];
  function addTask(period: "DAILY" | "WEEKLY" | "NONE") {
    const label = period === "DAILY" ? "일일" : period === "WEEKLY" ? "주간" : "기타";

    // ✅ 주간일 때: "주간 교환"은 프리셋(숨김 포함)으로 빠르게 추가
    // - 숫자 선택: 1~N
    // - 빈칸/그 외 입력: 기존처럼 직접 입력
    if (period === "WEEKLY") {
      const pick = prompt(
        [
          "주간 숙제 추가",
          "(선택) 주간 교환 프리셋 번호를 입력하면 자동 추가됩니다.",
          ...WEEKLY_EXCHANGE_PRESETS.map((p, i) => `${i + 1}. ${p.title}`),
          "\n- 위 번호를 입력하면: 섹션=주간 교환 / 타입=CHECK 로 추가",
          "- 그냥 엔터/그 외 입력이면: 기존 방식(직접 입력)으로 진행",
        ].join("\n")
      )
        ?.trim();

      const idx = pick ? Number(pick) : NaN;
      if (Number.isFinite(idx) && idx >= 1 && idx <= WEEKLY_EXCHANGE_PRESETS.length) {
        const preset = WEEKLY_EXCHANGE_PRESETS[idx - 1];
        const t = createTask({
          title: preset.title,
          period: "WEEKLY" as any,
          cellType: preset.cellType as any,
          section: "주간 교환",
        });
        setState((prev) => ({ ...prev, tasks: [...prev.tasks, t] }));
        return;
      }
      // pick이 숫자가 아니면 그대로 아래 직접 입력 흐름으로 넘어감
    }

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
      const defaultTaskKey = [task.period, task.section ?? "", task.cellType ?? "", task.title].join("|");
      const shouldRememberDeletion = isPersistedDefaultTask(task);
      const deletedDefaultTaskKeys = shouldRememberDeletion
        ? Array.from(new Set([...(prev.profile.deletedDefaultTaskKeys ?? []), defaultTaskKey]))
        : prev.profile.deletedDefaultTaskKeys ?? [];

      const nextTables = prev.tables.map((tbl) => {
        const values = { ...(tbl.values ?? {}) };
        delete values[task.id];
        return { ...tbl, values };
      });

      return {
        ...prev,
        tasks: nextTasks,
        tables: nextTables,
        profile: {
          ...prev.profile,
          deletedDefaultTaskKeys,
        },
      };
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

  function toggleWeeklyRaidTaskCheckByRaidName(tableId: string, charId: string, raidName: string) {
    setState((prev) => {
      const normalizedRaid = normalizeRaidName(raidName ?? "");

      let task = prev.tasks.find(
        (t) =>
          t.period === "WEEKLY" &&
          (t.section ?? "").trim() === "주간 레이드" &&
          t.cellType === "CHECK" &&
          normalizeRaidName(t.title ?? "") === normalizedRaid
      );

      let nextState = prev;

      // ✅ task가 없으면 자동 생성
      if (!task) {
        task = createTask({
          title: canonicalRaidName(raidName),
          period: "WEEKLY",
          cellType: "CHECK",
          section: "주간 레이드",
        } as any);

        nextState = {
          ...prev,
          tasks: [...prev.tasks, task],
        };
      }

      const table = getTableById(nextState, tableId);
      const ch = table.characters.find((c) => c.id === charId);
      if (!ch || !task) return nextState;

      const cell = getCellByTableId(nextState, tableId, task.id, charId);
      const nextChecked = !(cell?.type === "CHECK" ? cell.checked : false);

      return setCellByTableId(nextState, tableId, task, ch, {
        type: "CHECK",
        checked: nextChecked,
        updatedAt: Date.now(),
      });
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
    const raw = prompt("백업 JSON을 붙여넣으세요.");
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
  type GoldSplit = {
    tradable: number;
    bound: number;
  };

  type RaidRewardInfo = {
    medal?: number;
    normal?: GoldSplit;
    hard?: GoldSplit;
    nightmare?: GoldSplit;
    stage1?: GoldSplit;
    stage2?: GoldSplit;
    stage3?: GoldSplit;
  };

  const splitGold = (tradable: number, bound: number): GoldSplit => ({ tradable, bound });
  const halfGold = (total: number): GoldSplit => ({ tradable: Math.floor(total / 2), bound: total - Math.floor(total / 2) });
  const tradableOnlyGold = (tradable: number): GoldSplit => ({ tradable, bound: 0 });
  const boundOnlyGold = (bound: number): GoldSplit => ({ tradable: 0, bound });

  function getSplitTotal(split?: GoldSplit) {
    return (split?.tradable ?? 0) + (split?.bound ?? 0);
  }

  function getVisibleGold(split: GoldSplit | undefined, includeBound: boolean) {
    if (!split) return 0;
    return split.tradable + (includeBound ? split.bound : 0);
  }

  const EMPTY_GOLD_SPLIT: GoldSplit = { tradable: 0, bound: 0 };

  const RAID_REWARD_INFO: Record<string, RaidRewardInfo> = {
    "발탄": { medal: 120, normal: halfGold(1200), hard: halfGold(1800) },
    "비아키스": { medal: 160, normal: halfGold(1600), hard: halfGold(2400) },
    "쿠크세이튼": { medal: 300, normal: halfGold(3000) },
    "아브렐슈드": { medal: 700, normal: halfGold(4600), hard: halfGold(5600) },
    "카양겔": { medal: 450, normal: halfGold(3600), hard: halfGold(4800) },
    "일리아칸": { medal: 750, normal: halfGold(5400), hard: halfGold(7500) },
    "상아탑": { medal: 900, normal: halfGold(6500), hard: halfGold(9000) },
    "카멘": { medal: 1050, normal: halfGold(8000), hard: boundOnlyGold(8000) },
    "에키드나": { medal: 950, normal: halfGold(9500), hard: halfGold(11000) },
    "베히모스": { medal: 1400, normal: splitGold(3600, 3600) },

    "서막": {
      medal: 1500,
      normal: halfGold(6100),
      hard: splitGold(3600, 3600),
    },
    "1막": { medal: 1900, normal: splitGold(5750, 5750), hard: splitGold(9000, 9000) },
    "2막": { medal: 2300, normal: splitGold(8250, 8250), hard: splitGold(11500, 11500) },
    "3막": { medal: 2700, normal: splitGold(10500, 10500), hard: splitGold(13500, 13500) },

    "4막": { normal: splitGold(16500, 16500), hard: tradableOnlyGold(42000) },
    "종막": { normal: splitGold(20000, 20000), hard: tradableOnlyGold(52000) },
    "세르카": {
      normal: splitGold(17500, 17500),
      hard: tradableOnlyGold(44000),
      nightmare: tradableOnlyGold(54000),
    },
    "지평의 성당": {
      stage1: boundOnlyGold(30000),
      stage2: boundOnlyGold(40000),
      stage3: boundOnlyGold(50000),
    },

    "1막 익스트림": {
      normal: tradableOnlyGold(20000), // 4/24 익스트림 추가
      hard: tradableOnlyGold(45000),
      nightmare: tradableOnlyGold(45000),
    },
    "2막 익스트림": {
      normal: tradableOnlyGold(20000), // 4/24 익스트림 추가
      hard: tradableOnlyGold(45000),
      nightmare: tradableOnlyGold(45000),
    },
  };

  type DiffName = "노말" | "하드" | "나이트메어" | "1단계" | "2단계" | "3단계";

  type RaidPopup = { title: string; x: number; y: number } | null;

  type WeeklyTop3Popup =
    | { tableId: string; charId: string; charName: string; ilvl: number; x: number; y: number }
    | null;

  type WeeklyPopupRaidTab = "current" | "legacy";

  type WeeklyRaidPick = {
    raids: string[];      // 이번 주 도는 레이드 전체
    goldRaids: string[];  // 골드 받는 레이드 (최대 3개)
    diffs: Record<string, DiffName>;
  };

  const [raidGoldPopup, setRaidGoldPopup] = useState<RaidPopup>(null);

  // =========================
  // ✅ Top3 골드: 난이도 선택(캐릭터별 저장) + 팝업
  // =========================

  const WEEKLY_PICK_KEY = "loa-weekly-raid-pick:v1";
  const [weeklyRaidPickByChar, setWeeklyRaidPickByChar] = useState<Record<string, WeeklyRaidPick>>({});
  const weeklyRaidPickRef = useRef<Record<string, WeeklyRaidPick>>({});
  const [weeklyTop3Popup, setWeeklyTop3Popup] = useState<WeeklyTop3Popup>(null);
  const [weeklyPopupRaidTab, setWeeklyPopupRaidTab] = useState<WeeklyPopupRaidTab>("current");

  useEffect(() => {
    weeklyRaidPickRef.current = weeklyRaidPickByChar;
  }, [weeklyRaidPickByChar]);

  useEffect(() => {
    if (weeklyTop3Popup) {
      setWeeklyPopupRaidTab("current");
    }
  }, [weeklyTop3Popup]);

  const POPUP_WEEKLY_CHECK_MAX_ILVL = 1700;
  const LEGACY_POPUP_RAID_NAMES = new Set([
    "발탄",
    "비아키스",
    "쿠크세이튼",
    "아브렐슈드",
    "카양겔",
    "일리아칸",
    "상아탑",
    "카멘",
  ]);

  function weeklyCharKey(tableId: string, charId: string) {
    return `${tableId}:${charId}`;
  }

  function canonicalRaidName(name: string) {
    const normalized = normalizeRaidName(String(name ?? ""));
    const found = RAID_CATALOG.find((raid) => normalizeRaidName(raid.name) === normalized);
    return found?.name ?? String(name ?? "").trim();
  }

  function uniqueCanonicalRaidNames(names: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const name of names) {
      const canonical = canonicalRaidName(name);
      const normalized = normalizeRaidName(canonical);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(canonical);
    }

    return result;
  }

  function getWeeklyRaidMinIlvl(raidName: string) {
    const def = RAID_CATALOG.find((raid) => normalizeRaidName(raid.name) === normalizeRaidName(raidName));
    if (!def || !Array.isArray(def.diffs) || def.diffs.length === 0) {
      return Number.MAX_SAFE_INTEGER;
    }

    return Math.min(...def.diffs.map((diff) => diff.minIlvl));
  }

  function shouldUsePopupWeeklyRaidCheckByRaid(raidName: string) {
    return getWeeklyRaidMinIlvl(raidName) < POPUP_WEEKLY_CHECK_MAX_ILVL;
  }

  function sanitizeWeeklyRaidPick(ilvl: number, source?: Partial<WeeklyRaidPick> | null): WeeklyRaidPick {
    const auto = calcWeeklyTop3Gold(ilvl);
    const autoRaids = uniqueCanonicalRaidNames(auto.top3.map((x) => x.raid));

    const hasExplicitRaids = Array.isArray(source?.raids);
    const hasExplicitGoldRaids = Array.isArray(source?.goldRaids);

    const raids = uniqueCanonicalRaidNames(hasExplicitRaids ? source!.raids! : autoRaids)
      .filter((raidName) => availableDiffNames(ilvl, raidName).length > 0);

    // 4/24 사용자가 전부 해제한 상태([])는 유지
    const finalRaids = hasExplicitRaids ? raids : (raids.length > 0 ? raids : autoRaids);

    const rawGoldRaids = uniqueCanonicalRaidNames(hasExplicitGoldRaids ? source!.goldRaids! : autoRaids)
      .filter((raidName) => finalRaids.some((name) => normalizeRaidName(name) === normalizeRaidName(raidName)))
      .filter((raidName) => availableDiffNames(ilvl, raidName).length > 0);

    const normalGoldRaids = rawGoldRaids.filter(
      (raidName) => !DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(raidName))
    );

    const extremeGoldRaids = rawGoldRaids.filter(
      (raidName) => DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(raidName))
    );

    const goldRaids = [...normalGoldRaids.slice(0, 3), ...extremeGoldRaids];

    const diffsSource = source?.diffs && typeof source.diffs === "object" ? source.diffs : {};
    const diffs = Object.fromEntries(
      Object.entries(diffsSource).flatMap(([raidName, diff]) => {
        const canonical = canonicalRaidName(raidName);
        const avail = availableDiffNames(ilvl, canonical);
        if (!finalRaids.some((name) => normalizeRaidName(name) === normalizeRaidName(canonical))) return [];
        if (!avail.includes(diff as DiffName)) return [];
        return [[canonical, diff as DiffName]];
      })
    ) as Record<string, DiffName>;

    const fallbackNormalGoldRaids = finalRaids
      .filter((raidName) => !DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(raidName)))
      .slice(0, 3);

    const fallbackExtremeGoldRaids = finalRaids.filter((raidName) =>
      DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(raidName))
    );

    return {
      raids: finalRaids,
      goldRaids: hasExplicitGoldRaids
        ? goldRaids
        : (goldRaids.length > 0
          ? goldRaids
          : [...fallbackNormalGoldRaids, ...fallbackExtremeGoldRaids]),
      diffs,
    };
  }

  function getDefaultWeeklyRaidPick(ilvl: number): WeeklyRaidPick {
    const auto = calcWeeklyTop3Gold(ilvl);
    return sanitizeWeeklyRaidPick(ilvl, {
      raids: auto.top3.map((x) => x.raid),
      goldRaids: auto.top3.map((x) => x.raid),
      diffs: Object.fromEntries(
        auto.top3.map((x) => [x.raid, x.diff as DiffName])
      ) as Record<string, DiffName>,
    });
  }

  function loadWeeklyRaidPick(tableId: string, charId: string, ilvl: number): WeeklyRaidPick {
    try {
      const raw = localStorage.getItem(`${WEEKLY_PICK_KEY}:${tableId}:${charId}`);
      if (!raw) return getDefaultWeeklyRaidPick(ilvl);

      const parsed = JSON.parse(raw) as WeeklyRaidPick;
      if (!parsed || typeof parsed !== "object") {
        return getDefaultWeeklyRaidPick(ilvl);
      }

      return sanitizeWeeklyRaidPick(ilvl, parsed);
    } catch {
      return getDefaultWeeklyRaidPick(ilvl);
    }
  }

  function saveWeeklyRaidPick(tableId: string, charId: string, pick: WeeklyRaidPick) {
    try {
      localStorage.setItem(`${WEEKLY_PICK_KEY}:${tableId}:${charId}`, JSON.stringify(pick));
    } catch {
      // ignore
    }
  }

  // ✅ 표/캐릭터 바뀔 때 로컬저장 값 선로딩(합산값도 바로 반영되게)
  useEffect(() => {
    const next: Record<string, WeeklyRaidPick> = {};

    for (const tbl of state.tables) {
      for (const ch of tbl.characters as any[]) {
        const k = weeklyCharKey(tbl.id, ch.id);
        const ilvl = parseIlvl(ch.itemLevel);
        next[k] = loadWeeklyRaidPick(tbl.id, ch.id, ilvl);
      }
    }

    setWeeklyRaidPickByChar(next);
  }, [state.tables]);


  const DEFAULT_HIDDEN_WEEKLY_RAID_TITLES = new Set([
    "발탄",
    "비아키스",
    "쿠크세이튼",
    "아브렐슈드",
    "카양겔",
    "일리아칸",
    "상아탑",
    "카멘",
    "에키드나",
    "베히모스",
    "1막",
    "2막",
    "3막",
  ]);

  const DEFAULT_EXTREME_WEEKLY_RAID_TITLES = new Set([
    "1막 익스트림",
    "2막 익스트림",
  ]);

  function isDefaultHiddenWeeklyRaidTask(task: TaskRow) {
    if (task.period !== "WEEKLY") return false;
    if ((task.section ?? "").trim() !== "주간 레이드") return false;

    const title = (task.title ?? "").trim();

    // 4/24 기본 레이드 숨김은 order가 아니라 title 기준으로 처리
    return DEFAULT_HIDDEN_WEEKLY_RAID_TITLES.has(title);
  }

  const tasks = useMemo(() => {
    const visibleTasks = state.tasks.filter((t) => !isDefaultHiddenWeeklyRaidTask(t));

    if (periodTab === "RAID_LEFT") {
      return visibleTasks.filter(
        (t) => t.period === "WEEKLY" && t.section === "주간 레이드"
      );
    }

    if (periodTab === "ALL") return visibleTasks;
    return visibleTasks.filter((t) => t.period === periodTab);
  }, [periodTab, state.tasks]);

  const SECTION_ORDER: Record<string, number> = {
    "일일 숙제": 1,
    "주간 레이드": 2,
    "주간 교환": 3,
  };

  const WEEKLY_RAID_ORDER: Record<string, number> = {
    "발탄": 1,
    "비아키스": 2,
    "쿠크세이튼": 3,
    "아브렐슈드": 4,
    "카양겔": 5,
    "일리아칸": 6,
    "상아탑": 7,
    "카멘": 8,
    "에키드나": 9,
    "베히모스": 10,
    "1막": 11,
    "2막": 12,
    "3막": 13,
    "4막": 14,
    "종막": 15,
    "세르카": 16,
    "지평의 성당": 17,
    "1막 익스트림": 18, // 4/24 익스트림 추가
    "2막 익스트림": 19, // 4/24 익스트림 추가
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

          const ao = a.order ?? Number.MAX_SAFE_INTEGER;
          const bo = b.order ?? Number.MAX_SAFE_INTEGER;
          if (ao !== bo) return ao - bo;

          return at.localeCompare(bt, "ko");
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

      // 4/24 주간 레이드 드래그 시 숨겨진 레이드까지 다시 출력되는 문제 방지
      const reorderTargets =
        fromSec === "주간 레이드"
          ? prev.tasks.filter((t) => {
            const title = (t.title ?? "").trim();
            return (
              (t.section ?? "숙제") === fromSec &&
              [
                "4막",
                "종막",
                "세르카",
                "지평의 성당",
                "1막 익스트림",
                "2막 익스트림",
              ].includes(title)
            );
          })
          : prev.tasks.filter((t) => (t.section ?? "숙제") === fromSec);

      const secTasks = reorderTargets.sort((a, b) => {
        const ao = a.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return (a.title ?? "").localeCompare(b.title ?? "", "ko");
      });

      const fromIdx = secTasks.findIndex((t) => t.id === fromTaskId);
      const toIdx = secTasks.findIndex((t) => t.id === toTaskId);
      if (fromIdx < 0 || toIdx < 0) return prev;

      const nextSecTasks = [...secTasks];
      const [moved] = nextSecTasks.splice(fromIdx, 1);
      nextSecTasks.splice(toIdx, 0, moved);

      const base =
        fromSec === "주간 레이드"
          ? 400
          : Date.now();

      const orderMap = new Map<string, number>();
      nextSecTasks.forEach((t, i) => orderMap.set(t.id, base + i));

      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id)! } : t
        ),
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
  type RaidDifficulty = {
    name: DiffName;
    minIlvl: number;
    gold: number;
  };

  type RaidDef = {
    key: string;
    name: string;
    diffs: RaidDifficulty[];
  };

  const RAID_CATALOG: RaidDef[] = [
    {
      key: "VALTAN",
      name: "발탄",
      diffs: [
        { name: "노말", minIlvl: 1415, gold: getSplitTotal(RAID_REWARD_INFO["발탄"].normal) },
        { name: "하드", minIlvl: 1445, gold: getSplitTotal(RAID_REWARD_INFO["발탄"].hard) },
      ],
    },
    {
      key: "VYKAS",
      name: "비아키스",
      diffs: [
        { name: "노말", minIlvl: 1430, gold: getSplitTotal(RAID_REWARD_INFO["비아키스"].normal) },
        { name: "하드", minIlvl: 1460, gold: getSplitTotal(RAID_REWARD_INFO["비아키스"].hard) },
      ],
    },
    {
      key: "KOUKOU",
      name: "쿠크세이튼",
      diffs: [{ name: "노말", minIlvl: 1475, gold: getSplitTotal(RAID_REWARD_INFO["쿠크세이튼"].normal) }],
    },
    {
      key: "ABREL",
      name: "아브렐슈드",
      diffs: [
        { name: "노말", minIlvl: 1490, gold: getSplitTotal(RAID_REWARD_INFO["아브렐슈드"].normal) },
        { name: "하드", minIlvl: 1540, gold: getSplitTotal(RAID_REWARD_INFO["아브렐슈드"].hard) },
      ],
    },
    {
      key: "KAYANGEL",
      name: "카양겔",
      diffs: [
        { name: "노말", minIlvl: 1540, gold: getSplitTotal(RAID_REWARD_INFO["카양겔"].normal) },
        { name: "하드", minIlvl: 1580, gold: getSplitTotal(RAID_REWARD_INFO["카양겔"].hard) },
      ],
    },
    {
      key: "ILLIAKAN",
      name: "일리아칸",
      diffs: [
        { name: "노말", minIlvl: 1580, gold: getSplitTotal(RAID_REWARD_INFO["일리아칸"].normal) },
        { name: "하드", minIlvl: 1600, gold: getSplitTotal(RAID_REWARD_INFO["일리아칸"].hard) },
      ],
    },
    {
      key: "IVORY",
      name: "상아탑",
      diffs: [
        { name: "노말", minIlvl: 1600, gold: getSplitTotal(RAID_REWARD_INFO["상아탑"].normal) },
        { name: "하드", minIlvl: 1620, gold: getSplitTotal(RAID_REWARD_INFO["상아탑"].hard) },
      ],
    },
    {
      key: "KAMEN",
      name: "카멘",
      diffs: [
        { name: "노말", minIlvl: 1610, gold: getSplitTotal(RAID_REWARD_INFO["카멘"].normal) },
        { name: "하드", minIlvl: 1630, gold: getSplitTotal(RAID_REWARD_INFO["카멘"].hard) },
      ],
    },
    { key: "ACT0", name: "서막", diffs: [{ name: "노말", minIlvl: 1620, gold: getSplitTotal(RAID_REWARD_INFO["서막"].normal) }, { name: "하드", minIlvl: 1640, gold: getSplitTotal(RAID_REWARD_INFO["서막"].hard) }] },
    { key: "epic", name: "베히모스", diffs: [{ name: "노말", minIlvl: 1640, gold: getSplitTotal(RAID_REWARD_INFO["베히모스"].normal) }] },
    { key: "ACT1", name: "1막", diffs: [{ name: "노말", minIlvl: 1660, gold: getSplitTotal(RAID_REWARD_INFO["1막"].normal) }, { name: "하드", minIlvl: 1680, gold: getSplitTotal(RAID_REWARD_INFO["1막"].hard) }] },
    { key: "ACT2", name: "2막", diffs: [{ name: "노말", minIlvl: 1670, gold: getSplitTotal(RAID_REWARD_INFO["2막"].normal) }, { name: "하드", minIlvl: 1690, gold: getSplitTotal(RAID_REWARD_INFO["2막"].hard) }] },
    { key: "ACT3", name: "3막", diffs: [{ name: "노말", minIlvl: 1680, gold: getSplitTotal(RAID_REWARD_INFO["3막"].normal) }, { name: "하드", minIlvl: 1700, gold: getSplitTotal(RAID_REWARD_INFO["3막"].hard) }] },
    { key: "ACT4", name: "4막", diffs: [{ name: "노말", minIlvl: 1700, gold: getSplitTotal(RAID_REWARD_INFO["4막"].normal) }, { name: "하드", minIlvl: 1720, gold: getSplitTotal(RAID_REWARD_INFO["4막"].hard) }] },
    { key: "FINAL", name: "종막", diffs: [{ name: "노말", minIlvl: 1710, gold: getSplitTotal(RAID_REWARD_INFO["종막"].normal) }, { name: "하드", minIlvl: 1730, gold: getSplitTotal(RAID_REWARD_INFO["종막"].hard) }] },
    { key: "SERKA", name: "세르카", diffs: [{ name: "노말", minIlvl: 1710, gold: getSplitTotal(RAID_REWARD_INFO["세르카"].normal) }, { name: "하드", minIlvl: 1730, gold: getSplitTotal(RAID_REWARD_INFO["세르카"].hard) }, { name: "나이트메어", minIlvl: 1750, gold: getSplitTotal(RAID_REWARD_INFO["세르카"].nightmare) }] },
    { key: "ABYSS1", name: "지평의 성당", diffs: [{ name: "1단계", minIlvl: 1700, gold: getSplitTotal(RAID_REWARD_INFO["지평의 성당"].stage1) }, { name: "2단계", minIlvl: 1720, gold: getSplitTotal(RAID_REWARD_INFO["지평의 성당"].stage2) }, { name: "3단계", minIlvl: 1750, gold: getSplitTotal(RAID_REWARD_INFO["지평의 성당"].stage3) }] },

    {
      key: "EXT_ACT1", name: "1막 익스트림", diffs: [ // 4/24 익스트림 추가
        { name: "노말", minIlvl: 1720, gold: getSplitTotal(RAID_REWARD_INFO["1막 익스트림"].normal) },
        { name: "하드", minIlvl: 1750, gold: getSplitTotal(RAID_REWARD_INFO["1막 익스트림"].hard) },
        { name: "나이트메어", minIlvl: 1770, gold: getSplitTotal(RAID_REWARD_INFO["1막 익스트림"].nightmare) },
      ]
    },
    {
      key: "EXT_ACT2", name: "2막 익스트림", diffs: [ // 4/24 익스트림 추가
        { name: "노말", minIlvl: 1720, gold: getSplitTotal(RAID_REWARD_INFO["2막 익스트림"].normal) },
        { name: "하드", minIlvl: 1750, gold: getSplitTotal(RAID_REWARD_INFO["2막 익스트림"].hard) },
        { name: "나이트메어", minIlvl: 1770, gold: getSplitTotal(RAID_REWARD_INFO["2막 익스트림"].nightmare) },
      ]
    },
  ];

  // =========================
  // ✅ 쿠르잔 전선 → 큐브 해금 티켓 +1
  // - 캐릭터 ilvl에 따라 1~4해금 자동 선택
  // - 티켓 숙제가 없으면 "기타" 섹션에 자동 생성
  // =========================
  const UNLOCK_TICKET_TITLES = ["4해금", "3해금", "2해금", "1해금"] as const;

  function pickUnlockTicketTitle(ilvl: number) {
    for (const title of UNLOCK_TICKET_TITLES) {
      const min = TASK_MIN_ILVL[title] ?? 0;
      if (min > 0 && ilvl >= min) return title;
    }
    return "1해금";
  }

  function addUnlockTicketForChar(tableId: string, ch: Character, amount = 1) {
    setState((prev) => {
      const ilvl = getCharIlvl(ch as any);
      const ticketTitle = pickUnlockTicketTitle(ilvl);

      // 1) 티켓 Task 존재 보장 (period=NONE, cellType=TEXT)
      let next: TodoState = prev;
      let ticketTask = next.tasks.find((t) => t.title === ticketTitle && t.period === "NONE" && t.cellType === "TEXT");
      if (!ticketTask) {
        const created = createTask({
          title: ticketTitle,
          period: "NONE",
          cellType: "TEXT",
          section: "기타",
        } as any);
        next = { ...next, tasks: [...next.tasks, created] };
        ticketTask = created;
      }

      // 2) 현재 값 + amount
      const cell = getCellByTableId(next, tableId, ticketTask.id, ch.id);
      const raw = cell?.type === "TEXT" ? cell.text : "";
      const cur = raw === "" ? 0 : Number(String(raw).replace(/[^0-9]/g, "")) || 0;
      const nextVal = Math.max(0, cur + amount);

      return setCellByTableId(next, tableId, ticketTask, ch, {
        type: "TEXT",
        text: String(nextVal),
        updatedAt: Date.now(),
      } as any);
    });
  }

  // =========================
  // ✅ 일일숙제 PIP
  // =========================

  function ensurePipStyles(pipWin: Window) {
    const doc = pipWin.document;
    if (doc.getElementById("pip-style")) return;

    const style = doc.createElement("style");
    style.id = "pip-style";
    style.textContent = `
    :root{
      --bg: #ffffff;
      --text: #0f172a;
      --muted: rgba(15,23,42,.7);
      --card: rgba(0,0,0,.03);
      --border: rgba(0,0,0,.12);
      --btn: #ffffff;
      --okBg: rgba(34,197,94,.14);
      --okDot: rgba(34,197,94,.9);
      --shadow: 0 10px 22px rgba(0,0,0,.12);
      --ring: 0 0 0 2px rgba(79,140,255,.35);
    }

    body.pip-dark{
      --bg: #0b1220;
      --text: #e5e7eb;
      --muted: rgba(229,231,235,.72);
      --card: rgba(255,255,255,.06);
      --border: rgba(255,255,255,.12);
      --btn: rgba(255,255,255,.06);
      --shadow: 0 10px 22px rgba(0,0,0,.35);
      --ring: 0 0 0 2px rgba(120,170,255,.35);
    }

    body{
      margin:0;
      background: var(--bg);
      color: var(--text);
    }

    .pip-wrap{
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      padding: 12px;
    }

    .pip-top{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: 8px;
      margin-bottom: 10px;
    }

    .pip-title{
      font-size: 14px;
      font-weight: 800;
      line-height: 1.1;
    }

    .pip-sub{
      font-size: 12px;
      color: var(--muted);
      margin-top: 3px;
    }

    .pip-actions{
      display:flex;
      gap: 6px;
    }

    .pip-btn{
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--btn);
      color: var(--text);
      cursor: pointer;
      box-shadow: none;
      transition: transform .12s ease, box-shadow .12s ease;
    }

    .pip-btn:active{
      transform: scale(.97);
    }

    .pip-list{
      display:flex;
      flex-direction:column;
      gap: 8px;
    }

    .pip-rowbtn{
      width:100%;
      text-align:left;
      padding: 10px 10px;
      border: 1px solid rgba(0,0,0,0); /* 카드 느낌 */
      border-radius: 12px;
      background: var(--card);
      color: var(--text);
      cursor: pointer;
      transition: transform .12s ease;
    }
    body.pip-dark .pip-rowbtn{
      border: 1px solid rgba(255,255,255,.06);
    }
    .pip-rowbtn:active{ transform: scale(.99); }

    .pip-checkdot{
      display:inline-block;
      width:10px;height:10px;
      border-radius:3px;
      border:1px solid var(--border);
      margin-right:8px;
      vertical-align:middle;
      background: transparent;
    }
      
    .pip-checkdot.on{
     background: rgba(59,130,246,.9);
     border-color: rgba(59,130,246,.9);
    }

    .pip-rowbtn.on{
      background: rgba(59,130,246,.18);
    }

    .pip-counterRow{
      display:flex;
      gap: 8px;
      align-items:center;
    }

    .pip-counterRow .pip-rowbtn{
      flex: 1;
    }

    .pip-cube{
      padding: 10px 10px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--btn);
      color: var(--text);
      cursor: pointer;
      transition: transform .12s ease, box-shadow .12s ease;
      white-space: nowrap;
    }
    .pip-cube:active{ transform: scale(.97); }

    /* ✅ “눌렀다” 피드백 */
    .pip-cube.is-pressed{
      box-shadow: var(--ring);
      transform: scale(.97);
    }

    .pip-select{
     max-width: 160px;
       padding: 8px 10px;
       border-radius: 10px;
       border: 1px solid var(--border);
       background: var(--btn);
       color: var(--text);
       cursor: pointer;
      }
      body.pip-dark .pip-select{
        background: rgba(255,255,255,.06);
      }
        /* ===== Table Select (표 선택) ===== */
.pip-select{
  width: 140px;
  max-width: 160px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--btn);
  color: var(--text);
  cursor: pointer;
  outline: none;
  appearance: none;            /* 기본 화살표 스타일 줄이기(브라우저마다 다름) */
}

/* 포커스 링 */
.pip-select:focus{
  box-shadow: var(--ring);
}

/* ✅ 옵션(드롭다운 목록) 다크에서 하얗게 뜨는 문제 해결 */
.pip-select option{
  background: var(--bg);
  color: var(--text);
}

/* 다크모드에서 select 자체 */
body.pip-dark .pip-select{
  background: rgba(255,255,255,.06);
  border-color: rgba(255,255,255,.14);
  color: var(--text);
}

/* ✅ 다크모드에서 option도 어둡게 */
body.pip-dark .pip-select option{
  background: #0b1220;         /* PIP 다크 배경과 맞춤 */
  color: #e5e7eb;
}
  .pip-azena{
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
}

.pip-azena-check{
  display:inline-flex;
  width: 16px;
  height: 16px;
  align-items:center;
  justify-content:center;
  border-radius: 6px;
  background: var(--okDot);
  color: white;
  font-size: 12px;
  line-height: 1;
}
  `;
    doc.head.appendChild(style);
  }


  function getDailyTasksForPip(s: TodoState) {
    return s.tasks.filter((t) => t.period === "DAILY");
  }

  function pipIsDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  function syncPipDark(pipWin: Window) {
    pipWin.document.body.classList.toggle("pip-dark", pipIsDark());
  }

  function renderDailyPip() {
    const pipWin = pipWindowRef.current;
    if (!pipWin) return;

    // ✅ PIP 스타일 주입 + 다크 동기화
    ensurePipStyles(pipWin);
    syncPipDark(pipWin);

    const s = stateRef.current;
    const effectiveTableId = pipTableIdRef.current ?? s.activeTableId;
    const table = getTableById(s, effectiveTableId);
    const characters = table.characters;

    if (!characters.length) {
      pipWin.document.body.innerHTML = `<div class="pip-wrap" style="opacity:.8">캐릭터가 없어.</div>`;
      return;
    }

    const idx = clamp(pipCharIndexRef.current, 0, characters.length - 1);
    pipCharIndexRef.current = idx;
    const ch = characters[idx];

    // ✅ 아제나 ON 여부 (Character에 azenaEnabled가 있다고 했던 구조 기준)
    const azenaOn = !!(ch as any).azenaEnabled;

    const dailyTasks = getDailyTasksForPip(s);

    const rowsHtml = dailyTasks
      .map((t) => {
        const cell = getCellByTableId(s, table.id, t.id, ch.id);

        if (t.cellType === "CHECK") {
          const on = cell?.type === "CHECK" ? cell.checked : false;
          return `
          <button data-act="toggle" data-task="${t.id}" class="pip-rowbtn ${on ? "on" : ""}">
            <span class="pip-checkdot ${on ? "on" : ""}"></span>
            <span style="vertical-align:middle">${t.title}</span>
          </button>
        `;
        }

        if (t.cellType === "COUNTER") {
          const max = Math.max(1, t.max ?? 1);
          const count = cell?.type === "COUNTER" ? (cell.count ?? 0) : 0;
          const done = count >= max;

          const isCore = t.id === CORE_DAILY_TASK_ID;
          const ilvl = getCharIlvl(ch as any);
          const coreLabel = isCore ? getCoreDailyLabel(ilvl) : "";
          const showCubeBtn = isCore && coreLabel === "쿠르잔 전선";

          const flashKey = `${table.id}:${ch.id}:cube`;
          const flashOn = (pipCubeFlashRef.current[flashKey] ?? 0) > Date.now() - 1500;

          return `
          <div class="pip-counterRow">
            <button data-act="toggle" data-task="${t.id}" class="pip-rowbtn ${done ? "on" : ""}">
              <b>${isCore ? coreLabel : t.title}</b>
              <span style="opacity:.8;margin-left:8px">${count}/${max}</span>
            </button>
            ${showCubeBtn
              ? `<button data-act="cube" class="pip-cube ${flashOn ? "is-pressed" : ""}" title="쿠르잔 전선 보상: 큐브 해금 티켓 +1">큐브티켓+1</button>`
              : ""
            }
          </div>
        `;
        }

        if (t.cellType === "TEXT") {
          const v = cell?.type === "TEXT" ? (cell.text ?? "") : "";
          return `<div class="pip-rowbtn" style="cursor:default"><b>${t.title}</b><span style="opacity:.8;margin-left:8px">${String(
            v
          )}</span></div>`;
        }

        if (t.cellType === "SELECT") {
          const v = cell?.type === "SELECT" ? (cell.value ?? "") : "";
          return `<div class="pip-rowbtn" style="cursor:default"><b>${t.title}</b><span style="opacity:.8;margin-left:8px">${String(
            v
          )}</span></div>`;
        }

        return `<div class="pip-rowbtn" style="cursor:default">${t.title}</div>`;
      })
      .join("");

    const tableOptions = s.tables
      .map((t) => {
        const selected = t.id === effectiveTableId ? "selected" : "";
        const name = (t.name ?? "표").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<option value="${t.id}" ${selected}>${name}</option>`;
      })
      .join("");

    pipWin.document.body.innerHTML = `
    <div class="pip-wrap">
      <div class="pip-top">
        <div>
          <div class="pip-title">${ch.name}</div>

          ${azenaOn
        ? `<div class="pip-azena">
                   <span class="pip-azena-check"></span>
                   <span>아제나</span>
                 </div>`
        : ""
      }

          <div class="pip-sub">${table.name ?? "표"} · ${idx + 1}/${characters.length}</div>
        </div>

        <select data-act="table" class="pip-select">
          ${tableOptions}
        </select>

        <div class="pip-actions">
          <button data-act="prev" class="pip-btn">◀</button>
          <button data-act="next" class="pip-btn">▶</button>
        </div>
      </div>

      <div class="pip-list">
        ${rowsHtml}
      </div>
    </div>
  `;
  }

  async function openDailyPip() {
    const anyWin = window as any;
    if (!anyWin.documentPictureInPicture) {
      alert("이 브라우저는 Document PIP를 지원하지 않습니다. (크롬 권장)");
      return;
    }

    // 이미 열려있으면 포커스만
    if (pipWindowRef.current) {
      try {
        pipWindowRef.current.focus?.();
      } catch {
        // ignore
      }
      return;
    }

    const pipWin = await anyWin.documentPictureInPicture.requestWindow({
      width: 380,
      height: 640,
    });

    pipWindowRef.current = pipWin;
    pipTableIdRef.current = stateRef.current.activeTableId; // 현재 표로 시작
    pipCharIndexRef.current = 0;

    // ✅ 닫히면 ref 정리
    pipWin.addEventListener("pagehide", () => {
      pipWindowRef.current = null;
    });

    // ✅ PIP 내부 클릭 핸들러(한 번만)
    pipWin.document.body.addEventListener("click", (e: any) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const btn = target.closest("button") as HTMLButtonElement | null;
      if (!btn) return;

      const act = btn.getAttribute("data-act");
      if (!act) return;

      const s = stateRef.current;
      const table = getTableById(s, s.activeTableId);
      const characters = table.characters;
      if (!characters.length) return;

      const idx = clamp(pipCharIndexRef.current, 0, characters.length - 1);
      pipCharIndexRef.current = idx;
      const ch = characters[idx];

      if (act === "prev") {
        pipCharIndexRef.current = Math.max(0, idx - 1);
        renderDailyPip();
        return;
      }

      if (act === "next") {
        pipCharIndexRef.current = Math.min(characters.length - 1, idx + 1);
        renderDailyPip();
        return;
      }

      if (act === "toggle") {
        const taskId = btn.getAttribute("data-task") || "";
        const task = s.tasks.find((t) => t.id === taskId);
        if (!task) return;

        // ✅ 기존 로직 재사용(체크/카운터 토글)
        onCellClick(table.id, task, ch);

        // 상태 반영 후 UI 갱신(즉시 느낌 주기)
        setTimeout(() => renderDailyPip(), 0);
        return;
      }

      if (act === "cube") {
        const flashKey = `${table.id}:${ch.id}:cube`;
        pipCubeFlashRef.current[flashKey] = Date.now(); // ✅ 1.5초 유지

        addUnlockTicketForChar(table.id, ch, 1);

        renderDailyPip(); // ✅ 즉시 재렌더(새 버튼에 is-pressed가 붙음)
        return;
      }
    });

    pipWin.document.body.addEventListener("change", (e: any) => {
      const el = e.target as any;
      if (!el) return;

      // ✅ PIP(다른 window)에서도 안전한 판별
      if (el?.tagName === "SELECT" && el.getAttribute?.("data-act") === "table") {
        const nextTableId = String(el.value || "");

        // ✅ PIP 전용 표 선택값 저장
        pipTableIdRef.current = nextTableId;

        // ✅ 표 바꾸면 캐릭 인덱스 리셋
        pipCharIndexRef.current = 0;

        // (선택) 메인 표도 같이 바꾸고 싶으면 유지
        setState((prev) =>
          prev.activeTableId === nextTableId ? prev : { ...prev, activeTableId: nextTableId }
        );

        // ✅ 마지막에 렌더
        renderDailyPip();
      }
    });
    renderDailyPip();
  }

  function pickBestDiff(ilvl: number, raid: RaidDef): RaidDifficulty | null {
    const available = raid.diffs.filter((d) => ilvl >= d.minIlvl);
    if (!available.length) return null;
    return available.reduce((best, cur) => (cur.gold > best.gold ? cur : best));
  }

  function calcWeeklyTop3Gold(ilvl: number) {
    const candidates = RAID_CATALOG
      .filter((raid) => !DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(raid.name)) // 4/24 익스트림은 Top3 자동 계산 제외
      .map((raid) => {
        const best = pickBestDiff(ilvl, raid);
        return best ? { raid: raid.name, diff: best.name as DiffName, gold: best.gold } : null;
      })
      .filter(Boolean) as { raid: string; diff: DiffName; gold: number }[];

    candidates.sort((a, b) => b.gold - a.gold);
    const top3 = candidates.slice(0, 3);
    const sum = top3.reduce((acc, cur) => acc + cur.gold, 0);
    return { sum, top3, all: candidates };
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
  function getGoldSplitByDiffName(raidName: string, diff: DiffName): GoldSplit {
    const g = RAID_REWARD_INFO[raidName];
    if (!g) return EMPTY_GOLD_SPLIT;

    if (diff === "노말") return g.normal ?? EMPTY_GOLD_SPLIT;
    if (diff === "하드") return g.hard ?? EMPTY_GOLD_SPLIT;
    if (diff === "나이트메어") return g.nightmare ?? EMPTY_GOLD_SPLIT;
    if (diff === "1단계") return g.stage1 ?? EMPTY_GOLD_SPLIT;
    if (diff === "2단계") return g.stage2 ?? EMPTY_GOLD_SPLIT;
    if (diff === "3단계") return g.stage3 ?? EMPTY_GOLD_SPLIT;

    return EMPTY_GOLD_SPLIT;
  }

  function getGoldByDiffName(raidName: string, diff: DiffName) {
    return getVisibleGold(getGoldSplitByDiffName(raidName, diff), includeBoundGold);
  }

  function isWeeklyRaidTaskTitle(title: string) {
    return RAID_CATALOG.some(
      (raid) => normalizeRaidName(raid.name) === normalizeRaidName(title)
    );
  }

  function calcWeeklySelectedGold(ilvl: number, pick: WeeklyRaidPick | undefined) {
    const fallback = getDefaultWeeklyRaidPick(ilvl);
    const selected =
      pick && Array.isArray(pick.raids) && pick.raids.length
        ? pick
        : fallback;

    const allGoldRaids = selected.goldRaids ?? [];

    const normalGoldRaids = allGoldRaids.filter(
      (name) => !DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(name))
    );

    const extremeGoldRaids = allGoldRaids.filter(
      (name) => DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(name))
    );

    const goldSet = new Set([
      ...normalGoldRaids.slice(0, 3),
      ...extremeGoldRaids,
    ]);

    const rows = selected.raids
      .filter((raidName) => availableDiffNames(ilvl, raidName).length > 0)
      .map((raidName) => {
        const def = RAID_CATALOG.find((r) => normalizeRaidName(r.name) === normalizeRaidName(raidName));
        const avail = availableDiffNames(ilvl, raidName);

        if (!def || !avail.length) {
          return null;
        }

        const canonical = def.name;
        const autoBest = pickBestDiff(ilvl, def);
        const want = selected.diffs?.[canonical] ?? selected.diffs?.[raidName];

        const diff: DiffName =
          want && avail.includes(want)
            ? want
            : ((autoBest?.name ?? avail[avail.length - 1]) as DiffName);

        const checked = Array.from(goldSet).some(
          (name) => normalizeRaidName(name) === normalizeRaidName(canonical)
        );

        const split = checked ? getGoldSplitByDiffName(canonical, diff) : EMPTY_GOLD_SPLIT;
        const gold = getVisibleGold(split, includeBoundGold);

        return {
          raid: canonical,
          diff,
          gold,
          tradable: split.tradable,
          bound: split.bound,
          total: split.tradable + split.bound,
          checked,
          avail,
        };
      })
      .filter(Boolean) as {
        raid: string;
        diff: DiffName;
        gold: number;
        tradable: number;
        bound: number;
        total: number;
        checked: boolean;
        avail: DiffName[];
      }[];

    const sum = rows.reduce((acc, cur) => acc + cur.gold, 0);
    return { sum, rows };
  }

  function getWeeklyTop3RaidNameSet(ilvl: number): Set<string> {
    if (!Number.isFinite(ilvl) || ilvl <= 0) return new Set();
    const r = calcWeeklyTop3Gold(ilvl);
    return new Set(r.top3.map((x) => x.raid));
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
      map.set(normalizeRaidName(t.title ?? ""), t.id);
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

        for (const x of r.top3) {
          const split = getGoldSplitByDiffName(x.raid, x.diff);
          const visibleGold = getVisibleGold(split, includeBoundGold);

          total += visibleGold;

          const taskId = weeklyRaidTaskIdByTitle.get(normalizeRaidName(x.raid ?? ""));
          if (!taskId) continue;

          const cell = getCellByTableId(state, tbl.id, taskId, ch.id);
          if (cell && cell.type === "CHECK" && cell.checked) {
            done += visibleGold;
          }
        }
      }
    }

    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [state, weeklyRaidTaskIdByTitle, includeBoundGold]);


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
    const visibleCols = allCols;

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


                        <div
                          className="char-name"
                          title={`${ch.name}\n더블클릭하면 공식 캐릭터 정보에서 아이템레벨을 불러와.`}
                          onDoubleClick={() => void syncCharacterFromOfficial(tableId, ch)}
                        >
                          {ch.name}
                        </div>

                        <div className="char-meta">Lv. {ch.itemLevel || "-"}</div>
                        <div className="char-meta">{ch.power || "-"}</div>

                        <div className="char-roleRow">
                          <label className="char-roleOpt dealer">
                            <input
                              type="radio"
                              name={`role-${ch.id}`}
                              checked={(ch.role ?? "DEALER") === "DEALER"}
                              onChange={() => {
                                const nextRole: CharacterRole = "DEALER";

                                setState((prev) => {
                                  const table = getTableById(prev, tableId);

                                  const nextChars: Character[] = table.characters.map((c) =>
                                    c.id === ch.id ? { ...c, role: nextRole } : c
                                  );

                                  const nextTable: TodoTable = { ...table, characters: nextChars };

                                  return {
                                    ...prev,
                                    tables: prev.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
                                  };
                                });
                              }}
                            />
                            <span className="roleIcon roleIconDealer">⚔</span>
                            <span>딜러</span>
                          </label>

                          <label className="char-roleOpt support">
                            <input
                              type="radio"
                              name={`role-${ch.id}`}
                              checked={(ch.role ?? "DEALER") === "SUPPORT"}
                              onChange={() => {
                                const nextRole: CharacterRole = "SUPPORT";

                                setState((prev) => {
                                  const table = getTableById(prev, tableId);

                                  const nextChars: Character[] = table.characters.map((c) =>
                                    c.id === ch.id ? { ...c, role: nextRole } : c
                                  );

                                  const nextTable: TodoTable = { ...table, characters: nextChars };

                                  return {
                                    ...prev,
                                    tables: prev.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
                                  };
                                });
                              }}
                            />
                            <span className="roleIcon roleIconSupport">✚</span>
                            <span>서폿</span>
                          </label>
                        </div>

                        {/* 아제나 (기존 그대로) */}
                        {(() => {
                          const enabled = Boolean((ch as any).azenaEnabled);
                          const expiresAt = (ch as any).azenaExpiresAt as string | null | undefined;
                          const expired = enabled && expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
                          const checked = enabled && !expired;
                          const azenaEndingSoon = checked && isAzenaEndingSoon(expiresAt);
                          const remainMs = checked ? getAzenaRemainingMs(expiresAt) : null;
                          const remainHours = remainMs != null ? Math.ceil(remainMs / (60 * 60 * 1000)) : null;

                          return (
                            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => onToggleAzena(tableId, ch.id, e.target.checked)}
                                />
                                <span>아제나</span>

                                {azenaEndingSoon && expiresAt ? (
                                  <span
                                    className="azena-alert"
                                    title={`아제나 만료 임박 (${getAzenaRemainText(remainHours)})\n만료: ${formatKoreanDateTime(expiresAt)}`}
                                  >
                                    !
                                  </span>
                                ) : null}
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

                        {/* 캐릭 수정/삭제는 active 표에서만 (기존 UX 유지) */}
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
                          const charKey = weeklyCharKey(tableId, ch.id);

                          const pick = sanitizeWeeklyRaidPick(
                            ilvl,
                            weeklyRaidPickByChar[charKey] ?? getDefaultWeeklyRaidPick(ilvl)
                          );

                          const selectedSet = new Set(
                            pick.raids.map((name) => normalizeRaidName(name))
                          );

                          // 팝업 위 레이드 버튼에서 꺼진 레이드는 표 체크칸도 숨김
                          if (!selectedSet.has(normalizeRaidName(task.title))) {
                            return <td key={`${tableId}:${ch.id}`} className="cell" />;
                          }

                          // 1700 미만 레이드는 표 대신 팝업 완료 체크로만 관리
                          if (shouldUsePopupWeeklyRaidCheckByRaid(task.title)) {
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
                          <div className="task-title">주간 클리어 골드(선택 3개)</div>
                          <div className="task-sub">캐릭터별 선택 레이드 3개 + 선택 난이도 적용</div>
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

                        const charKey = weeklyCharKey(tableId, ch.id);
                        const pick = weeklyRaidPickByChar[charKey] ?? getDefaultWeeklyRaidPick(ilvl);
                        const pickedResult = calcWeeklySelectedGold(ilvl, pick);

                        const detail = pickedResult.rows
                          .filter((x) => x.checked)
                          .map(
                            (x) =>
                              `${x.raid} (${x.diff}) - 유통 ${x.tradable.toLocaleString()} / 귀속 ${x.bound.toLocaleString()} / 표시 ${x.gold.toLocaleString()}G`
                          )
                          .join("\n");;

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
                              <div className="gold-detail">{pickedResult.rows.filter((x) => x.checked).slice(0, 3).map((x) => x.raid).join(" / ") || "-"}</div>
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
    const visibleCharacters = characters;


    return (
      <div
        className="tablePane"
        style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        {(periodTab === "ALL" || periodTab === "DAILY") && (
          <div className="paneAccountDailyBox">
            <AccountDailyPanel tableId={tableId} />
          </div>
        )}

        <div className="paneHeader paneHeaderInlineClose">
          <div className="paneHeaderTitleRow">
            <div className="paneTitle" style={{ marginBottom: 0 }}>
              {paneLabel} · {table.name}
            </div>

            {!isActivePane && (
              <button
                className="btn mini paneInlineCloseBtn"
                onClick={() => setSecondaryTableId("")}
              >
                닫기
              </button>
            )}
          </div>
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
                              title={
                                isTouch
                                  ? `${ch.name}\n더블클릭하면 공식 캐릭터 정보에서 아이템레벨을 불러와.`
                                  : "드래그해서 캐릭터 순서 변경 / 더블클릭하면 공식 캐릭터 정보에서 아이템레벨을 불러와."
                              }
                              onDoubleClick={() => void syncCharacterFromOfficial(tableId, ch)}
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

                            {/* 역할 선택 */}
                            <div className="char-roleRow">
                              <label className="char-roleOpt">
                                <input
                                  type="radio"
                                  name={`role-${ch.id}`}
                                  checked={(ch.role ?? "DEALER") === "DEALER"}
                                  onChange={() => {
                                    const nextRole: CharacterRole = "DEALER";

                                    setState((prev) => {
                                      const table = getTableById(prev, tableId);

                                      const nextChars: Character[] = table.characters.map((c) =>
                                        c.id === ch.id ? { ...c, role: nextRole } : c
                                      );

                                      const nextTable: TodoTable = { ...table, characters: nextChars };

                                      return {
                                        ...prev,
                                        tables: prev.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
                                      };
                                    });
                                  }}
                                />
                                딜러
                              </label>

                              <label className="char-roleOpt">
                                <input
                                  type="radio"
                                  name={`role-${ch.id}`}
                                  checked={(ch.role ?? "DEALER") === "SUPPORT"}
                                  onChange={() => {
                                    const nextRole: CharacterRole = "SUPPORT";

                                    setState((prev) => {
                                      const table = getTableById(prev, tableId);

                                      const nextChars: Character[] = table.characters.map((c) =>
                                        c.id === ch.id ? { ...c, role: nextRole } : c
                                      );

                                      const nextTable: TodoTable = { ...table, characters: nextChars };

                                      return {
                                        ...prev,
                                        tables: prev.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
                                      };
                                    });
                                  }}
                                />
                                서폿
                              </label>
                            </div>

                            {/* 아제나 */}
                            {(() => {
                              const enabled = Boolean((ch as any).azenaEnabled);
                              const expiresAt = (ch as any).azenaExpiresAt as string | null | undefined;
                              const expired = enabled && expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
                              const checked = enabled && !expired;
                              const endingSoon = checked && isAzenaEndingSoon(expiresAt);
                              const remainMs = checked ? getAzenaRemainingMs(expiresAt) : null;
                              const remainHours = remainMs != null ? Math.ceil(remainMs / (60 * 60 * 1000)) : null;

                              return (
                                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => onToggleAzena(tableId, ch.id, e.target.checked)}
                                    />

                                    <span
                                      className="rest-wrap"
                                      title={
                                        endingSoon && expiresAt
                                          ? `아제나 만료 임박 (${getAzenaRemainText(remainHours)})\n만료: ${formatKoreanDateTime(expiresAt)}`
                                          : undefined
                                      }
                                    >
                                      <span>아제나</span>
                                      {endingSoon ? <span className="rest-alert">!</span> : null}
                                    </span>
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

                                  // ✅ 현재 순회 중인 캐릭터 기준으로 계산
                                  const charKey = weeklyCharKey(tableId, ch.id);
                                  const picked = weeklyRaidPickByChar[charKey] ?? getDefaultWeeklyRaidPick(ilvl);
                                  const pickedResult = calcWeeklySelectedGold(ilvl, picked);

                                  const detail = pickedResult.rows
                                    .filter((x) => x.checked)
                                    .slice(0, 3)
                                    .map((x) => x.raid)
                                    .join(" / ");

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
                                        <div className="gold-detail">
                                          {pickedResult.rows.filter((x) => x.checked).slice(0, 3).map((x) => x.raid).join(" / ") || "-"}
                                        </div>
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            )}

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
                                          if (!RAID_REWARD_INFO[task.title]) return;
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

                                      const ilvl = getCharIlvl(ch as any);
                                      const coreLabel = isCore ? getCoreDailyLabel(ilvl) : "";
                                      const showCubeTicketBtn = isCore && coreLabel === "쿠르잔 전선";

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
                                          title={isCore ? coreLabel : "클릭 토글"}
                                        >
                                          <div className="cell-stack">
                                            {/* 1줄: 체크/카운터 + 휴식게이지 */}
                                            <div className="cell-top">
                                              <CounterDots max={max} count={count} />

                                              {(isCore || isGuardian) && (
                                                <div className="rest-wrap" onClick={(e) => e.stopPropagation()}>
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
                                                  />

                                                  {restMax > 0 && restValue >= restMax && (
                                                    <span className="rest-alert" title="휴식게이지가 최대예요. 오늘 돌아주면 좋아요!">
                                                      !
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>

                                            {/* 2줄: 큐브티켓+1 */}
                                            {showCubeTicketBtn && (
                                              <button
                                                type="button"
                                                className="mini cubeTicketBtn"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  addUnlockTicketForChar(tableId, ch, 1);

                                                  // ✅ 눌림 표시(잠깐)
                                                  const btn = e.currentTarget as HTMLButtonElement;
                                                  btn.classList.remove("is-pressed");
                                                  // reflow
                                                  void btn.offsetWidth;
                                                  btn.classList.add("is-pressed");
                                                }}
                                                title="쿠르잔 전선 보상: 큐브 해금 티켓 +1"
                                              >
                                                큐브티켓+1
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    }

                                    // 주간 레이드: 캐릭터별 Top3 레이드만 체크 버튼 렌더링
                                    if (section === "주간 레이드" && isWeeklyRaidTaskTitle(task.title)) {
                                      const ilvl = getCharIlvl(ch);
                                      const charKey = weeklyCharKey(tableId, ch.id);

                                      const pick = sanitizeWeeklyRaidPick(
                                        ilvl,
                                        weeklyRaidPickByChar[charKey] ?? getDefaultWeeklyRaidPick(ilvl)
                                      );

                                      const selectedSet = new Set(
                                        pick.raids.map((x) => normalizeRaidName(x))
                                      );

                                      // ✅ 팝업 위 레이드 버튼에서 꺼진 레이드는 표에서도 안 보임
                                      if (!selectedSet.has(normalizeRaidName(task.title))) {
                                        return <td key={`${tableId}:${ch.id}`} className="cell" />;
                                      }

                                      // ✅ 1700 미만 레이드는 표 대신 팝업 완료 체크로만 관리
                                      if (shouldUsePopupWeeklyRaidCheckByRaid(task.title)) {
                                        return <td key={`${tableId}:${ch.id}`} className="cell" />;
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

      {memoOpen && (
        <div className="memoOverlay" onClick={() => setMemoOpen(false)} role="dialog" aria-modal="true">
          <div className="memoModal" onClick={(e) => e.stopPropagation()}>
            <div className="memoHeader">
              <div className="memoTitle">메모장</div>
              <button className="btn mini" onClick={() => setMemoOpen(false)}>닫기</button>
            </div>

            <textarea
              className="memoTextarea"
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              placeholder="여기에 간단히 메모해두기 (표별로 저장됨)"
            />

            <div className="memoFooter">
              <button className="btn" onClick={() => setMemoText("")}>비우기</button>
              <button className="btn" onClick={() => setMemoOpen(false)}>저장</button>
            </div>
          </div>
        </div>
      )}

      <div className="todo-page">
        <div className="todo-topbar">
          <div className="topbar-left">
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
                <div className="todo-actions actions-row">
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
                  <div className="divider" />
                  <button className="btn" onClick={() => setTodayMustDoOpen((v) => !v)}>
                    오늘 해야할 일 {todayMustDoItems.length > 0 ? `(${todayMustDoItems.length})` : ""}
                  </button>

                  <button className="btn" onClick={() => setWeeklyMustDoOpen((v) => !v)}>
                    주간 해야할 일 {weeklyMustDoItems.length > 0 ? `(${weeklyMustDoItems.length})` : ""}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="topbar-center">
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

              <label className="weeklyGoldIncludeToggle">
                <input
                  type="checkbox"
                  checked={includeBoundGold}
                  onChange={(e) => setIncludeBoundGold(e.target.checked)}
                />
                <span>귀속 골드 포함</span>
              </label>

              <div className="weeklyGoldHint">
                {includeBoundGold ? "유통 + 귀속 기준 · 체크하면 자동 합산" : "유통 골드만 기준 · 체크하면 자동 합산"}
              </div>
            </div>
            <div className="todo-actions actions-row">
              <button className="btn" onClick={() => manualReset("DAILY")}>
                일일 초기화
              </button>
              <button className="btn" onClick={() => manualReset("WEEKLY")}>
                주간 초기화
              </button>

              <div className="divider" />
              <button className="btn" onClick={doExport}>JSON백업</button>
              <button className="btn" onClick={doImport}>JSON복원</button>
              <div className="divider" />
              <button className="btn" onClick={openDailyPip} title="현재 표의 일일숙제를 PIP로 띄우기(캐릭 1명씩)">
                일일숙제 PIP
              </button>
              <button className="btn" onClick={() => setMemoOpen(true)} title="간단 메모장">
                📝 메모장
              </button>
              <BidPopover />
            </div>
          </div>

          <div className="topbar-right">
            <div className="topbar-cards">
              <div className="friendBox friendBoxTop">
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
                          const json = exportRaidLeftSnapshot(state, state.activeTableId, weeklyRaidPickByChar);
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
                    <>
                      <button
                        className="mini"
                        onClick={async () => {
                          try {
                            await uploadRaidLeftSnapshot("manual");
                            alert("서버에 남은 레이드 스냅샷 업로드 완료!");
                          } catch (e: any) {
                            alert(`업로드 실패: ${String(e)}`);
                          }
                        }}
                      >
                        남은 레이드 서버 업로드
                      </button>
                    </>
                  )}
                </div>

                {/* ✅ 자동 업로드 설정 (서버모드에서만) */}
                {SERVER_MODE && (
                  <div className="friendRow friendRowWrap" style={{ marginTop: 4 }}>
                    <div className="friendLabel">자동</div>

                    <label className="friendAutoToggle" title="남은 레이드 스냅샷을 주기적으로 서버에 업로드">
                      <input
                        type="checkbox"
                        checked={Boolean(state.profile.autoRaidLeftUploadEnabled)}
                        onChange={(e) => setAutoRaidLeftUploadEnabled(e.target.checked)}
                      />
                      <span>켜기</span>
                    </label>

                    <select
                      className="friendSelect friendAutoInterval"
                      value={String(state.profile.autoRaidLeftUploadMinutes ?? 60)}
                      onChange={(e) => setAutoRaidLeftUploadMinutes(Number(e.target.value))}
                      disabled={!state.profile.autoRaidLeftUploadEnabled}
                      title="자동 업로드 간격(분)"
                    >
                      <option value="15">15분</option>
                      <option value="30">30분</option>
                      <option value="60">1시간</option>
                      <option value="120">2시간</option>
                    </select>

                    {raidSnapUploadState !== "idle" && (
                      <span
                        className={["pill", raidSnapUploadState === "error" ? "daily" : "weekly"].join(" ")}
                        title={
                          raidSnapUploadState === "uploading"
                            ? "업로드 중"
                            : raidSnapUploadState === "ok"
                              ? "업로드 완료"
                              : "업로드 실패"
                        }
                      >
                        {raidSnapUploadState === "uploading" && "업로드중…"}
                        {raidSnapUploadState === "ok" && "완료"}
                        {raidSnapUploadState === "error" && "실패"}
                      </span>
                    )}

                    {lastRaidSnapUploadedAt && (
                      <span className="friendAutoLast">
                        마지막: {new Date(lastRaidSnapUploadedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                )}

                {SERVER_MODE ? (
                  <>
                    <div className="friendRow">
                      <button
                        className="mini"
                        onClick={async () => {
                          const toCode = (prompt("친구 코드(FC_...) 입력") ?? "").trim();
                          if (!toCode) return;

                          try {
                            await apiFetch2("/api/friend-requests?action=create", {
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
                                    await apiFetch2(`/api/friend-requests?action=accept&id=${r.id}`, { method: "POST" });
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
                                    await apiFetch2(`/api/friend-requests?action=reject&id=${r.id}`, { method: "POST" });
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

                {/* ✅ 친구 목록은 왼쪽 '친구 패널'로 이동 (오른쪽 패널은 관리 액션만) */}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ 왼쪽 친구 패널: 남은 레이드 탭 전용 (단일 관리 UI) */}
      {periodTab === "RAID_LEFT" && (
        <div className={["friendsDock", friendsDockOpen ? "open" : ""].join(" ")}>
          <div className="friendsDockHeader">
            <button className="btn mini" onClick={() => setFriendsDockOpen((v) => !v)}>
              {friendsDockOpen ? "◀ 친구 목록" : "▶ 친구 목록"}
            </button>

            {friendsDockOpen && (
              <div className="friendsDockHeaderActions">
                <button
                  className={["btn", "mini", raidLeftView === "ME" ? "active" : ""].join(" ")}
                  onClick={() => {
                    setRaidLeftView("ME");
                    setSelectedFriendCode("");
                  }}
                  title="내 남은 레이드 보기"
                >
                  나
                </button>
                <button
                  className={["btn", "mini", raidLeftView === "FRIEND" ? "active" : ""].join(" ")}
                  onClick={() => setRaidLeftView("FRIEND")}
                  title="친구 남은 레이드 보기"
                >
                  친구
                </button>
              </div>
            )}
          </div>

          {friendsDockOpen && (
            <div className="friendsDockBody">
              <div className="friendsDockHint">{SERVER_MODE ? "서버 친구(동기화됨)" : "로컬 친구(브라우저 저장)"}</div>

              {state.friends.length === 0 ? (
                <div className="todo-hint" style={{ marginTop: 8 }}>
                  친구가 없어. 오른쪽 패널에서 친구요청을 보내거나 추가해줘.
                </div>
              ) : (
                <div className="friendList friendListPanel">
                  {state.friends.map((f) => {
                    const active = f.code === selectedFriendCode;
                    return (
                      <div
                        key={f.code}
                        className={["friendItem", active ? "active" : ""].join(" ")}
                        onClick={async () => {
                          setSelectedFriendCode(f.code);
                          setRaidLeftView("FRIEND");

                          try {
                            await refreshFriendSnapshot(f.code);
                          } catch (e) {
                            console.error("친구 스냅샷 동기화 실패", e);
                          }

                          refreshFriendRaidPlan(f.code).catch((e) => {
                            console.error("친구 레이드 계획 동기화 실패", e);
                          });

                          refreshWeeklySchedules().catch((e) => {
                            console.error("일정표 동기화 실패", e);
                          });
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="friendItemMain">
                          <div className="friendItemName">{f.nickname || f.code}</div>
                          <div className="friendItemCode">{f.code}</div>
                        </div>

                        <div className="friendItemActions">
                          {SERVER_MODE && (
                            <button
                              className="mini"
                              onClick={async (e) => {
                                e.stopPropagation();

                                try {
                                  await refreshFriendSnapshot(f.code);

                                  refreshFriendRaidPlan(f.code).catch((e) => {
                                    console.error("친구 레이드 계획 불러오기 실패", e);
                                  });

                                  refreshWeeklySchedules().catch((e) => {
                                    console.error("일정표 불러오기 실패", e);
                                  });

                                  setSelectedFriendCode(f.code);
                                  setRaidLeftView("FRIEND");
                                  alert("친구 남은 레이드 불러오기 완료!");
                                } catch (e) {
                                  console.error("친구 스냅샷 불러오기 실패", e);
                                  const msg = String((e as any)?.message ?? e ?? "");
                                  if (msg.includes("403")) {
                                    alert("불러오기 실패(서버 기준 친구 관계가 아니거나 상대가 비공개야)");
                                  } else if (msg.includes("404")) {
                                    alert("불러오기 실패(친구가 아직 스냅샷 업로드를 안 했어)");
                                  } else {
                                    alert("불러오기 실패(비공개이거나 친구가 아직 스냅샷 업로드를 안 했을 수 있어)");
                                  }
                                }
                              }}
                              title="서버에서 최신 남은 레이드 스냅샷 불러오기"
                            >
                              불러오기
                            </button>
                          )}

                          <button
                            className="mini danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFriend(f.code);
                            }}
                            title={SERVER_MODE ? "서버에서도 친구가 삭제됨" : "로컬 친구 목록에서만 삭제됨"}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
          <div className="raidLeftToolbar">
            <select
              className="friendSelect"
              value={raidLeftView}
              onChange={(e) => setRaidLeftView(e.target.value as any)}
            >
              <option value="ME">내 남은 레이드</option>
              <option value="FRIEND">친구 남은 레이드</option>
            </select>
          </div>
        )}

        <div className="todo-progress">
          진행률(체크/카운터): <b>{totalProgress.done}</b> / {totalProgress.all}
        </div>
      </div>

      {todayMustDoOpen && (
        <div className="todayMustDoPanel">
          <div className="todayMustDoHeader">
            <div>
              <div className="todayMustDoTitle">오늘 해야할 일</div>
              <div className="todayMustDoSub">
                전체 표 기준으로 오늘 놓치면 아까운 항목만 모아서 보여줘
              </div>
            </div>

            <button className="btn" onClick={() => setTodayMustDoOpen(false)}>
              닫기
            </button>
          </div>

          <div className="todayMustDoSettings">
            <label className="todayMustDoCheck">
              <input
                type="checkbox"
                checked={todayMustDoSettings.coreDaily1730}
                onChange={(e) =>
                  setTodayMustDoSettings((prev) => ({ ...prev, coreDaily1730: e.target.checked }))
                }
              />
              <span>1730+ 핵심 일일 체크 안 된 캐릭 출력</span>
            </label>

            <label className="todayMustDoCheck">
              <input
                type="checkbox"
                checked={todayMustDoSettings.guardian1730}
                onChange={(e) =>
                  setTodayMustDoSettings((prev) => ({ ...prev, guardian1730: e.target.checked }))
                }
              />
              <span>1730+ 가디언 토벌 체크 안 된 캐릭 출력</span>
            </label>

            <label className="todayMustDoCheck">
              <input
                type="checkbox"
                checked={todayMustDoSettings.accountContent}
                onChange={(e) =>
                  setTodayMustDoSettings((prev) => ({ ...prev, accountContent: e.target.checked }))
                }
              />
              <span>카게/필보 체크 안 된 표 출력</span>
            </label>

            <label className="todayMustDoCheck">
              <input
                type="checkbox"
                checked={todayMustDoSettings.restFull}
                onChange={(e) =>
                  setTodayMustDoSettings((prev) => ({ ...prev, restFull: e.target.checked }))
                }
              />
              <span>휴식게이지 풀인데 미체크인 캐릭 출력</span>
            </label>

            <label className="todayMustDoCheck">
              <input
                type="checkbox"
                checked={todayMustDoSettings.azenaDaily}
                onChange={(e) =>
                  setTodayMustDoSettings((prev) => ({ ...prev, azenaDaily: e.target.checked }))
                }
              />
              <span>아제나 캐릭터인데 일일 숙제 안 한 캐릭 출력</span>
            </label>
          </div>

          {todayMustDoItems.length === 0 ? (
            <div className="todayMustDoEmpty">오늘 꼭 해야 하는 항목이 없어!</div>
          ) : (
            <div className="todayMustDoList">
              {todayMustDoItems.map((item) => (
                <div key={item.key} className="todayMustDoItem">
                  <div className="todayMustDoItemTop">
                    <span className="todayMustDoBadge">{item.tableName}</span>
                    {item.charName ? <span className="todayMustDoChar">{item.charName}</span> : null}
                  </div>

                  <div className="todayMustDoTaskList">
                    {item.tasks.map((task) => (
                      <div key={task.label} className="todayMustDoTaskRow">
                        <div className="todayMustDoLabel">{task.label}</div>
                        <div className="todayMustDoReason">{task.reasons.join(", ")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {weeklyMustDoOpen && (
        <div className="todayMustDoPanel">
          <div className="todayMustDoHeader">
            <div>
              <div className="todayMustDoTitle">주간 해야할 일</div>
              <div className="todayMustDoSub">
                전체 표 기준 주간 체크 안 된 항목
              </div>
            </div>

            <button className="btn" onClick={() => setWeeklyMustDoOpen(false)}>
              닫기
            </button>
          </div>

          <div className="todayMustDoSettings">
            <label className="todayMustDoCheck">
              <input
                type="checkbox"
                checked={weeklyMustDoSettings.sandglass}
                onChange={(e) =>
                  setWeeklyMustDoSettings((prev) => ({ ...prev, sandglass: e.target.checked }))
                }
              />
              <span>할의 모래시계 체크 안 된 캐릭 출력</span>
            </label>

            <label className="todayMustDoCheck">
              <input
                type="checkbox"
                checked={weeklyMustDoSettings.sky}
                onChange={(e) =>
                  setWeeklyMustDoSettings((prev) => ({ ...prev, sky: e.target.checked }))
                }
              />
              <span>천상 체크 안 된 캐릭 출력</span>
            </label>

            <label className="todayMustDoCheck">
              <input
                type="checkbox"
                checked={weeklyMustDoSettings.bloodstone}
                onChange={(e) =>
                  setWeeklyMustDoSettings((prev) => ({ ...prev, bloodstone: e.target.checked }))
                }
              />
              <span>혈석 교환 체크 안 된 캐릭 출력</span>
            </label>

            <label className="todayMustDoCheck">
              <input
                type="checkbox"
                checked={weeklyMustDoSettings.clearMedal}
                onChange={(e) =>
                  setWeeklyMustDoSettings((prev) => ({ ...prev, clearMedal: e.target.checked }))
                }
              />
              <span>클리어메달 교환 체크 안 된 캐릭 출력</span>
            </label>
          </div>

          {weeklyMustDoItems.length === 0 ? (
            <div className="todayMustDoEmpty">주간 해야할 일이 없어!</div>
          ) : (
            <div className="todayMustDoList">
              {weeklyMustDoItems.map((item) => (
                <div key={item.key} className="todayMustDoItem">
                  <div className="todayMustDoItemTop">
                    <span className="todayMustDoBadge">{item.tableName}</span>
                    <span className="todayMustDoChar">{item.charName}</span>
                  </div>

                  <div className="todayMustDoTaskList">
                    {item.tasks.map((task) => (
                      <div key={task.label} className="todayMustDoTaskRow">
                        <div className="todayMustDoLabel">{task.label}</div>
                        <div className="todayMustDoReason">{task.reasons.join(", ")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="todo-table-area">
        {/* 두 표 동시 렌더 */}
        {periodTab === "RAID_LEFT" ? (
          raidLeftView === "FRIEND" ? (
            <div className="tablePane" style={{ height: "100%", minHeight: 0 }}>
              <div style={{ padding: 12 }}>{renderFriendRaidLeftColumns()}</div>
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
            {RAID_REWARD_INFO[raidGoldPopup.title]?.medal !== undefined && (
              <div>클리어메달: {RAID_REWARD_INFO[raidGoldPopup.title].medal!.toLocaleString()}</div>
            )}

            {RAID_REWARD_INFO[raidGoldPopup.title]?.normal !== undefined && (
              <div>
                노말: 유통 {RAID_REWARD_INFO[raidGoldPopup.title].normal!.tradable.toLocaleString()} / 귀속 {RAID_REWARD_INFO[raidGoldPopup.title].normal!.bound.toLocaleString()} / 합계 {getSplitTotal(RAID_REWARD_INFO[raidGoldPopup.title].normal).toLocaleString()} G
              </div>
            )}
            {RAID_REWARD_INFO[raidGoldPopup.title]?.hard !== undefined && (
              <div>
                하드: 유통 {RAID_REWARD_INFO[raidGoldPopup.title].hard!.tradable.toLocaleString()} / 귀속 {RAID_REWARD_INFO[raidGoldPopup.title].hard!.bound.toLocaleString()} / 합계 {getSplitTotal(RAID_REWARD_INFO[raidGoldPopup.title].hard).toLocaleString()} G
              </div>
            )}
            {RAID_REWARD_INFO[raidGoldPopup.title]?.nightmare !== undefined && (
              <div>
                나이트메어: 유통 {RAID_REWARD_INFO[raidGoldPopup.title].nightmare!.tradable.toLocaleString()} / 귀속 {RAID_REWARD_INFO[raidGoldPopup.title].nightmare!.bound.toLocaleString()} / 합계 {getSplitTotal(RAID_REWARD_INFO[raidGoldPopup.title].nightmare).toLocaleString()} G
              </div>
            )}

            {RAID_REWARD_INFO[raidGoldPopup.title]?.stage1 !== undefined && (
              <div>
                1단계: 유통 {RAID_REWARD_INFO[raidGoldPopup.title].stage1!.tradable.toLocaleString()} / 귀속 {RAID_REWARD_INFO[raidGoldPopup.title].stage1!.bound.toLocaleString()} / 합계 {getSplitTotal(RAID_REWARD_INFO[raidGoldPopup.title].stage1).toLocaleString()} G
              </div>
            )}
            {RAID_REWARD_INFO[raidGoldPopup.title]?.stage2 !== undefined && (
              <div>
                2단계: 유통 {RAID_REWARD_INFO[raidGoldPopup.title].stage2!.tradable.toLocaleString()} / 귀속 {RAID_REWARD_INFO[raidGoldPopup.title].stage2!.bound.toLocaleString()} / 합계 {getSplitTotal(RAID_REWARD_INFO[raidGoldPopup.title].stage2).toLocaleString()} G
              </div>
            )}
            {RAID_REWARD_INFO[raidGoldPopup.title]?.stage3 !== undefined && (
              <div>
                3단계: 유통 {RAID_REWARD_INFO[raidGoldPopup.title].stage3!.tradable.toLocaleString()} / 귀속 {RAID_REWARD_INFO[raidGoldPopup.title].stage3!.bound.toLocaleString()} / 합계 {getSplitTotal(RAID_REWARD_INFO[raidGoldPopup.title].stage3).toLocaleString()} G
              </div>
            )}
          </div>
        </div>
      )}
      {(() => {
        const popup = weeklyTop3Popup;

        if (popup === null) {
          return null;
        }

        const tableId = popup.tableId;
        const charId = popup.charId;
        const popupIlvl = popup.ilvl;
        const popupX = popup.x;
        const popupY = popup.y;
        const popupCharName = popup.charName;

        const charKey = weeklyCharKey(tableId, charId);
        const picked = sanitizeWeeklyRaidPick(
          popupIlvl,
          weeklyRaidPickByChar[charKey] ?? getDefaultWeeklyRaidPick(popupIlvl)
        );
        const pickedResult = calcWeeklySelectedGold(popupIlvl, picked);
        const popupRaidDefs = RAID_CATALOG.filter((raid) => availableDiffNames(popupIlvl, raid.name).length > 0);
        const popupVisibleRaidDefs = popupRaidDefs.filter((raid) =>
          weeklyPopupRaidTab === "legacy"
            ? LEGACY_POPUP_RAID_NAMES.has(raid.name)
            : !LEGACY_POPUP_RAID_NAMES.has(raid.name)
        );

        function toggleRaid(raidName: string) {
          if (availableDiffNames(popupIlvl, raidName).length === 0) return;

          setWeeklyRaidPickByChar((prev) => {
            const cur = sanitizeWeeklyRaidPick(
              popupIlvl,
              prev[charKey] ?? getDefaultWeeklyRaidPick(popupIlvl)
            );
            const exists = cur.raids.some((name) => normalizeRaidName(name) === normalizeRaidName(raidName));

            const nextRaids = exists
              ? cur.raids.filter((name) => normalizeRaidName(name) !== normalizeRaidName(raidName))
              : [...cur.raids, canonicalRaidName(raidName)];

            const nextChar = sanitizeWeeklyRaidPick(popupIlvl, {
              raids: nextRaids,
              goldRaids: cur.goldRaids ?? [],
              diffs: cur.diffs ?? {},
            });

            saveWeeklyRaidPick(tableId, charId, nextChar);
            return { ...prev, [charKey]: nextChar };
          });
        }

        function toggleGoldRaid(raidName: string) {
          const cur = sanitizeWeeklyRaidPick(
            popupIlvl,
            weeklyRaidPickByChar[charKey] ?? getDefaultWeeklyRaidPick(popupIlvl)
          );

          const normalizedRaidName = canonicalRaidName(raidName);
          const isExtremeRaid = DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(normalizedRaidName); // 4/24 익스트림은 Top3 제한 제외

          const currentGoldRaids = (cur.goldRaids ?? []).filter((name) => cur.raids.includes(name));
          const currentNormalGoldRaids = currentGoldRaids.filter(
            (name) => !DEFAULT_EXTREME_WEEKLY_RAID_TITLES.has(canonicalRaidName(name))
          );

          const exists = currentGoldRaids.some(
            (name) => normalizeRaidName(name) === normalizeRaidName(raidName)
          );

          if (!exists && !isExtremeRaid && currentNormalGoldRaids.length >= 3) {
            alert("골드 체크는 최대 3개까지 가능해요!");
            return;
          }

          setWeeklyRaidPickByChar((prev) => {
            const latest = sanitizeWeeklyRaidPick(
              popupIlvl,
              prev[charKey] ?? getDefaultWeeklyRaidPick(popupIlvl)
            );

            const latestGoldRaids = (latest.goldRaids ?? []).filter((name) => latest.raids.includes(name));
            const latestExists = latestGoldRaids.some(
              (name) => normalizeRaidName(name) === normalizeRaidName(raidName)
            );

            const nextGoldRaids = latestExists
              ? latestGoldRaids.filter((name) => normalizeRaidName(name) !== normalizeRaidName(raidName))
              : [...latestGoldRaids, normalizedRaidName];

            const nextChar = sanitizeWeeklyRaidPick(popupIlvl, {
              raids: latest.raids,
              goldRaids: nextGoldRaids,
              diffs: latest.diffs ?? {},
            });

            saveWeeklyRaidPick(tableId, charId, nextChar);
            return { ...prev, [charKey]: nextChar };
          });
        }

        function setPick(raidName: string, diff: DiffName) {
          setWeeklyRaidPickByChar((prev) => {
            const cur = sanitizeWeeklyRaidPick(
              popupIlvl,
              prev[charKey] ?? getDefaultWeeklyRaidPick(popupIlvl)
            );
            const nextChar = sanitizeWeeklyRaidPick(popupIlvl, {
              raids: cur.raids,
              goldRaids: cur.goldRaids ?? [],
              diffs: { ...(cur.diffs ?? {}), [canonicalRaidName(raidName)]: diff },
            });

            saveWeeklyRaidPick(tableId, charId, nextChar);
            return { ...prev, [charKey]: nextChar };
          });
        }

        return (
          <div className="weekly-top3-pop" style={{ left: popupX + 12, top: popupY + 12 }}>
            <div className="weekly-top3-head">
              <b>{popupCharName} · 선택 레이드 골드</b>
              <button onClick={() => setWeeklyTop3Popup(null)}>닫기</button>
            </div>

            <div className="weekly-top3-sum">
              합계: <b>{pickedResult.sum.toLocaleString()} G</b>
              <div className="weekly-top3-sum-sub">
                유통 {pickedResult.rows.filter((x) => x.checked).reduce((acc, cur) => acc + cur.tradable, 0).toLocaleString()}
                {" / "}
                귀속 {pickedResult.rows.filter((x) => x.checked).reduce((acc, cur) => acc + cur.bound, 0).toLocaleString()}
                {" / "}
                {includeBoundGold ? "현재 표시 = 유통+귀속" : "현재 표시 = 유통만"}
              </div>
            </div>

            <div className="weekly-top3-tabs">
              <button
                type="button"
                className={`weekly-top3-tab ${weeklyPopupRaidTab === "current" ? "active" : ""}`}
                onClick={() => setWeeklyPopupRaidTab("current")}
              >
                현재 라인
              </button>
              <button
                type="button"
                className={`weekly-top3-tab ${weeklyPopupRaidTab === "legacy" ? "active" : ""}`}
                onClick={() => setWeeklyPopupRaidTab("legacy")}
              >
                이전 라인
              </button>
            </div>

            <div className="weekly-top3-pick-list">
              {popupVisibleRaidDefs.map((raid) => {
                  const active = picked.raids.some((name) => normalizeRaidName(name) === normalizeRaidName(raid.name));

                  return (
                    <button
                      key={raid.name}
                      type="button"
                      className={`raid-pick-btn ${active ? "active" : ""}`}
                      onClick={() => toggleRaid(raid.name)}
                    >
                      {raid.name}
                    </button>
                  );
                })}
            </div>

            <div className="weekly-top3-body">
              {pickedResult.rows.map((row: {
                raid: string;
                diff: DiffName;
                gold: number;
                tradable: number;
                bound: number;
                total: number;
                checked: boolean;
                avail: DiffName[];
              }) => (
                <div key={row.raid} className="weekly-top3-row">
                  <div className="weekly-top3-raid">
                    <label className="raid-row-check">
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={() => toggleGoldRaid(row.raid)}
                      />
                      <span>{row.raid}</span>
                    </label>
                  </div>

                  <div className="weekly-top3-diffs">
                    {row.avail.map((d: DiffName) => {
                      const diffActive = row.diff === d;

                      return (
                        <button
                          key={d}
                          type="button"
                          className={`diff-btn ${diffActive ? "active" : ""}`}
                          onClick={() => setPick(row.raid, d)}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>

                  <div className="weekly-top3-gold-actions">
                    <div className="weekly-top3-gold">
                      {row.gold.toLocaleString()} G
                    </div>
                    <div className="weekly-top3-gold-sub">
                      유통 {row.tradable.toLocaleString()} / 귀속 {row.bound.toLocaleString()}
                    </div>

                    {shouldUsePopupWeeklyRaidCheckByRaid(row.raid) && (
                      <label className="weekly-top3-task-check" title="주간 레이드 완료 체크">
                        <input
                          type="checkbox"
                          checked={(() => {
                            const taskId = weeklyRaidTaskIdByTitle.get(normalizeRaidName(row.raid ?? ""));
                            if (!taskId) return false;

                            const cell = getCellByTableId(state, tableId, taskId, charId);
                            return cell?.type === "CHECK" ? cell.checked : false;
                          })()}
                          onChange={() => toggleWeeklyRaidTaskCheckByRaidName(tableId, charId, row.raid)}
                        />
                        <span>완료</span>
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </>
  );
}
