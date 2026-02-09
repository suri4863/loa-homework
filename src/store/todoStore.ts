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
  title: string;
  period: Period;
  cellType: CellType;
  max?: number;
  options?: string[];
  section?: string;
}): TaskRow {
  return {
    id: uid("task"),
    title: input.title,
    period: input.period,
    cellType: input.cellType,
    max: input.max,
    options: input.options,
    section: input.section ?? "숙제",
    order: Date.now(),
  };
}


function makeDefaultState(): TodoState {
  const characters: Character[] = [
    createCharacter({ name: "캐릭1", itemLevel: "1712.5", power: "2500+" }),
    createCharacter({ name: "캐릭2", itemLevel: "1711.67", power: "2700+" }),
    createCharacter({ name: "캐릭3", itemLevel: "1766.67", power: "5800+" }),
    createCharacter({ name: "캐릭4", itemLevel: "1711.67", power: "2900+" }),
    createCharacter({ name: "캐릭5", itemLevel: "1710", power: "2400+" }),
    createCharacter({ name: "캐릭6", itemLevel: "1710", power: "2100+" }),
  ];

  const tasks: TaskRow[] = [
    createTask({ title: "길드 출석", period: "DAILY", cellType: "CHECK", section: "일일 숙제" }),
    createTask({ title: "카오스 던전", period: "DAILY", cellType: "COUNTER", max: 1, section: "일일 숙제" }),
    createTask({ title: "가디언 토벌", period: "DAILY", cellType: "COUNTER", max: 1, section: "일일 숙제" }),

    createTask({ title: "천상", period: "WEEKLY", cellType: "CHECK", section: "주간 교환" }),
    createTask({ title: "혈석 교환", period: "WEEKLY", cellType: "CHECK", section: "주간 교환" }),
    createTask({ title: "클리어메달 교환", period: "WEEKLY", cellType: "CHECK", section: "주간 교환" }),
    createTask({ title: "해적주화 교환", period: "WEEKLY", cellType: "CHECK", section: "주간 교환" }),

    createTask({ title: "2막", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),
    createTask({ title: "3막", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),
    createTask({ title: "4막", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),
    createTask({ title: "종막", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),
    createTask({ title: "세르카", period: "WEEKLY", cellType: "CHECK", section: "주간 레이드" }),
    createTask({
  title: "큐브",
  period: "NONE",      // ✅ 리셋 안 됨
  cellType: "TEXT",    // ✅ 메모칸
  section: "기타",
}),


  ];

  const reset: ResetState = {
    lastDailyResetAt: 0,
    lastWeeklyResetAt: 0,
    dailyResetHour: 6,
    weeklyResetWeekday: 3,
  };

  const restGauges: RestGauges = Object.fromEntries(characters.map((c) => [c.id, { chaos: 0, guardian: 0 }]));

  const table: TodoTable = {
    id: uid("tbl"),
    name: "표1",
    characters,
    values: {},
    restGauges,
  };

  return { tables: [table], activeTableId: table.id, tasks, reset };
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
    // ✅ (마이그레이션) '기타/큐브' 없으면 자동 추가
    // ✅ (마이그레이션) '기타 / 큐브(귀속 메모)' 없으면 자동 추가
    const hasCube = st.tasks.some(
    (t) => t.title === "큐브" && t.period === "NONE"
  );
  if (!hasCube) {
    st.tasks = [
    ...st.tasks,
    createTask({
      title: "큐브",
      period: "NONE",     // ✅ 귀속
      cellType: "TEXT",   // ✅ 메모
      section: "기타",
    }),
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

export function getActiveTable(state: TodoState): TodoTable {
  const tables = state?.tables ?? [];
  if (!tables.length) return { id: uid("tbl"), name: "표1", characters: [], values: {}, restGauges: {} };
  return tables.find((t) => t.id === state.activeTableId) ?? tables[0];
}

export function getCell(state: TodoState, taskId: string, charId: string): CellValue | null {
  const table = getActiveTable(state);
  return table.values?.[taskId]?.[charId] ?? null;
}

export function setCell(state: TodoState, task: TaskRow, ch: Character, value: CellValue): TodoState {
  const table = getActiveTable(state);

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
    // doImport()의 catch로 잡혀서 "형식 확인" 안내가 뜸
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

/**
 * ✅ 일일 리셋 시점(리셋 직전 상태) 수행량 기반 휴식게이지 갱신
 * - 카오스(최대 2회):
 *   count=0 -> +20
 *   count=1 -> -10
 *   count=2 -> -40
 * - 가디언(최대 1회):
 *   count=0 -> +10
 *   count=1 -> -20
 */
function applyDailyRestUpdate(prev: TodoState): TodoState {
  const chaosTask = prev.tasks.find((t) => t.period === "DAILY" && t.title === "카오스 던전");
  const guardianTask = prev.tasks.find((t) => t.period === "DAILY" && t.title === "가디언 토벌");

  const chaosMax = chaosTask?.cellType === "COUNTER" ? Math.max(1, chaosTask.max ?? 2) : 2;
  const guardianMax = guardianTask?.cellType === "COUNTER" ? Math.max(1, guardianTask.max ?? 1) : 1;

  const tables = prev.tables.map((tbl) => {
    const restGauges: RestGauges = { ...(tbl.restGauges ?? {}) };

    for (const ch of tbl.characters) {
      const current = restGauges[ch.id] ?? { chaos: 0, guardian: 0 };

      let chaosCount = 0;
      if (chaosTask) {
        const cell = tbl.values?.[chaosTask.id]?.[ch.id];
        chaosCount = cell?.type === "COUNTER" ? Number(cell.count ?? 0) : 0;
      }
      chaosCount = clamp(chaosCount, 0, chaosMax);

      let guardianCount = 0;
      if (guardianTask) {
        const cell = tbl.values?.[guardianTask.id]?.[ch.id];
        guardianCount = cell?.type === "COUNTER" ? Number(cell.count ?? 0) : 0;
      }
      guardianCount = clamp(guardianCount, 0, guardianMax);

      const chaosDelta = (chaosMax - chaosCount) * 10 - chaosCount * 20;
      const guardianDelta = (guardianMax - guardianCount) * 10 - guardianCount * 20;

      restGauges[ch.id] = {
        chaos: clamp((current.chaos ?? 0) + chaosDelta, 0, 200),
        guardian: clamp((current.guardian ?? 0) + guardianDelta, 0, 100),
      };
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

  if ((next.reset.lastDailyResetAt ?? 0) < dailyAnchor.getTime()) {
    next = applyDailyRestUpdate(next);
    next = resetByPeriod(next, "DAILY", false);
    next = { ...next, reset: { ...next.reset, lastDailyResetAt: dailyAnchor.getTime() } };
  }

  if ((next.reset.lastWeeklyResetAt ?? 0) < weeklyAnchor.getTime()) {
    next = resetByPeriod(next, "WEEKLY", false);
    next = { ...next, reset: { ...next.reset, lastWeeklyResetAt: weeklyAnchor.getTime() } };
  }

  return next;
}
