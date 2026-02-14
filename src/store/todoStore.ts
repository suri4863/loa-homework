export type Period = "DAILY" | "WEEKLY" | "NONE";
export type CellType = "CHECK" | "COUNTER" | "TEXT" | "SELECT";

export const LEVEL_PERIODS: Record<Period, string> = {
  DAILY: "일일",
  WEEKLY: "주간",
  NONE: "기타",
};

export type Character = {
  id: string;
  name: string;
  itemLevel?: string;
  power?: string;

  // (확장 필드) 아제나 만료 자동해제용
  azenaEnabled?: boolean;
  azenaExpiresAt?: string | null;
};

export type TaskRow = {
  id: string;
  title: string;
  period: Period;
  cellType: CellType;
  max?: number;
  options?: string[];
  section?: string;
  order?: number;
};

export type CellValue =
  | { type: "CHECK"; checked: boolean; updatedAt: number }
  | { type: "COUNTER"; count: number; updatedAt: number }
  | { type: "TEXT"; text: string; updatedAt: number }
  | { type: "SELECT"; value: string; updatedAt: number };

export type GridValues = Record<string /* taskId */, Record<string /* charId */, CellValue>>;

export type ResetState = {
  lastDailyResetAt: number;
  lastWeeklyResetAt: number;
  dailyResetHour: number;     // 6
  weeklyResetWeekday: number; // 3(수), 0=일
};

export type RestGauge = {
  chaos: number;    // 0~200
  guardian: number; // 0~100
};

export type RestGauges = Record<string /* charId */, RestGauge>;

export type TodoTable = {
  id: string;
  name: string;
  characters: Character[];
  values: GridValues;
  restGauges: RestGauges;
};

export type TodoState = {
  tables: TodoTable[];
  activeTableId: string;
  tasks: TaskRow[];
  reset: ResetState;
};

const STORAGE_KEY = "loa-todo:v1";

/** id */
function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function createCharacter(input: { name: string; itemLevel?: string; power?: string }): Character {
  return { id: uid("ch"), name: input.name, itemLevel: input.itemLevel ?? "", power: input.power ?? "" };
}

export function createTask(input: {
  id?: string; // ✅ 고정 id 허용
  title: string;
  period: Period;
  cellType: CellType;
  max?: number;
  options?: string[];
  section?: string;
  order?: number;           // ✅ 추가
}): TaskRow {
  return {
    id: input.id ?? uid("task"),
    title: input.title,
    period: input.period,
    cellType: input.cellType,
    max: input.max,
    options: input.options,
    section: input.section ?? "숙제",
    order: input.order ?? Date.now(),   // ✅ 변경
  };
}


