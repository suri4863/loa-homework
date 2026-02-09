import React, { useMemo, useState } from 'react'
import "./GemTracker.css";

type Level = 10 | 9 | 8 | 7

const LEVELS: Level[] = [10, 9, 8, 7]
const DEFAULT_COLUMNS = ['창고', '브레이커', '환수사', '발키리', '기상술사', '바드', '창술사', '소서리스', '인파이터', '폿키리']
const STORAGE_KEY = 'loa-gem-tracker:v1'

type Counts = Record<Level, Record<string, string>> // string을 유지해서 빈칸("" ) 보존
type Prices = Record<Level, string>

function safeNumber(v: string): number {
  if (v.trim() === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatKRWLike(n: number): string {
  // 엑셀 느낌으로 1,234.5 같은 표기
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

function makeEmptyCounts(columns: string[]): Counts {
  return {
    10: Object.fromEntries(columns.map((c) => [c, ''])) as Record<string, string>,
    9: Object.fromEntries(columns.map((c) => [c, ''])) as Record<string, string>,
    8: Object.fromEntries(columns.map((c) => [c, ''])) as Record<string, string>,
    7: Object.fromEntries(columns.map((c) => [c, ''])) as Record<string, string>,
  }
}

function makeEmptyPrices(): Prices {
  return { 10: '', 9: '', 8: '', 7: '' }
}

function loadState(): { columns: string[]; counts: Counts; prices: Prices } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { columns: string[]; counts: Counts; prices: Prices }
    if (!parsed?.columns?.length) return null
    return parsed
  } catch {
    return null
  }
}

function saveState(state: { columns: string[]; counts: Counts; prices: Prices }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export default function GemTracker() {
  const loaded = typeof window !== 'undefined' ? loadState() : null

  const [columns, setColumns] = useState<string[]>(loaded?.columns ?? DEFAULT_COLUMNS)
  const [counts, setCounts] = useState<Counts>(loaded?.counts ?? makeEmptyCounts(loaded?.columns ?? DEFAULT_COLUMNS))
  const [prices, setPrices] = useState<Prices>(loaded?.prices ?? makeEmptyPrices())

  // 파생값 계산
  const sumByLevel = useMemo(() => {
    const sums: Record<Level, number> = { 10: 0, 9: 0, 8: 0, 7: 0 }
    for (const lvl of LEVELS) {
      let s = 0
      for (const col of columns) s += safeNumber(counts[lvl][col] ?? '')
      sums[lvl] = s
    }
    return sums
  }, [columns, counts])

  const valueByLevel = useMemo(() => {
    const vals: Record<Level, number> = { 10: 0, 9: 0, 8: 0, 7: 0 }
    for (const lvl of LEVELS) {
      vals[lvl] = sumByLevel[lvl] * safeNumber(prices[lvl])
    }
    return vals
  }, [prices, sumByLevel])

  const totalValue = useMemo(() => LEVELS.reduce((acc, lvl) => acc + valueByLevel[lvl], 0), [valueByLevel])

  // 자동 저장
  React.useEffect(() => {
    saveState({ columns, counts, prices })
  }, [columns, counts, prices])

  function updateCell(level: Level, col: string, next: string) {
    // 빈칸 허용, 숫자/소수점만 허용(간단하게)
    const cleaned = next.replace(/[^0-9.]/g, '')
    setCounts((prev) => ({
      ...prev,
      [level]: {
        ...prev[level],
        [col]: cleaned,
      },
    }))
  }

  function updatePrice(level: Level, next: string) {
    const cleaned = next.replace(/[^0-9.]/g, '')
    setPrices((prev) => ({ ...prev, [level]: cleaned }))
  }

  function addColumn() {
    const name = prompt('추가할 열 이름(예: 새 캐릭터 직업)을 입력하세요')?.trim()
    if (!name) return
    if (columns.includes(name)) {
      alert('이미 같은 이름의 열이 있어요.')
      return
    }
    const nextCols = [...columns, name]
    setColumns(nextCols)
    setCounts((prev) => {
      const next = { ...prev }
      for (const lvl of LEVELS) {
        next[lvl] = { ...next[lvl], [name]: '' }
      }
      return next
    })
  }

  function renameColumn(oldName: string) {
    const name = prompt(`'${oldName}' 열 이름을 무엇으로 바꿀까요?`, oldName)?.trim()
    if (!name || name === oldName) return
    if (columns.includes(name)) {
      alert('이미 같은 이름의 열이 있어요.')
      return
    }
    setColumns((prev) => prev.map((c) => (c === oldName ? name : c)))
    setCounts((prev) => {
      const next: Counts = { ...prev }
      for (const lvl of LEVELS) {
        const row = { ...next[lvl] }
        row[name] = row[oldName] ?? ''
        delete row[oldName]
        next[lvl] = row
      }
      return next
    })
  }

  function deleteColumn(name: string) {
    if (!confirm(`'${name}' 열을 삭제할까요? (데이터도 같이 삭제됩니다)`)) return
    const nextCols = columns.filter((c) => c !== name)
    setColumns(nextCols)
    setCounts((prev) => {
      const next: Counts = { ...prev }
      for (const lvl of LEVELS) {
        const row = { ...next[lvl] }
        delete row[name]
        next[lvl] = row
      }
      return next
    })
  }

  function resetAll() {
    if (!confirm('모든 입력값을 초기화할까요?')) return
    setCounts(makeEmptyCounts(columns))
    setPrices(makeEmptyPrices())
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">원정대 보석 개수</h2>
            <p className="text-sm text-neutral-600">레벨(행) × 보관처/캐릭터(열)로 개수를 입력하세요.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50" onClick={addColumn}>
              + 열 추가
            </button>
            <button className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50" onClick={resetAll}>
              초기화
            </button>
          </div>
        </div>

        <div className="mt-4 gem-table-wrap">
          <table className="gem-table text-sm">
            <thead>
              <tr>
                <th className="level-head">레벨</th>

                {columns.map((col) => (
                  <th key={col} className="col-head">
                    {/* ✅ 제목 1줄 + 버튼 1줄 */}
                    <div className="th-wrap">
                      <span className="col-title">{col}</span>

                      <div className="head-actions">
                        <button
                          className="ticket-btn"
                          onClick={() => renameColumn(col)}
                          title="이름 변경"
                        >
                          수정
                        </button>
                        <button
                          className="ticket-btn"
                          onClick={() => deleteColumn(col)}
                          title="삭제"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {LEVELS.map((lvl) => (
                <tr key={lvl}>
                  <td className="level-cell">{lvl}레벨</td>

                  {columns.map((col) => (
                    <td
                      key={col}
                      className="border-r !px-2 !py-[6px]"   // ✅ td 패딩 강제
                    >
                      <input
                        inputMode="numeric"
                        className="gem-input !h-[28px] !min-h-[28px] !px-2 !text-[13px] text-right" // ✅ input 강제
                        value={counts[lvl][col] ?? ""}
                        onChange={(e) => updateCell(lvl, col, e.target.value)}
                      />
                    </td>
                  ))}

                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-neutral-600">총 가치</div>
          <div className="mt-1 text-2xl font-semibold">{formatKRWLike(totalValue)}</div>
          <div className="mt-1 text-xs text-neutral-500">(레벨별 합계 × 시세) 합산</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-neutral-600">총 개수(전체 레벨)</div>
          <div className="mt-1 text-2xl font-semibold">{formatKRWLike(LEVELS.reduce((a, l) => a + sumByLevel[l], 0))}</div>
          <div className="mt-1 text-xs text-neutral-500">입력표 전체 합계</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-neutral-600">데이터</div>
          <div className="mt-1 text-base font-semibold">자동 저장됨</div>
          <div className="mt-1 text-xs text-neutral-500">브라우저 localStorage에 저장(삭제/초기화 가능)</div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="text-base font-semibold">합계 & 시세</h2>
            <p className="text-sm text-neutral-600">개수 합계는 자동, 시세는 직접 입력.</p>

            <div className="mt-3 overflow-auto rounded-xl border">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="border-b px-3 py-2 text-left font-semibold">레벨</th>
                    <th className="border-b px-3 py-2 text-right font-semibold">합계</th>
                    <th className="border-b px-3 py-2 text-right font-semibold">시세</th>
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((lvl) => (
                    <tr key={lvl} className="even:bg-white odd:bg-neutral-50/30">
                      <td className="px-3 py-2 font-medium">{lvl}레벨</td>
                      <td className="px-3 py-2 text-right">{formatKRWLike(sumByLevel[lvl])}</td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          className="w-full rounded-lg border bg-white px-2 py-1 text-right outline-none focus:ring-2 focus:ring-neutral-200"
                          placeholder="예: 13.5"
                          value={prices[lvl]}
                          onChange={(e) => updatePrice(lvl, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold">가치(자동 계산)</h2>
            <p className="text-sm text-neutral-600">레벨별 가치 = (합계 × 시세)</p>

            <div className="mt-3 overflow-auto rounded-xl border">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="border-b px-3 py-2 text-left font-semibold">레벨</th>
                    <th className="border-b px-3 py-2 text-right font-semibold">가치</th>
                  </tr>
                </thead>
                <tbody>
                  {LEVELS.map((lvl) => (
                    <tr key={lvl} className="even:bg-white odd:bg-neutral-50/30">
                      <td className="px-3 py-2 font-medium">{lvl}레벨</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatKRWLike(valueByLevel[lvl])}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="border-t px-3 py-2 font-semibold">총합</td>
                    <td className="border-t px-3 py-2 text-right text-base font-semibold">{formatKRWLike(totalValue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
              * 시세 단위는 자유(골드/원 등). 단위는 동일하게만 입력하면 총합이 같은 단위로 계산돼요.
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
