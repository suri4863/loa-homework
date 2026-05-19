import React, { useEffect, useMemo, useRef, useState } from "react";

type PartyPreset = 4 | 8 | 16 | "custom";
const BID_POPOVER_POS_KEY = "loa-bid-popover-pos:v2";

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function formatGold(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function BidPopover() {
  const [open, setOpen] = useState(false);
  const [itemPrice, setItemPrice] = useState<number | "">("");
  const [dragPos, setDragPos] = useState<{ top: number; left: number } | null>(() => {
    try {
      const raw = localStorage.getItem(BID_POPOVER_POS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const top = Number(parsed?.top);
      const left = Number(parsed?.left);
      if (!Number.isFinite(top) || !Number.isFinite(left)) return null;
      return { top, left };
    } catch {
      return null;
    }
  });
  const [dockHover, setDockHover] = useState(false);
  const draggingRef = useRef(false);
  const price = typeof itemPrice === "number" ? itemPrice : 0;

  //  판매 수수료 = 아이템 가격의 5% (소수점 버림)
  const fee = useMemo(() => Math.floor(price * 0.05), [price]);

  // 기본값: 직접 / 40인
  const [preset, setPreset] = useState<PartyPreset>("custom");
  const [customParty, setCustomParty] = useState<number>(40);
  const [copied, setCopied] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const partySize = preset === "custom" ? customParty : preset;

  // 직접 사용
  const directUseBid = useMemo(() => {
    const p = clampInt(partySize, 2, 45);
    return Math.floor((price * (p - 1)) / p);
  }, [price, partySize]);

  // ✅ 손익분기점: floor((가격-수수료) * (N-1) / N)
  const breakEvenBid = useMemo(() => {
    const p = clampInt(partySize, 2, 45);
    const net = Math.max(0, price - fee);
    return Math.floor((net * (p - 1)) / p);
  }, [price, fee, partySize]);

  // ✅ 선점: round(손익분기점 / 1.1)
  const preemptBid = useMemo(() => Math.round(breakEvenBid / 1.1), [breakEvenBid]);

  // 팝오버 위치: 버튼 아래
  const popPos = useMemo(() => {
    if (dragPos) return { top: dragPos.top + 46, left: dragPos.left };
    const el = btnRef.current;
    if (!el) return { top: 88, left: 28 };
    const width = 340;
    const margin = 8;

    const r = el.getBoundingClientRect();
    let left = r.left;
    left = Math.min(left, window.innerWidth - width - margin);
    left = Math.max(left, margin);

    const top = r.bottom + margin;
    return { top, left };
  }, [open, dragPos]);

  useEffect(() => {
    if (!dragPos) {
      localStorage.removeItem(BID_POPOVER_POS_KEY);
      return;
    }
    localStorage.setItem(BID_POPOVER_POS_KEY, JSON.stringify(dragPos));
  }, [dragPos]);

  function isInsideTopbar(event: PointerEvent) {
    const topbar = document.querySelector(".todo-topbar") as HTMLElement | null;
    const rect = topbar?.getBoundingClientRect();
    return Boolean(
      rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
    );
  }

  function handleButtonDragStart(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);

    const move = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 4) {
        draggingRef.current = true;
      }
      const width = btnRef.current?.offsetWidth ?? 70;
      const height = btnRef.current?.offsetHeight ?? 38;
      setDockHover(isInsideTopbar(event));
      setDragPos({
        left: Math.min(Math.max(8, event.clientX - offsetX), Math.max(8, window.innerWidth - width - 8)),
        top: Math.min(Math.max(8, event.clientY - offsetY), Math.max(8, window.innerHeight - height - 8)),
      });
    };

    const up = (event: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (isInsideTopbar(event)) {
        setDragPos(null);
      }
      setDockHover(false);
      window.setTimeout(() => {
        draggingRef.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const rect = popRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);

    const move = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 4) {
        draggingRef.current = true;
      }
      const width = popRef.current?.offsetWidth ?? 340;
      const height = popRef.current?.offsetHeight ?? 420;
      setDockHover(isInsideTopbar(event));
      setDragPos({
        left: Math.min(Math.max(8, event.clientX - offsetX), Math.max(8, window.innerWidth - width - 8)),
        top: Math.min(Math.max(8, event.clientY - offsetY - 46), Math.max(8, window.innerHeight - height - 54)),
      });
    };

    const up = (event: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (isInsideTopbar(event)) {
        setDragPos(null);
      }
      setDockHover(false);
      window.setTimeout(() => {
        draggingRef.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  // 바깥 클릭/ESC 닫기
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copyBids = async () => {
    await navigator.clipboard.writeText(String(preemptBid));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`bid-dock-slot ${dragPos ? "is-empty" : ""} ${dockHover ? "is-hover" : ""}`}>
      {dragPos ? <div className="bid-dock-placeholder">계산기</div> : null}
      <div
      ref={wrapRef}
      className={`bid-popover-wrap ${dragPos ? "is-floating" : "is-docked"}`}
      style={dragPos ? { left: dragPos.left, top: dragPos.top } : undefined}
    >
      <button
        ref={btnRef}
        className="btn"
        onPointerDown={handleButtonDragStart}
        onClick={() => {
          if (draggingRef.current) return;
          setOpen((v) => !v);
        }}
        type="button"
        title="입찰 계산기"
      >
        계산기
      </button>

      {open && (
        <div ref={popRef} className="bid-popover" style={{ top: popPos.top, left: popPos.left }}>
          <div className="bid-popover-head" onPointerDown={handleDragStart}>
            <div className="bid-popover-title">입찰 계산기</div>
            <button
              className="bid-popover-close"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setOpen(false)}
              type="button"
            >
              닫기
            </button>
          </div>

          <div className="bid-popover-body">
            {/* 아이템 가격 */}
            <div className="bid-field">
              <div className="bid-label">아이템 가격</div>
              <input
                className="bid-input"
                type="number"
                value={itemPrice}
                min={0}
                onChange={(e) => {
                  const value = e.target.value;
                  setItemPrice(value === "" ? "" : Math.max(0, Number(value)));
                }}
              />
            </div>

            {/* 판매 수수료(자동) */}
            <div className="bid-field">
              <div className="bid-label">판매 수수료 (5%)</div>
              <div className="bid-input">
                {formatGold(fee)}
              </div>
            </div>

            {/* 인원 선택 */}
            <div className="bid-row">
              {[4, 8, 16].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`bid-chip ${preset === n ? "active" : ""}`}
                  onClick={() => setPreset(n as 4 | 8 | 16)}
                >
                  {n}인
                </button>
              ))}
              <button
                type="button"
                className={`bid-chip ${preset === "custom" ? "active" : ""}`}
                onClick={() => setPreset("custom")}
              >
                직접
              </button>
            </div>

            {/* 직접 입력 */}
            {preset === "custom" && (
              <div className="bid-field">
                <div className="bid-label">인원(2~45)</div>
                <input
                  className="bid-input"
                  type="number"
                  min={2}
                  max={45}
                  value={customParty}
                  onChange={(e) => setCustomParty(clampInt(Number(e.target.value), 2, 45))}
                />
              </div>
            )}

            {/* 결과 */}
            <div className="bid-box">
              <div className="bid-line">
                <span>직접 사용</span>
                <b>{formatGold(directUseBid)} G</b>
              </div>

              <div className="bid-line">
                <span>손익분기점</span>
                <b>{formatGold(breakEvenBid)} G</b>
              </div>

              <div className="bid-line">
                <span>선점(÷1.1)</span>
                <b>{formatGold(preemptBid)} G</b>
              </div>
            </div>

            {/* 복사 */}
            <button className="bid-copy" onClick={copyBids} type="button">
              입찰가 복사
            </button>

            {copied && (
              <div style={{ marginTop: 6, textAlign: "center", fontSize: 12, color: "#16a34a" }}>
                복사되었습니다!
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
