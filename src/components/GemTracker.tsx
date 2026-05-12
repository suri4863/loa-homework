import React, { DragEvent, useMemo, useState } from "react";
import { DEFAULT_TODO_STATE, type Character } from "../store/todoStore";
import "./GemTracker.css";

type Level = 10 | 9 | 8 | 7;
type Counts = Record<Level, Record<string, string>>;
type Prices = Record<Level, string>;
type StoredState = { columns: string[]; counts: Counts; prices: Prices };

const LEVELS: Level[] = [10, 9, 8, 7];
const DEFAULT_COLUMNS = ["창고", "캐릭터1", "캐릭터2", "캐릭터3", "캐릭터4", "캐릭터5", "캐릭터6", "캐릭터7", "캐릭터8", "캐릭터9"];
const STORAGE_KEY = "loa-gem-tracker:v1";

function safeNumber(value: string): number {
  if (value.trim() === "") return 0;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function makeEmptyCounts(columns: string[]): Counts {
  return {
    10: Object.fromEntries(columns.map((column) => [column, ""])) as Record<string, string>,
    9: Object.fromEntries(columns.map((column) => [column, ""])) as Record<string, string>,
    8: Object.fromEntries(columns.map((column) => [column, ""])) as Record<string, string>,
    7: Object.fromEntries(columns.map((column) => [column, ""])) as Record<string, string>,
  };
}

function makeEmptyPrices(): Prices {
  return { 10: "", 9: "", 8: "", 7: "" };
}

function ensureUniqueColumns(labels: string[]) {
  const seen = new Map<string, number>();
  return labels.map((raw, index) => {
    const base = raw.trim() || `캐릭터${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}

function remapCountsByIndex(prev: Counts, oldColumns: string[], nextColumns: string[]): Counts {
  const next = makeEmptyCounts(nextColumns);
  for (const level of LEVELS) {
    next[level] = Object.fromEntries(
      nextColumns.map((column, index) => [column, prev[level]?.[oldColumns[index]] ?? ""])
    ) as Record<string, string>;
  }
  return next;
}

function mergeDuplicateColumnsByIndex(prev: Counts, oldColumns: string[], nextLabels: string[]) {
  const nextColumns = nextLabels.reduce<string[]>((list, raw, index) => {
    const label = raw.trim() || `캐릭터${index + 1}`;
    if (!list.includes(label)) list.push(label);
    return list;
  }, []);
  const next = makeEmptyCounts(nextColumns);

  for (const level of LEVELS) {
    const totals = new Map<string, number>();
    const hasValue = new Set<string>();
    nextLabels.forEach((raw, index) => {
      const label = raw.trim() || `캐릭터${index + 1}`;
      const value = prev[level]?.[oldColumns[index]] ?? "";
      if (value !== "") hasValue.add(label);
      totals.set(label, (totals.get(label) ?? 0) + safeNumber(value));
    });
    next[level] = Object.fromEntries(
      nextColumns.map((column) => [column, hasValue.has(column) ? String(totals.get(column) ?? 0) : ""])
    ) as Record<string, string>;
  }

  return { columns: nextColumns, counts: next };
}

function normalizeStoredState(parsed: Partial<StoredState> | null): StoredState | null {
  if (!parsed?.columns?.length) return null;
  const columns = ensureUniqueColumns(parsed.columns.map(String));
  return {
    columns,
    counts: remapCountsByIndex(parsed.counts ?? makeEmptyCounts(columns), parsed.columns.map(String), columns),
    prices: { ...makeEmptyPrices(), ...(parsed.prices ?? {}) },
  };
}

function loadState(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeStoredState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveState(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function getActiveTableCharacters(): Character[] {
  const state = DEFAULT_TODO_STATE.load();
  if (!state?.tables?.length) return [];
  const table = state.tables.find((item) => item.id === state.activeTableId) ?? state.tables[0];
  return table.characters ?? [];
}

async function fetchCharacterClassName(characterName: string): Promise<string> {
  const response = await fetch(`/api/growth/kloa-character?nickname=${encodeURIComponent(characterName)}&summary=1`);
  const data = (await response.json()) as { className?: string | null; nickname?: string; error?: string; detail?: string };
  if (!response.ok) throw new Error(data.detail || data.error || "직업 정보를 불러오지 못했어.");
  return String(data.className || "").trim();
}

export default function GemTracker() {
  type Theme = "light" | "dark";
  const THEME_KEY = "todoTheme";

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "dark" ? "dark" : "light";
  });

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const loaded = typeof window !== "undefined" ? loadState() : null;
  const [columns, setColumns] = useState<string[]>(loaded?.columns ?? DEFAULT_COLUMNS);
  const [counts, setCounts] = useState<Counts>(loaded?.counts ?? makeEmptyCounts(loaded?.columns ?? DEFAULT_COLUMNS));
  const [prices, setPrices] = useState<Prices>(loaded?.prices ?? makeEmptyPrices());
  const [dragColumn, setDragColumn] = useState<string | null>(null);
  const [classSyncing, setClassSyncing] = useState(false);
  const [classSyncMessage, setClassSyncMessage] = useState("");

  const sumByLevel = useMemo(() => {
    const sums: Record<Level, number> = { 10: 0, 9: 0, 8: 0, 7: 0 };
    for (const level of LEVELS) {
      sums[level] = columns.reduce((sum, column) => sum + safeNumber(counts[level]?.[column] ?? ""), 0);
    }
    return sums;
  }, [columns, counts]);

  const valueByLevel = useMemo(() => {
    const values: Record<Level, number> = { 10: 0, 9: 0, 8: 0, 7: 0 };
    for (const level of LEVELS) values[level] = sumByLevel[level] * safeNumber(prices[level]);
    return values;
  }, [prices, sumByLevel]);

  const totalValue = useMemo(() => LEVELS.reduce((sum, level) => sum + valueByLevel[level], 0), [valueByLevel]);
  const totalCount = useMemo(() => LEVELS.reduce((sum, level) => sum + sumByLevel[level], 0), [sumByLevel]);

  React.useEffect(() => {
    saveState({ columns, counts, prices });
  }, [columns, counts, prices]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  function updateCell(level: Level, column: string, next: string) {
    const cleaned = next.replace(/[^0-9.]/g, "");
    setCounts((prev) => ({
      ...prev,
      [level]: {
        ...prev[level],
        [column]: cleaned,
      },
    }));
  }

  function updatePrice(level: Level, next: string) {
    const cleaned = next.replace(/[^0-9.]/g, "");
    setPrices((prev) => ({ ...prev, [level]: cleaned }));
  }

  function addColumn() {
    const name = prompt("추가할 이름을 입력해줘. 예: 캐릭터 / 직업 / 창고")?.trim();
    if (!name) return;
    const nextColumns = ensureUniqueColumns([...columns, name]);
    const addedName = nextColumns[nextColumns.length - 1];
    setColumns(nextColumns);
    setCounts((prev) => {
      const next = { ...prev };
      for (const level of LEVELS) next[level] = { ...next[level], [addedName]: "" };
      return next;
    });
  }

  function renameColumn(oldName: string) {
    const name = prompt(`'${oldName}' 이름을 무엇으로 바꿀까?`, oldName)?.trim();
    if (!name || name === oldName) return;
    const index = columns.indexOf(oldName);
    const nextColumns = ensureUniqueColumns(columns.map((column, columnIndex) => (columnIndex === index ? name : column)));
    setCounts((prev) => remapCountsByIndex(prev, columns, nextColumns));
    setColumns(nextColumns);
  }

  function deleteColumn(name: string) {
    if (!confirm(`'${name}' 열을 삭제할까? 입력한 보석 개수도 같이 삭제돼.`)) return;
    const nextColumns = columns.filter((column) => column !== name);
    setColumns(nextColumns);
    setCounts((prev) => {
      const next = { ...prev };
      for (const level of LEVELS) {
        const row = { ...next[level] };
        delete row[name];
        next[level] = row;
      }
      return next;
    });
  }

  function resetAll() {
    if (!confirm("모든 입력값을 초기화할까?")) return;
    setCounts(makeEmptyCounts(columns));
    setPrices(makeEmptyPrices());
  }

  function moveColumn(fromName: string, toName: string) {
    if (fromName === toName) return;
    setColumns((prev) => {
      const fromIndex = prev.indexOf(fromName);
      const toIndex = prev.indexOf(toName);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleColumnDragStart(event: DragEvent<HTMLTableCellElement>, column: string) {
    setDragColumn(column);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column);
  }

  function handleColumnDrop(event: DragEvent<HTMLTableCellElement>, column: string) {
    event.preventDefault();
    const from = dragColumn || event.dataTransfer.getData("text/plain");
    if (from) moveColumn(from, column);
    setDragColumn(null);
  }

  async function importOwnedClasses() {
    const characters = getActiveTableCharacters().filter((character) => character.name.trim());
    if (!characters.length) {
      setClassSyncMessage("현재 활성 표에 캐릭터가 없어.");
      return;
    }

    setClassSyncing(true);
    setClassSyncMessage("직업 정보 불러오는 중...");
    try {
      const result = await Promise.all(
        characters.map(async (character, index) => {
          try {
            const className = await fetchCharacterClassName(character.name);
            return className || character.name || `캐릭터${index + 1}`;
          } catch {
            return character.name || `캐릭터${index + 1}`;
          }
        })
      );
      const merged = mergeDuplicateColumnsByIndex(counts, columns, [columns[0] ?? DEFAULT_COLUMNS[0], ...result]);
      setColumns(merged.columns);
      setCounts(merged.counts);
      setClassSyncMessage(`${result.length}명 중 ${Math.max(0, merged.columns.length - 1)}개 직업 반영 완료`);
    } finally {
      setClassSyncing(false);
    }
  }

  return (
    <div className="gemPage">
      <section className="gemCard">
        <div className="gemTopRow">
          <div>
            <h2 className="gemH2">원정대 보석 개수</h2>
            <p className="gemMuted">레벨별 보관함/캐릭터 보유 개수를 입력해줘.</p>
            {classSyncMessage ? <p className="gemHint">{classSyncMessage}</p> : null}
          </div>

          <div className="gemBtnRow">
            <button className="gemBtn" onClick={importOwnedClasses} disabled={classSyncing}>
              {classSyncing ? "불러오는 중..." : "보유 직업 불러오기"}
            </button>
            <button className="gemBtn" onClick={addColumn}>
              + 열 추가
            </button>
            <button className="gemBtn" onClick={resetAll}>
              초기화
            </button>
            <button className="gemBtn" onClick={toggleTheme} title="테마 전환">
              {theme === "dark" ? "☀" : "●"}
            </button>
          </div>
        </div>

        <div className="gem-table-wrap">
          <table className="gem-table">
            <thead>
              <tr>
                <th className="level-head">레벨</th>

                {columns.map((column) => (
                  <th
                    key={column}
                    className={`col-head ${dragColumn === column ? "dragging" : ""}`}
                    draggable
                    onDragStart={(event) => handleColumnDragStart(event, column)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleColumnDrop(event, column)}
                    onDragEnd={() => setDragColumn(null)}
                  >
                    <div className="th-wrap">
                      <span className="col-title" title="드래그해서 열 순서를 바꿀 수 있어.">
                        {column}
                      </span>

                      <div className="head-actions">
                        <button className="ticket-btn" onClick={() => renameColumn(column)} title="이름 변경">
                          수정
                        </button>
                        <button className="ticket-btn" onClick={() => deleteColumn(column)} title="삭제">
                          삭제
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {LEVELS.map((level) => (
                <tr key={level}>
                  <td className="level-cell">{level}레벨</td>

                  {columns.map((column) => (
                    <td key={column} className="gemTdTight">
                      <input
                        inputMode="numeric"
                        className="gem-input"
                        value={counts[level]?.[column] ?? ""}
                        onChange={(event) => updateCell(level, column, event.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="gemSummaryGrid">
        <div className="gemCard">
          <div className="gemMuted">총 가치</div>
          <div className="gemBig">{formatNumber(totalValue)}</div>
          <div className="gemHint">레벨별 합계 x 시세 합산</div>
        </div>

        <div className="gemCard">
          <div className="gemMuted">총 개수(전체 레벨)</div>
          <div className="gemBig">{formatNumber(totalCount)}</div>
          <div className="gemHint">입력된 전체 합계</div>
        </div>

        <div className="gemCard">
          <div className="gemMuted">데이터</div>
          <div className="gemMid">자동 저장됨</div>
          <div className="gemHint">브라우저 localStorage에 저장돼. 삭제/초기화 가능</div>
        </div>
      </section>

      <section className="gemCard">
        <div className="gemTwoCol">
          <div>
            <h2 className="gemH2">합계 & 시세</h2>
            <p className="gemMuted">개수 합계는 자동, 시세는 직접 입력.</p>

            <div className="gemInnerTableWrap">
              <table className="gemInnerTable">
                <thead>
                  <tr>
                    <th>레벨</th>
                    <th className="right">합계</th>
                    <th className="right">시세</th>
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((level, index) => (
                    <tr key={level} className={index % 2 === 0 ? "rowEven" : "rowOdd"}>
                      <td className="fontMed">{level}레벨</td>
                      <td className="right">{formatNumber(sumByLevel[level])}</td>
                      <td>
                        <input
                          inputMode="decimal"
                          className="gemPriceInput"
                          placeholder="예: 40"
                          value={prices[level]}
                          onChange={(event) => updatePrice(level, event.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="gemH2">가치(자동 계산)</h2>
            <p className="gemMuted">레벨별 가치 = 합계 x 시세</p>

            <div className="gemInnerTableWrap">
              <table className="gemInnerTable">
                <thead>
                  <tr>
                    <th>레벨</th>
                    <th className="right">가치</th>
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((level, index) => (
                    <tr key={level} className={index % 2 === 0 ? "rowEven" : "rowOdd"}>
                      <td className="fontMed">{level}레벨</td>
                      <td className="right fontBold">{formatNumber(valueByLevel[level])}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="topBorder fontBold">총합</td>
                    <td className="topBorder right fontBold">{formatNumber(totalValue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="gemNote">* 시세 단위는 자유야. 골드/원 등 같은 단위로만 입력하면 총합도 같은 단위로 계산돼.</div>
          </div>
        </div>
      </section>
    </div>
  );
}
