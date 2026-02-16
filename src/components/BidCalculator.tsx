import React, { useMemo, useState } from "react";

type PartyPreset = 4 | 8 | 16 | "custom";

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function formatGold(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function BidCalculator() {
  const [open, setOpen] = useState(false);

  const [itemPrice, setItemPrice] = useState<number>(2000);
  const [preset, setPreset] = useState<PartyPreset>(8);
  const [customParty, setCustomParty] = useState<number>(8);

  const partySize = preset === "custom" ? customParty : preset;
  const fee = useMemo(() => Math.floor(itemPrice * 0.05), [itemPrice]);

  const [copied, setCopied] = useState(false);

  // 손익분기점: (아이템가격 - 수수료) * (본인 제외 인원) / (본인 포함 인원)
  const breakEvenBid = useMemo(() => {
    const p = clampInt(partySize, 2, 16);
    const net = Math.max(0, itemPrice - fee);
    return Math.floor((net * (p - 1)) / p);
  }, [itemPrice, fee, partySize]);

  // 직접 사용: 아이템가격 * (본인 제외 인원) / (본인 포함 인원)
  const directUseBid = useMemo(() => {
    const p = clampInt(partySize, 2, 16);
    return Math.floor((itemPrice * (p - 1)) / p);
  }, [itemPrice, partySize]);

  // 선점: ÷ 1.1 (반올림)
  const preemptBid = useMemo(() => Math.round(breakEvenBid / 1.1), [breakEvenBid]);

  // 4인 기준
  const breakEven4 = useMemo(() => {
    const net = Math.max(0, itemPrice - fee);
    return Math.floor((net * 3) / 4);
  }, [itemPrice, fee]);

  const preempt4 = useMemo(() => Math.round(breakEven4 / 1.1), [breakEven4]);

  const rows = useMemo(() => {
    const tiers: Array<{ label: string; r: number }> = [
      { label: "25%", r: 0.25 },
      { label: "50%", r: 0.5 },
      { label: "75%", r: 0.75 },
    ];

    const tierRows = tiers.map((t) => {
      const bid = Math.round(breakEvenBid / (1 + 0.1 * t.r));
      return { left: breakEvenBid - bid, mid: t.label, right: bid };
    });

    return [
      { left: itemPrice - directUseBid, mid: "직접 사용", right: directUseBid },
      { left: 0, mid: "손익 분기점", right: breakEvenBid },
      ...tierRows,
      { left: breakEvenBid - preemptBid, mid: "선점", right: preemptBid },
    ];
  }, [itemPrice, directUseBid, breakEvenBid, preemptBid]);

  const copyBid = async () => {
    await navigator.clipboard.writeText(String(preemptBid));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const v = (name: string) => `var(${name})`;

  // ✅ 입력 통일 스타일 (다크/라이트 모두 안정)
  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 38,
    borderRadius: 12,
    border: `1px solid ${v("--border")}`,
    background: v("--soft"),
    color: v("--text"),
    WebkitTextFillColor: v("--text"), // ✅ 크롬/사파리에서 글자색 튐 방지
    padding: "0 12px",
    outline: "none",
  };

  const preventWeirdKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // number input에서 e/E/+/- 같은 거 들어가면 UX 별로라 막음(선택)
    if (e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-") e.preventDefault();
  };

  return (
    <>
      {/* 트리거 버튼 */}
      <button
        onClick={() => setOpen(true)}
        title="입찰 계산기"
        style={{
          border: `1px solid ${v("--border")}`,
          background: v("--card"),
          color: v("--text"),
          borderRadius: 12,
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        계산기
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
          {/* dim */}
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }}
            onClick={() => setOpen(false)}
          />

          {/* modal */}
          <div
            style={{
              position: "absolute",
              right: 24,
              top: 80,
              width: 340,
              borderRadius: 16,
              background: v("--card"),
              color: v("--text"),
              border: `1px solid ${v("--border")}`,
              boxShadow: v("--shadow"),
              padding: 14,

              // ✅ 핵심: 폼 컨트롤 기본 테마도 다크를 따르게(흰색 잔상 방지)
              // 라이트에서도 크게 깨지지 않게 "light dark" 권장
              colorScheme: "light dark",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>입찰 계산기</div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  border: `1px solid ${v("--border")}`,
                  background: v("--soft"),
                  color: v("--text"),
                  borderRadius: 10,
                  padding: "6px 10px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                닫기
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {/* 아이템 가격 */}
              <div>
                <div style={{ fontSize: 12, color: v("--muted"), marginBottom: 6 }}>아이템 가격</div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={itemPrice}
                  onKeyDown={preventWeirdKeys}
                  onChange={(e) => setItemPrice(Math.max(0, Number(e.target.value)))}
                  style={inputStyle}
                />
              </div>

              {/* 판매 수수료 (5%) */}
              <div>
                <div style={{ fontSize: 12, color: v("--muted"), marginBottom: 6 }}>판매 수수료 (5%)</div>
                <div
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: `1px solid ${v("--border")}`,
                    background: v("--soft"),
                    color: v("--text"),
                    padding: "10px 12px",
                    fontSize: 14,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatGold(fee)}
                </div>
              </div>

              {/* 파티 프리셋 */}
              <div style={{ display: "flex", gap: 8 }}>
                {[4, 8, 16].map((n) => {
                  const active = preset === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setPreset(n as 4 | 8 | 16)}
                      style={{
                        flex: 1,
                        borderRadius: 12,
                        border: `1px solid ${active ? v("--primary") : v("--border")}`,
                        background: active ? v("--primary-soft") : v("--card"),
                        color: v("--text"),
                        padding: "10px 0",
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {n}인
                    </button>
                  );
                })}
                <button
                  onClick={() => setPreset("custom")}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    border: `1px solid ${preset === "custom" ? v("--primary") : v("--border")}`,
                    background: preset === "custom" ? v("--primary-soft") : v("--card"),
                    color: v("--text"),
                    padding: "10px 0",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  직접
                </button>
              </div>

              {preset === "custom" && (
                <div>
                  <div style={{ fontSize: 12, color: v("--muted"), marginBottom: 6 }}>인원(2~16)</div>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={2}
                    max={16}
                    value={customParty}
                    onKeyDown={preventWeirdKeys}
                    onChange={(e) => setCustomParty(clampInt(Number(e.target.value), 2, 16))}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* 결과 표 */}
              <div style={{ borderRadius: 16, border: `1px solid ${v("--border")}`, overflow: "hidden" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 0.8fr 1fr",
                    gap: 8,
                    padding: "10px 12px",
                    fontSize: 12,
                    color: v("--muted"),
                    borderBottom: `1px solid ${v("--border")}`,
                    background: v("--soft-2"),
                  }}
                >
                  <div style={{ textAlign: "left" }}>손익</div>
                  <div style={{ textAlign: "center" }}>/</div>
                  <div style={{ textAlign: "right" }}>입찰가</div>
                </div>

                {rows.map((r) => (
                  <div
                    key={r.mid}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 0.8fr 1fr",
                      gap: 8,
                      padding: "10px 12px",
                      fontSize: 13,
                      background: v("--card"),
                    }}
                  >
                    <div style={{ textAlign: "left", fontVariantNumeric: "tabular-nums" }}>{formatGold(r.left)}</div>
                    <div style={{ textAlign: "center", color: v("--muted") }}>{r.mid}</div>
                    <div style={{ textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                      {formatGold(r.right)}
                    </div>
                  </div>
                ))}
              </div>

              {/* 요약 */}
              <div
                style={{
                  borderRadius: 16,
                  border: `1px solid ${v("--border")}`,
                  background: v("--soft"),
                  color: v("--text"),
                  padding: "10px 12px",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                <div>
                  4인 손익분기점: <b>{formatGold(breakEven4)}</b> / 선점(÷1.1): <b>{formatGold(preempt4)}</b>
                </div>
                <div>
                  현재({partySize}인) 손익분기점: <b>{formatGold(breakEvenBid)}</b> / 선점(÷1.1):{" "}
                  <b>{formatGold(preemptBid)}</b>
                </div>
              </div>

              {/* 복사 */}
              <button
                onClick={copyBid}
                style={{
                  width: "100%",
                  border: `1px solid ${v("--border")}`,
                  borderRadius: 16,
                  padding: "12px 14px",
                  background: v("--primary"),
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                입찰가 복사
              </button>

              {copied && <div style={{ textAlign: "center", fontSize: 12, color: "#16a34a" }}>복사되었습니다!</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
