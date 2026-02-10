import React, { useEffect, useMemo, useRef, useState } from "react";

type PartyPreset = 4 | 8 | 16 | "custom";

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function formatGold(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function BidPopover() {
  const [open, setOpen] = useState(false);
  const [itemPrice, setItemPrice] = useState<number | "">("");
  const price = typeof itemPrice === "number" ? itemPrice : 0;

  // ✅ 판매 수수료 = 아이템 가격의 5% (소수점 버림)
  const fee = useMemo(() => Math.floor(price * 0.05), [price]);

  const [preset, setPreset] = useState<PartyPreset>(8);
  const [customParty, setCustomParty] = useState<number>(8);
  const [copied, setCopied] = useState(false);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const partySize = preset === "custom" ? customParty : preset;

  // 직접 사용
  const directUseBid = useMemo(() => {
    const p = clampInt(partySize, 2, 16);
    return Math.floor((price * (p - 1)) / p);
  }, [price, partySize]);

  // ✅ 손익분기점: floor((가격-수수료) * (N-1) / N)
  const breakEvenBid = useMemo(() => {
    const p = clampInt(partySize, 2, 16);
    const net = Math.max(0, price - fee);
    return Math.floor((net * (p - 1)) / p);
  }, [price, fee, partySize]);

  // ✅ 선점: round(손익분기점 / 1.1)
  const preemptBid = useMemo(() => Math.round(breakEvenBid / 1.1), [breakEvenBid]);

  // 팝오버 위치: 버튼 아래
  const popPos = useMemo(() => {
    const el = btnRef.current;
    if (!el) return { top: 0, left: 0 };
    const r = el.getBoundingClientRect();
    const width = 340;
    const margin = 8;

    let left = r.left + window.scrollX;
    left = Math.min(left, window.scrollX + window.innerWidth - width - margin);
    left = Math.max(left, window.scrollX + margin);

    const top = r.bottom + window.scrollY + margin;
    return { top, left };
  }, [open]);

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
    // ✅ 선점 금액 숫자만 복사
    await navigator.clipboard.writeText(String(preemptBid));

    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bid-popover-wrap">
      <button
        ref={btnRef}
        className="btn"
        onClick={() => setOpen((v) => !v)}
        type="button"
        title="입찰 계산기"
      >
        계산기
      </button>

      {open && (
        <div ref={popRef} className="bid-popover" style={{ top: popPos.top, left: popPos.left }}>
          <div className="bid-popover-head">
            <div className="bid-popover-title">입찰 계산기</div>
            <button className="bid-popover-close" onClick={() => setOpen(false)} type="button">
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
                onChange={(e) => setItemPrice(Math.max(0, Number(e.target.value)))}
              />
            </div>

            {/* 판매 수수료(자동) */}
            <div className="bid-field">
              <div className="bid-label">판매 수수료 (5%)</div>
              <div className="bid-input" style={{ background: "#f9fafb" }}>
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
                <div className="bid-label">인원(2~16)</div>
                <input
                  className="bid-input"
                  type="number"
                  value={customParty}
                  onChange={(e) => setCustomParty(clampInt(Number(e.target.value), 2, 16))}
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
  );
}
