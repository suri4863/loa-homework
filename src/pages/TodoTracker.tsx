import React, { useEffect, useMemo, useRef, useState } from "react";
import "./TodoTracker.css";

import type { TodoState, Character, TaskRow, TodoTable, RestGauges } from "../store/todoStore";

import {
  DEFAULT_TODO_STATE,
  LEVEL_PERIODS,
  applyAutoResetIfNeeded,
  runDailyResetNow,
  createCharacter,
  createTask,
  getCell,
  setCell,
  exportStateToJson,
  importStateFromJson,
  resetByPeriod,
  getActiveTable,
} from "../store/todoStore";

type Tab = "DAILY" | "WEEKLY" | "NONE" | "ALL";

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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(v: string) {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function formatKoreanDateTime(iso: string) {
  const d = new Date(iso);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dow}) ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function clearExpiredAzena(prev: TodoState): TodoState {
  const now = Date.now();

  // activeTable 안의 캐릭터 정보만 수정하면 됨 (너 구조는 tables에 캐릭터가 들어있음)
  const nextTables = prev.tables.map((tbl) => {
    const nextChars = tbl.characters.map((c) => {
      const enabled = Boolean((c as any).azenaEnabled);
      const expiresAt = (c as any).azenaExpiresAt as string | null | undefined;
      if (!enabled || !expiresAt) return c;

      const t = new Date(expiresAt).getTime();
      if (Number.isFinite(t) && t <= now) {
        return { ...(c as any), azenaEnabled: false, azenaExpiresAt: null };
      }
      return c;
    });

    // 변경 없으면 원본 유지
    const changed =
      nextChars.length !== tbl.characters.length ||
      nextChars.some((c, i) => c !== tbl.characters[i]);

    return changed ? ({ ...tbl, characters: nextChars } as TodoTable) : tbl;
  });

  // 변경 없으면 prev 그대로
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

   // ✅ 여기! state 훅 다음 줄에 선언
  const [dragCharId, setDragCharId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  const [periodTab, setPeriodTab] = useState<Tab>("ALL");
  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  type AzenaModalState = { open: boolean; charId: string | null; value: string };
  const [azenaModal, setAzenaModal] = useState<AzenaModalState>({
    open: false,
    charId: null,
    value: "",
  });

  function onToggleAzena(charId: string, checked: boolean) {
    if (!checked) {
      // 수동 해제
      setState((prev) => {
        const cleared = clearExpiredAzena(prev);
        const table = getActiveTable(cleared);

        const nextChars = table.characters.map((c) =>
          c.id === charId ? ({ ...(c as any), azenaEnabled: false, azenaExpiresAt: null } as any) : c
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
      charId,
      value: toDatetimeLocalValue(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)),
    });
  }

  function confirmAzena() {
    const iso = fromDatetimeLocalValue(azenaModal.value);
    if (!iso || !azenaModal.charId) {
      setAzenaModal({ open: false, charId: null, value: "" });
      return;
    }

    setState((prev) => {
      const cleared = clearExpiredAzena(prev);
      const table = getActiveTable(cleared);

      const nextChars = table.characters.map((c) =>
        c.id === azenaModal.charId
          ? ({ ...(c as any), azenaEnabled: true, azenaExpiresAt: iso } as any)
          : c
      );

      const nextTable: TodoTable = { ...table, characters: nextChars };
      return {
        ...cleared,
        tables: cleared.tables.map((t) => (t.id === nextTable.id ? nextTable : t)),
      };
    });

    setAzenaModal({ open: false, charId: null, value: "" });
  }

  function cancelAzena() {
    setAzenaModal({ open: false, charId: null, value: "" });
  }
  // ✅ 아제나 만료: 앱 켜져있을 때 정확히 그 시각에 자동 해제 + 포커스 복귀 보정
  useEffect(() => {
    // 즉시 한 번 정리
    setState((prev) => clearExpiredAzena(prev));

    const next = getNextAzenaExpiryMs(state);
    if (!next) return;

    const id = window.setTimeout(() => {
      setState((prev) => clearExpiredAzena(prev));
    }, next - Date.now());

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

  function reorderCharacters(fromId: string, toId: string) {
    if (fromId === toId) return;

    setState((prev) => {
      const table = getActiveTable(prev);
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

  // ✅ wheel passive 경고 제거: COUNTER 셀에서만 wheel 증감
  /*useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return;

    const handler = (ev: WheelEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;

      const td = target.closest("td[data-counter='1']") as HTMLTableCellElement | null;
      if (!td) return;

      ev.preventDefault();

      const taskId = td.dataset.taskId;
      const chId = td.dataset.chId;
      if (!taskId || !chId) return;

      setState((prev) => {
        const task = prev.tasks.find((t) => t.id === taskId);
        const tbl = getActiveTable(prev);
        const ch = tbl.characters.find((c) => c.id === chId);
        if (!task || !ch) return prev;
        if (task.cellType !== "COUNTER") return prev;

        const cell = getCell(prev, task.id, ch.id);
        const max = Math.max(1, task.max ?? 1);
        const cur = cell?.type === "COUNTER" ? (cell.count ?? 0) : 0;

        const dir = ev.deltaY > 0 ? -1 : 1;
        const next = Math.max(0, Math.min(max, cur + dir));

        return setCell(prev, task, ch, { type: "COUNTER", count: next, updatedAt: Date.now() });
      });
    };

    wrap.addEventListener("wheel", handler, { passive: false });
    return () => wrap.removeEventListener("wheel", handler as any);
  }, []);
*/
  type RaidGold = {
    normal?: number;
    hard?: number;
    nightmare?: number; // ✅ 세르카만 사용
  };

  const RAID_CLEAR_GOLD: Record<string, RaidGold> = {
    "1막": { normal: 11500, hard: 18000 },
    "2막": { normal: 16500, hard: 23000 },
    "3막": { normal: 21000, hard: 27000 }, // 하드 너프 반영
    "4막": { normal: 33000, hard: 42000 },
    "종막": { normal: 40000, hard: 52000 },
    "세르카": { normal: 35000, hard: 44000, nightmare: 54000 },
  };

  type RaidPopup = { title: string; x: number; y: number } | null;
  const [raidGoldPopup, setRaidGoldPopup] = useState<RaidPopup>(null);

  const activeTable = useMemo(() => getActiveTable(state), [state]);
  const characters = activeTable.characters;

  const tasks = useMemo(() => {
    if (periodTab === "ALL") return state.tasks;
    return state.tasks.filter((t) => t.period === periodTab);
  }, [periodTab, state.tasks]);

  const groupedTasks = useMemo(() => {
    const map = new Map<string, TaskRow[]>();

    for (const t of tasks) {
      const key = t.section ?? "숙제";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }

    // ✅ 섹션 내부 정렬: order → 없으면 원래 순서(안정 정렬)
    for (const [key, arr] of map.entries()) {
      arr.sort((a, b) => {
        const ao = a.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;

        // order가 둘 다 없거나 같으면, title로 2차 정렬(선택)
        return (a.title ?? "").localeCompare(b.title ?? "");
      });
    }

    return Array.from(map.entries());
  }, [tasks]);

  function reorderTaskWithinSection(fromTaskId: string, toTaskId: string) {
    if (fromTaskId === toTaskId) return;

    setState((prev) => {
      const from = prev.tasks.find((t) => t.id === fromTaskId);
      const to = prev.tasks.find((t) => t.id === toTaskId);
      if (!from || !to) return prev;

      const fromSec = from.section ?? "숙제";
      const toSec = to.section ?? "숙제";

      // ✅ 섹션 내부 이동만 허용 (원하면 나중에 섹션 이동도 가능)
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

      // ✅ order 재부여(안전하고 단순)
      const base = Date.now();
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

      for (const ch of characters) {
        all += 1;
        const cell = getCell(state, task.id, ch.id);
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
  }, [characters, state, tasks]);

  // =========================
  // ✅ 표(페이지) 관리
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
    const cur = activeTable;
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
    if (!confirm(`'${activeTable.name}' 표를 삭제할까요? (표 안의 데이터도 삭제됨)`)) return;

    setState((prev) => {
      const nextTables = prev.tables.filter((t) => t.id !== prev.activeTableId);
      const nextActive = nextTables[0].id;
      return { ...prev, tables: nextTables, activeTableId: nextActive };
    });
  }

  // =========================
  // ✅ 캐릭터 CRUD (activeTable 기준)
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
  // ✅ 숙제 CRUD (템플릿 공유: state.tasks)
  // =========================
  function addTask(period: "DAILY" | "WEEKLY" | "NONE") {
    const label = period === "DAILY" ? "일일" : period === "WEEKLY" ? "주간" : "기타";
    const title = prompt(`${label} 숙제 이름`)?.trim();
    if (!title) return;

    // ✅ 기타는 메모가 많으니 기본을 TEXT로
    const defaultType = period === "NONE" ? "TEXT" : "CHECK";

    const cellType = (prompt("셀 타입: CHECK / COUNTER / TEXT / SELECT", defaultType) ?? defaultType)
      .trim()
      .toUpperCase();

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

    // ✅ 기타는 섹션 기본값을 "기타"로
    const sectionDefault =
      period === "DAILY" ? "일일 숙제" : period === "WEEKLY" ? "주간 레이드" : "기타";

    const section = prompt("섹션 이름(예: 일일 숙제 / 주간 레이드 / 기타)", sectionDefault)?.trim() || sectionDefault;

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
  // ✅ 셀 동작
  // =========================
  function onCellClick(task: TaskRow, ch: Character) {
    setState((prev) => {
      const cell = getCell(prev, task.id, ch.id);

      if (task.cellType === "CHECK") {
        const nextChecked = !(cell?.type === "CHECK" ? cell.checked : false);
        return setCell(prev, task, ch, {
          type: "CHECK",
          checked: nextChecked,
          updatedAt: Date.now(),
        });
      }

      if (task.cellType === "COUNTER") {
        const max = Math.max(1, task.max ?? 1);
        const cur = cell?.type === "COUNTER" ? (cell.count ?? 0) : 0;

        // ✅ 자유 토글: 0→1→...→max→0
        const next = cur >= max ? 0 : cur + 1;

        return setCell(prev, task, ch, {
          type: "COUNTER",
          count: next,
          updatedAt: Date.now(),
        });
      }

      // ✅ 중요: 나머지는 상태 그대로
      return prev;
    });
  }


  function onTextChange(task: TaskRow, ch: Character, text: string) {
    setState((prev) => setCell(prev, task, ch, { type: "TEXT", text, updatedAt: Date.now() }));
  }

  function onSelectChange(task: TaskRow, ch: Character, value: string) {
    setState((prev) => setCell(prev, task, ch, { type: "SELECT", value, updatedAt: Date.now() }));
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
    const text = raw.trim();
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
  // =========================
  // 주간 레이드 골드 계산용 데이터 & 유틸
  // =========================

  type RaidDifficulty = {
    name: "노말" | "하드" | "나이트메어";
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
      key: "ACT1",
      name: "1막",
      diffs: [
        { name: "노말", minIlvl: 1660, gold: 11500 }, // (필요하면 수정)
        { name: "하드", minIlvl: 1680, gold: 18000 },
      ],
    },
    {
      key: "ACT2",
      name: "2막",
      diffs: [
        { name: "노말", minIlvl: 1670, gold: 18000 }, // (필요하면 수정)
        { name: "하드", minIlvl: 1690, gold: 23000 },
      ],
    },
    {
      key: "ACT3",
      name: "3막",
      diffs: [
        { name: "노말", minIlvl: 1680, gold: 21000 },
        { name: "하드", minIlvl: 1700, gold: 27000 }, // ✅ 너프 반영
      ],
    },
    {
      key: "ACT4",
      name: "4막",
      diffs: [
        { name: "노말", minIlvl: 1700, gold: 33000 },
        { name: "하드", minIlvl: 1720, gold: 42000 },
      ],
    },
    {
      key: "FINAL",
      name: "종막",
      diffs: [
        { name: "노말", minIlvl: 1710, gold: 40000 },
        { name: "하드", minIlvl: 1730, gold: 52000 },
      ],
    },
    {
      key: "SERKA",
      name: "세르카",
      diffs: [
        { name: "노말", minIlvl: 1710, gold: 35000 },
        { name: "하드", minIlvl: 1730, gold: 44000 },
        // 나이트메어도 쓰면 아래 주석 해제해서 사용
        { name: "나이트메어", minIlvl: 1740, gold: 54000 },
      ],
    },
  ];


  // 아이템 레벨 파싱 ("1712.5" → 1712.5)
  function parseIlvl(raw?: string): number {
    if (!raw) return NaN;
    const n = Number(String(raw).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : NaN;
  }

  // ✅ 특정 숙제는 아이템레벨 조건에 따라 표시/숨김 처리
  const TASK_MIN_ILVL: Record<string, number> = {
    "할의 모래시계": 1730,

    // 주간 레이드(네가 원하는 컷으로 맞춰서 조정하면 됨)
    "1막": 1660,
    "2막": 1670,      // 필요없으면 크게 잡아도 되고(예: 9999)
    "3막": 1680,
    "4막": 1700,
    "종막": 1710,
    "세르카": 1710,


    "1해금": 1640,
    "2해금": 1680,
    "3해금": 1700,
    "4해금": 1720,
  };

  // ✅ 캐릭 레벨 읽기 (너 프로젝트 필드명 차이 방어)
  const getCharIlvl = (ch: any) => {
    // 흔한 케이스들 다 대응
    const v =
      ch.itemLevel ?? ch.item_level ?? ch.ilvl ?? ch.iLvl ?? ch.level ?? ch.levelLabel ?? ch.nameLevel;

    // parseIlvl이 이미 있으면 그걸 우선 사용
    try {
      const n = typeof v === "number" ? v : parseIlvl(String(v ?? ""));
      return Number.isFinite(n) ? n : 0;
    } catch {
      const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) ? n : 0;
    }
  };


  // 해당 레이드에서 갈 수 있는 최고 골드 난이도 1개 선택
  function pickBestDiff(ilvl: number, raid: RaidDef): RaidDifficulty | null {
    const available = raid.diffs.filter((d) => ilvl >= d.minIlvl);
    if (!available.length) return null;
    return available.reduce((best, cur) => (cur.gold > best.gold ? cur : best));
  }

  // 캐릭터 주간 Top3 골드 합계 계산
  function calcWeeklyTop3Gold(ilvl: number) {
    const candidates = RAID_CATALOG.map((raid) => {
      const best = pickBestDiff(ilvl, raid);
      return best
        ? { raid: raid.name, diff: best.name, gold: best.gold }
        : null;
    }).filter(Boolean) as { raid: string; diff: string; gold: number }[];

    candidates.sort((a, b) => b.gold - a.gold);

    const top3 = candidates.slice(0, 3);
    const sum = top3.reduce((acc, cur) => acc + cur.gold, 0);

    return { sum, top3, all: candidates };
  }
  // ✅ 캐릭 ilvl 기준 "주간 레이드 Top3" 레이드명 Set
  function getWeeklyTop3RaidNameSet(ilvl: number): Set<string> {
    if (!Number.isFinite(ilvl) || ilvl <= 0) return new Set();
    const r = calcWeeklyTop3Gold(ilvl);
    return new Set(r.top3.map((x) => x.raid)); // 예: "세르카","종막","4막"
  }

  // ✅ 이 task가 '주간 레이드'에서 제한 적용 대상인지(2막~세르카)
  function isWeeklyRaidTaskTitle(title: string) {
    return Boolean(RAID_CLEAR_GOLD[title]); // 2막/3막/4막/종막/세르카만 true
  }


  return (
    <>
      {azenaModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: 340,
              background: "white",
              borderRadius: 12,
              padding: 14,
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>아제나 만료 시각 입력</div>

            <input
              type="datetime-local"
              value={azenaModal.value}
              onChange={(e) => setAzenaModal((p) => ({ ...p, value: e.target.value }))}
              style={{
                width: "100%",
                height: 34,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                padding: "0 10px",
                fontSize: 13,
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

            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 10, lineHeight: 1.35 }}>
              * 지정한 시각이 지나면 자동으로 체크가 해제됩니다. (새로고침/재접속/탭 복귀 시에도 자동 보정)
            </div>
          </div>
        </div>
      )}

      <div className="todo-page">
        <div className="todo-topbar">
          <div className="todo-title">
            <h2>할 일 (To-do)</h2>
            <div className="todo-sub">
              로스터 기반 숙제 체크리스트 · 일일 6시 / 주간 수요일 6시 자동 초기화
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={state.activeTableId}
                onChange={(e) => setActiveTableId(e.target.value)}
                style={{
                  height: 34,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  padding: "0 10px",
                  fontSize: 13,
                }}
                title="표 선택"
              >
                {state.tables.map((t) => (
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
          </div>

          {/* ✅ todo-actions 확실히 닫힘 */}
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

          <div className="todo-progress">
            진행률(체크/카운터): <b>{totalProgress.done}</b> / {totalProgress.all}
          </div>
        </div>

        <div className="todo-table-scroll" ref={tableWrapRef}>
          <div className="todo-table-center">
            <div className="todo-table-card">
              <table className="todo-table">
                <thead>
                  <tr>
                    <th className="todo-sticky-left head-left">
                      <div className="head-left-top">
                        <span>숙제</span>
                      </div>
                    </th>
                    {characters.map((ch) => (
                      <th
                        key={ch.id}
                        className="todo-col-head"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (!dragCharId) return;
                          reorderCharacters(dragCharId, ch.id);
                          setDragCharId(null);
                        }}
                      >
                        <div className="char-head">
                          <div
                            className="char-name"
                            title="드래그해서 캐릭터 순서 변경"
                            draggable
                            onDragStart={() => setDragCharId(ch.id)}
                            onDragEnd={() => setDragCharId(null)}
                            style={{ cursor: "grab" }}
                          >
                            {ch.name}
                          </div>

                          <div className="char-meta">Lv. {ch.itemLevel || "-"}</div>
                          <div className="char-meta">{ch.power || "-"}</div>

                          {(() => {
                            const enabled = Boolean((ch as any).azenaEnabled);
                            const expiresAt = (ch as any).azenaExpiresAt as string | null | undefined;
                            const expired =
                              enabled && expiresAt
                                ? new Date(expiresAt).getTime() <= Date.now()
                                : false;
                            const checked = enabled && !expired;

                            return (
                              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => onToggleAzena(ch.id, e.target.checked)}
                                  />
                                  <span>아제나</span>
                                </label>

                                {checked && expiresAt && (
                                  <div style={{ fontSize: 11, opacity: 0.8 }}>
                                    ~ {formatKoreanDateTime(expiresAt)}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          <div className="char-actions">
                            <button className="mini" onClick={() => editCharacter(ch)}>
                              수정
                            </button>
                            <button className="mini" onClick={() => deleteCharacter(ch)}>
                              삭제
                            </button>
                          </div>
                        </div>
                      </th>
                    ))}

                  </tr>
                </thead>

                <tbody>
                  {groupedTasks.map(([section, rows]) => {
                    return (
                      <React.Fragment key={section}>
                        <tr
                          className={`section-row ${section === "일일 숙제" || section === "주간 교환" || section === "주간 레이드"
                            ? "section-strong"
                            : ""
                            }`}
                        >
                          <td className="todo-sticky-left section-left" colSpan={1 + characters.length}>
                            {section}
                          </td>
                        </tr>

                        {section === "주간 레이드" && (
                          <tr className="task-row gold-sum-row">
                            <td className="todo-sticky-left task-left">
                              <div className="task-left-inner">
                                <div className="task-title">주간 클리어 골드(추천 Top3)</div>
                                <div className="task-sub">아이템레벨 기준 · 레이드별 최고 난이도만 적용</div>
                              </div>
                            </td>

                            {characters.map((ch) => {
                              const ilvl = parseIlvl(ch.itemLevel);

                              if (!Number.isFinite(ilvl)) {
                                return (
                                  <td key={ch.id} className="cell">
                                    <div className="goldbox muted">Lv 입력 필요</div>
                                  </td>
                                );
                              }

                              const r = calcWeeklyTop3Gold(ilvl);
                              const detail = r.top3
                                .map((x) => `${x.raid} ${x.diff}(${x.gold.toLocaleString()})`)
                                .join(" + ");

                              return (
                                <td key={ch.id} className="cell">
                                  <div className="goldbox" title={detail}>
                                    <div className="gold-sum">{r.sum.toLocaleString()} G</div>
                                    <div className="gold-detail">{r.top3.map((x) => x.raid).join(" / ")}</div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        )}

                        {rows.map((task) => {
                          if (task.title === "큐브") return null;
                          const min = TASK_MIN_ILVL[task.title];

                          // ✅ (A) 레벨 조건이 있는 숙제: 가능한 캐릭이 1명도 없으면 row 자체 숨김
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
                                if (!dragTaskId) return;
                                reorderTaskWithinSection(dragTaskId, task.id);
                                setDragTaskId(null);
                              }}
                            >
                              <td className="todo-sticky-left task-left">
                                <div className="task-left-inner">
                                  <div
                                    className="task-title raid-title-click"
                                    draggable
                                    onDragStart={() => setDragTaskId(task.id)}
                                    onDragEnd={() => setDragTaskId(null)}
                                    style={{ cursor: "grab" }}
                                    onClick={(e) => {
                                      if (!RAID_CLEAR_GOLD[task.title]) return;
                                      setRaidGoldPopup({ title: task.title, x: e.clientX, y: e.clientY });
                                    }}
                                  >
                                    {task.title}
                                  </div>

                                  <div className={`pill ${task.period === "DAILY" ? "daily" : task.period === "WEEKLY" ? "weekly" : ""}`}>
                                    {LEVEL_PERIODS[task.period]}
                                  </div>

                                  <div className="task-actions">
                                    <button className="mini" onClick={() => editTask(task)}>수정</button>
                                    <button className="mini" onClick={() => deleteTask(task)}>삭제</button>
                                  </div>
                                </div>
                              </td>

                              {characters.map((ch) => {
                                const cell = getCell(state, task.id, ch.id);

                                // ✅ (B) 캐릭터별 레벨 미달이면 "칸 비우기"
                                if (typeof min === "number") {
                                  const eligible = getCharIlvl(ch) >= min;
                                  if (!eligible) return <td key={ch.id} className="cell" />;
                                }

                                if (task.cellType === "TEXT") {
                                  const isCubeTicket = task.title.includes("해금");

                                  if (isCubeTicket) {
                                    const raw = cell?.type === "TEXT" ? cell.text : "";
                                    const n = raw === "" ? 0 : Number(String(raw).replace(/[^0-9]/g, ""));
                                    const value = Number.isFinite(n) ? n : 0;

                                    const setValue = (next: number) => onTextChange(task, ch, String(Math.max(0, next)));
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
                                                onTextChange(task, ch, onlyNum);
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
                                        onChange={(e) => onTextChange(task, ch, e.target.value)}
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
                                        onChange={(e) => onSelectChange(task, ch, e.target.value)}
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

                                  const isChaos = task.title === "카오스 던전";
                                  const isGuardian = task.title === "가디언 토벌";

                                  const restValue = isChaos
                                    ? (activeTable.restGauges?.[ch.id]?.chaos ?? 0)
                                    : isGuardian
                                      ? (activeTable.restGauges?.[ch.id]?.guardian ?? 0)
                                      : 0;

                                  const restMax = isChaos ? 200 : isGuardian ? 100 : 0;

                                  return (
                                    <td
                                      key={ch.id}
                                      className="cell"
                                      data-counter="1"
                                      data-task-id={task.id}
                                      data-ch-id={ch.id}
                                      onClick={() => onCellClick(task, ch)}
                                      title="클릭 토글"
                                    >
                                      <div className="cell-inline">
                                        <CounterDots max={max} count={count} />

                                        {(isChaos || isGuardian) && (
                                          <input
                                            inputMode="numeric"
                                            className="rest-input"
                                            value={String(restValue)}
                                            onChange={(e) => {
                                              const raw = e.target.value.replace(/[^0-9]/g, "");
                                              const n = raw === "" ? 0 : Number(raw);
                                              const clamped = clamp(Number.isFinite(n) ? n : 0, 0, restMax);

                                              setState((prev) => {
                                                const tbl = getActiveTable(prev);
                                                const cur = tbl.restGauges?.[ch.id] ?? { chaos: 0, guardian: 0 };

                                                const nextRest = {
                                                  ...(tbl.restGauges ?? {}),
                                                  [ch.id]: {
                                                    chaos: isChaos ? clamped : cur.chaos,
                                                    guardian: isGuardian ? clamped : cur.guardian,
                                                  },
                                                };

                                                const nextTbl: TodoTable = { ...tbl, restGauges: nextRest };
                                                return { ...prev, tables: prev.tables.map((t) => (t.id === nextTbl.id ? nextTbl : t)) };
                                              });
                                            }}
                                            title={isChaos ? "카오스 휴식(0~200)" : "가디언 휴식(0~100)"}
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

                                  // Top3가 아니면 체크 UI 자체 숨김 (칸만 비움)
                                  if (!top3Set.has(task.title)) {
                                    return <td key={ch.id} className="cell" />;
                                  }
                                }

                                // CHECK
                                const checked = cell?.type === "CHECK" ? cell.checked : false;

                                return (
                                  <td key={ch.id} className="cell">
                                    <button type="button" className="cell-check-btn" onClick={() => onCellClick(task, ch)} title="완료 체크">
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

        <div className="todo-hint">
          <div>팁</div>
          <ul>
            <li>카운터 셀: 클릭으로 토글</li>
            <li>카오스/가디언: 카운터 옆 휴식게이지(숫자) 입력 가능</li>
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
      </div>
    </>
  );


  function CounterDots({ max, count }: { max: number; count: number }) {
    const dots = Array.from({ length: max }, (_, i) => i + 1);

    return (
      <div className="dots">
        {dots.map((n) => (
          <span key={n} className={`dot ${n <= count ? "filled" : ""}`} />
        ))}

        {/* ✅ max가 1이면 0/1, 1/1 숨김 */}
        {max > 1 && <span className="dots-num">{count}/{max}</span>}
      </div>
    );
  }
}