function makeDefaultState(): TodoState {
  // =========================
  // 캐릭터 기본값
  // =========================
  const characters: Character[] = [
    createCharacter({ name: "캐릭1", itemLevel: "1710", power: "2500+" }),
    createCharacter({ name: "캐릭2", itemLevel: "1710", power: "2500+" }),
    createCharacter({ name: "캐릭3", itemLevel: "1770", power: "6000+" }),
    createCharacter({ name: "캐릭4", itemLevel: "1710", power: "2500+" }),
    createCharacter({ name: "캐릭5", itemLevel: "1710", power: "2500+" }),
    createCharacter({ name: "캐릭6", itemLevel: "1710", power: "2500+" }),
  ];

  // =========================
  // 숙제 기본값
  // =========================
  const baseOrder = Date.now();

  const tasks: TaskRow[] = [
    // ✅ 일일 숙제 (order 명시)
    {
      ...createTask({
        title: "길드 출석",
        period: "DAILY",
        cellType: "CHECK",
        section: "일일 숙제",
      }),
      order: baseOrder + 1,
    },

    {
      ...createTask({
        id: "MAIN_DAILY",
        title: "쿠르잔 전선",
        period: "DAILY",
        cellType: "COUNTER",
        max: 1,
        section: "일일 숙제",
      }),
      order: baseOrder + 2,
    },

    {
      ...createTask({
        title: "가디언 토벌",
        period: "DAILY",
        cellType: "COUNTER",
        max: 1,
        section: "일일 숙제",
      }),
      order: baseOrder + 3,
    },

    // 주간
    createTask({ title: "천상", period: "WEEKLY", cellType: "CHECK", section: "주간 교환" }),
    createTask({ title: "혈석 교환", period: "WEEKLY", cellType: "CHECK", section: "주간 교환" }),
    createTask({ title: "클리어메달 교환", period: "WEEKLY", cellType: "CHECK", section: "주간 교환" }),
    createTask({ title: "해적주화 교환", period: "WEEKLY", cellType: "CHECK", section: "주간 교환" }),

    createTask({ title: "1막", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),
    createTask({ title: "2막", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),
    createTask({ title: "3막", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),
    createTask({ title: "4막", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),
    createTask({ title: "종막", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),
    createTask({ title: "세르카", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),


    // 기타(귀속 메모)
    createTask({
      title: "큐브",
      period: "NONE",
      cellType: "TEXT",
      section: "기타",
    }),
  ];

  // =========================
  // 리셋 설정
  // =========================
  const reset: ResetState = {
    lastDailyResetAt: 0,
    lastWeeklyResetAt: 0,
    dailyResetHour: 6,
    weeklyResetWeekday: 3,
  };

  // =========================
  // 휴식게이지 초기값
  // chaos = 핵심 콘텐츠 휴식
  // =========================
  const restGauges: RestGauges = Object.fromEntries(
    characters.map((c) => [c.id, { chaos: 0, guardian: 0 }])
  );

  const table: TodoTable = {
    id: uid("tbl"),
    name: "표1",
    characters,
    values: {},
    restGauges,
  };

  return {
    tables: [table],
    activeTableId: table.id,
    tasks,
    reset,
  };
}

function normalizeState(parsed: any): TodoState {
  // ✅ 새 구조면 보정만
  if (Array.isArray(parsed?.tables) && typeof parsed?.activeTableId === "string") {
    const st: TodoState = parsed as TodoState;

    st.reset = st.reset ?? { lastDailyResetAt: 0, lastWeeklyResetAt: 0, dailyResetHour: 6, weeklyResetWeekday: 3 };
    st.reset.dailyResetHour = st.reset.dailyResetHour ?? 6;
    st.reset.weeklyResetWeekday = st.reset.weeklyResetWeekday ?? 3;
    st.reset.lastDailyResetAt = st.reset.lastDailyResetAt ?? 0;
    st.reset.lastWeeklyResetAt = st.reset.lastWeeklyResetAt ?? 0;

    st.tasks = Array.isArray(st.tasks) ? st.tasks : [];

    // ✅ (마이그레이션) '기타 / 큐브(귀속 메모)' 없으면 자동 추가
    // ✅ (마이그레이션) '기타 / 큐브(귀속 메모)' 없으면 자동 추가
    const hasCube = st.tasks.some((t) => t.title === "큐브" && t.period === "NONE");
    if (!hasCube) {
      st.tasks = [
        ...st.tasks,
        createTask({
          title: "큐브",
          period: "NONE",
          cellType: "TEXT",
          section: "기타",
        }),
      ];
    }

    // ✅ (마이그레이션) '주간 레이드 / 1막' 없으면 자동 추가  ← 반드시 밖!
    const hasRaid1 = st.tasks.some(
      (t) => t.title === "1막" && t.period === "WEEKLY" && t.section === "주간 레이드"
    );
    if (!hasRaid1) {
      st.tasks = [
        ...st.tasks,
        createTask({ title: "1막", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드", order: 1 })
      ];
    }


    if (!st.tables.length) return makeDefaultState();
    if (!st.activeTableId || !st.tables.some((t) => t.id === st.activeTableId)) st.activeTableId = st.tables[0].id;

    st.tables = st.tables.map((t) => {
      const chars = Array.isArray(t.characters) ? t.characters : [];
      const values = t.values ?? {};
      const rg: RestGauges = { ...(t.restGauges ?? {}) };

      for (const ch of chars) {
        const cur = rg[ch.id];
        if (!cur) rg[ch.id] = { chaos: 0, guardian: 0 };
        else {
          rg[ch.id] = {
            chaos: clamp(Number(cur.chaos ?? 0), 0, 200),
            guardian: clamp(Number(cur.guardian ?? 0), 0, 100),
          };
        }
      }

      return { ...t, name: t.name ?? "표", characters: chars, values, restGauges: rg };
    });

    return st;
  }

  // ✅ 구 구조(단일표) -> 새 구조로 마이그레이션
  const legacyCharacters = Array.isArray(parsed?.characters) ? parsed.characters : [];
  const legacyValues = parsed?.values ?? {};
  const legacyRestGauges = parsed?.restGauges ?? {};

  const tableId = uid("tbl");
  const migrated: TodoState = {
    tables: [
      {
        id: tableId,
        name: "표1",
        characters: legacyCharacters,
        values: legacyValues,
        restGauges: legacyRestGauges,
      },
    ],
    activeTableId: tableId,
    tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
    reset: parsed?.reset ?? { lastDailyResetAt: 0, lastWeeklyResetAt: 0, dailyResetHour: 6, weeklyResetWeekday: 3 },
  };

  migrated.reset.dailyResetHour = migrated.reset.dailyResetHour ?? 6;
  const legacyWeekday =
    typeof parsed?.reset?.weeklyResetday === "number" ? parsed.reset.weeklyResetday : undefined; // 옛 오타 대비
  migrated.reset.weeklyResetWeekday = legacyWeekday ?? migrated.reset.weeklyResetWeekday ?? 3;
  migrated.reset.lastDailyResetAt = migrated.reset.lastDailyResetAt ?? 0;
  migrated.reset.lastWeeklyResetAt = migrated.reset.lastWeeklyResetAt ?? 0;

  const rg: RestGauges = { ...(migrated.tables[0].restGauges ?? {}) };
  for (const ch of migrated.tables[0].characters) {
    const cur = rg[ch.id];
    if (!cur) rg[ch.id] = { chaos: 0, guardian: 0 };
    else {
      rg[ch.id] = {
        chaos: clamp(Number(cur.chaos ?? 0), 0, 200),
        guardian: clamp(Number(cur.guardian ?? 0), 0, 100),
      };
    }
  }
  migrated.tables[0].restGauges = rg;

  if (!migrated.tasks.length) migrated.tasks = makeDefaultState().tasks;

  return migrated;
}

export const DEFAULT_TODO_STATE = {
  make: makeDefaultState,
  load: (): TodoState | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const normalized = normalizeState(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch {
      return null;
    }
  },
  save: (state: TodoState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  },
};

// =========================
// ✅ Table helpers (추가)
// =========================
export function getActiveTable(state: TodoState): TodoTable {
  const tables = state?.tables ?? [];
  if (!tables.length) return { id: uid("tbl"), name: "표1", characters: [], values: {}, restGauges: {} };
  return tables.find((t) => t.id === state.activeTableId) ?? tables[0];
}

export function getTableById(state: TodoState, tableId: string): TodoTable {
  const tables = state?.tables ?? [];
  if (!tables.length) return { id: uid("tbl"), name: "표1", characters: [], values: {}, restGauges: {} };
  return tables.find((t) => t.id === tableId) ?? tables[0];
}

/** (호환) activeTable 기준 */
export function getCell(state: TodoState, taskId: string, charId: string): CellValue | null {
  const table = getActiveTable(state);
  return table.values?.[taskId]?.[charId] ?? null;
}

/** ✅ tableId 기준 */
export function getCellByTableId(state: TodoState, tableId: string, taskId: string, charId: string): CellValue | null {
  const table = getTableById(state, tableId);
  return table.values?.[taskId]?.[charId] ?? null;
}

/** (호환) activeTable 기준 */
export function setCell(state: TodoState, task: TaskRow, ch: Character, value: CellValue): TodoState {
  const table = getActiveTable(state);

  const values: GridValues = { ...(table.values ?? {}) };
  const row = { ...(values[task.id] ?? {}) };
  row[ch.id] = value;
  values[task.id] = row;

  const nextTable: TodoTable = { ...table, values };
  return { ...state, tables: state.tables.map((t) => (t.id === nextTable.id ? nextTable : t)) };
}

/** ✅ tableId 기준 */
export function setCellByTableId(state: TodoState, tableId: string, task: TaskRow, ch: Character, value: CellValue): TodoState {
  const table = getTableById(state, tableId);

  const values: GridValues = { ...(table.values ?? {}) };
  const row = { ...(values[task.id] ?? {}) };
  row[ch.id] = value;
  values[task.id] = row;

  const nextTable: TodoTable = { ...table, values };
  return { ...state, tables: state.tables.map((t) => (t.id === nextTable.id ? nextTable : t)) };
}

function sanitizeJsonText(raw: string): string {
  return raw
    .replace(/\u2026/g, "...")          // …(한 글자) -> ... 통일
    .replace(/\.\.\./g, "")            // 화면 생략(...) 제거
    .replace(/,\s*([}\]])/g, "$1")     // trailing comma 제거
    .trim();
}

export function importStateFromJson(raw: string): TodoState {
  const cleaned = sanitizeJsonText(raw);

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Invalid JSON");
  }

  // ✅ v2 백업 포맷: { version, exportedAt, state }
  const payload = parsed?.state ?? parsed;

  // ✅ normalizeState가 TodoState로 보정/마이그레이션 수행
  return normalizeState(payload);
}

export function exportStateToJson(state: TodoState): string {
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), state },
    null,
    2
  );
}

/** Reset anchor 계산 */
function getDailyResetAnchor(now: Date, dailyHour: number): Date {
  const d = new Date(now);
  d.setHours(dailyHour, 0, 0, 0);
  if (now.getTime() < d.getTime()) d.setDate(d.getDate() - 1);
  return d;
}

function getWeeklyResetAnchor(now: Date, weekday: number, hour: number): Date {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  const currentDow = d.getDay();
  const diff = currentDow - weekday;
  d.setDate(d.getDate() - diff);
  if (now.getTime() < d.getTime()) d.setDate(d.getDate() - 7);
  return d;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * ✅ 일일 리셋 시점(리셋 직전 상태) 수행량 기반 휴식게이지 갱신
 */
function applyDailyRestUpdate(prev: TodoState): TodoState {
  const coreTask = prev.tasks.find((t) => t.period === "DAILY" && t.id === "MAIN_DAILY");
  const guardianTask = prev.tasks.find((t) => t.period === "DAILY" && t.title === "가디언 토벌");

  const tables = prev.tables.map((tbl) => {
    const restGauges: RestGauges = { ...(tbl.restGauges ?? {}) };

    for (const ch of tbl.characters) {
      const current = restGauges[ch.id] ?? { chaos: 0, guardian: 0 };

      // ===== 핵심 콘텐츠 (0~1) =====
      let coreCount = 0;
      if (coreTask) {
        const cell = tbl.values?.[coreTask.id]?.[ch.id];
        coreCount = cell?.type === "COUNTER" ? Number(cell.count ?? 0) : 0;
      }
      coreCount = clamp(coreCount, 0, 1);

      const curChaos = clamp(Number(current.chaos ?? 0), 0, 200);
      let nextChaos = curChaos;

      if (coreCount === 0) {
        nextChaos = clamp(curChaos + 20, 0, 200);
      } else {
        // ✅ 임계값 40 이상일 때만 -40
        nextChaos = clamp(curChaos - (curChaos >= 40 ? 40 : 0), 0, 200);
      }

      // ===== 가디언 (0~1) =====
      let guardianCount = 0;
      if (guardianTask) {
        const cell = tbl.values?.[guardianTask.id]?.[ch.id];
        guardianCount = cell?.type === "COUNTER" ? Number(cell.count ?? 0) : 0;
      }
      guardianCount = clamp(guardianCount, 0, 1);

      const curGuardian = clamp(Number(current.guardian ?? 0), 0, 100);
      let nextGuardian = curGuardian;

      if (guardianCount === 0) {
        nextGuardian = clamp(curGuardian + 10, 0, 100);
      } else {
        // ✅ 임계값 20 이상일 때만 -20
        nextGuardian = clamp(curGuardian - (curGuardian >= 20 ? 20 : 0), 0, 100);
      }

      restGauges[ch.id] = { chaos: nextChaos, guardian: nextGuardian };
    }

    return { ...tbl, restGauges };
  });

  return { ...prev, tables };
}


export function resetByPeriod(state: TodoState, period: "DAILY" | "WEEKLY", hard: boolean): TodoState {
  const targetTaskIds = state.tasks.filter((t) => t.period === period).map((t) => t.id);

  const tables = state.tables.map((tbl) => {
    const values: GridValues = { ...(tbl.values ?? {}) };
    for (const taskId of targetTaskIds) {
      if (values[taskId]) values[taskId] = {};
    }
    return { ...tbl, values };
  });

  const reset = { ...state.reset };
  const now = Date.now();

  if (hard) {
    if (period === "DAILY") reset.lastDailyResetAt = now;
    if (period === "WEEKLY") reset.lastWeeklyResetAt = now;
  }

  return { ...state, tables, reset };
}

/** ✅ 버튼용: 지금 즉시 "일일 리셋 + 휴식게이지 갱신" 실행 */
export function runDailyResetNow(state: TodoState, hard: boolean): TodoState {
  let next = state;
  next = applyDailyRestUpdate(next);
  next = resetByPeriod(next, "DAILY", false);
  next = { ...next, reset: { ...next.reset, lastDailyResetAt: hard ? Date.now() : next.reset.lastDailyResetAt } };
  return next;
}

/** ✅ 자동 리셋(앱 켜고 6시가 지나면 자동 적용) */
export function applyAutoResetIfNeeded(state: TodoState): TodoState {
  const now = new Date();

  const dailyAnchor = getDailyResetAnchor(now, state.reset.dailyResetHour);
  const weeklyAnchor = getWeeklyResetAnchor(now, state.reset.weeklyResetWeekday, state.reset.dailyResetHour);

  let next = state;

  const lastDaily = next.reset.lastDailyResetAt ?? 0;

  // ⚠️ 초기 설치/첫 실행처럼 lastDailyResetAt이 없으면,
  // 과거를 “무한 누적”해버리니까 현재 앵커로 초기화만 해두는 게 안전함.
  if (lastDaily === 0) {
    next = { ...next, reset: { ...next.reset, lastDailyResetAt: dailyAnchor.getTime() } };
  } else {
    let cursor = getDailyResetAnchor(new Date(lastDaily), next.reset.dailyResetHour);

    // cursor(마지막 적용 앵커) < dailyAnchor(현재 최신 앵커) 인 동안 하루씩 반복 적용
    while (cursor.getTime() < dailyAnchor.getTime()) {
      next = applyDailyRestUpdate(next);
      next = resetByPeriod(next, "DAILY", false);

      cursor = addDays(cursor, 1);
      next = { ...next, reset: { ...next.reset, lastDailyResetAt: cursor.getTime() } };
    }
  }
  const lastWeekly = next.reset.lastWeeklyResetAt ?? 0;

  if (lastWeekly === 0) {
    next = { ...next, reset: { ...next.reset, lastWeeklyResetAt: weeklyAnchor.getTime() } };
  } else {
    let wcursor = getWeeklyResetAnchor(
      new Date(lastWeekly),
      next.reset.weeklyResetWeekday,
      next.reset.dailyResetHour
    );

    while (wcursor.getTime() < weeklyAnchor.getTime()) {
      next = resetByPeriod(next, "WEEKLY", false);
      wcursor = addDays(wcursor, 7);
      next = { ...next, reset: { ...next.reset, lastWeeklyResetAt: wcursor.getTime() } };
    }
  }

  return next;
}
