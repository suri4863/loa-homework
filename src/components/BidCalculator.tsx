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


    // ✅ 손익분기점: (아이템가격 - 수수료) * (본인 제외 인원) / (본인 포함 인원)   (소수점 버림)
    const breakEvenBid = useMemo(() => {
        const p = clampInt(partySize, 2, 16);
        const net = Math.max(0, itemPrice - fee);
        return Math.floor((net * (p - 1)) / p);
    }, [itemPrice, fee, partySize]);


    // ✅ 직접 사용: 아이템가격 * (본인 제외 인원) / (본인 포함 인원)  (소수점 버림)
    const directUseBid = useMemo(() => {
        const p = clampInt(partySize, 2, 16);
        return Math.floor((itemPrice * (p - 1)) / p);
    }, [itemPrice, partySize]);

    // ✅ “로스트아크 선점”: ÷ 1.1 (소수점 반올림)
    const preemptBid = useMemo(() => Math.round(breakEvenBid / 1.1), [breakEvenBid]);

    // ✅ 4인 기준 손익분기점 & 선점(요청에 있던 1425 ÷ 1.1 용도)
    const breakEven4 = useMemo(() => {
        const net = Math.max(0, itemPrice - fee);
        return Math.floor((net * 3) / 4);
    }, [itemPrice, fee]);

    const preempt4 = useMemo(() => Math.round(breakEven4 / 1.1), [breakEven4]);

    const rows = useMemo(() => {
        // 25/50/75는 “분기점 ÷ (1 + 0.1*비율)” 형태로 같이 보여주면 UI가 스샷 느낌이 잘 나옴
        // (반올림/버림은 취향인데, 스샷은 케이스별로 달라 보이니 여기선 반올림으로 통일)
        const tiers: Array<{ label: string; r: number }> = [
            { label: "25%", r: 0.25 },
            { label: "50%", r: 0.5 },
            { label: "75%", r: 0.75 },
        ];

        const tierRows = tiers.map((t) => {
            const bid = Math.round(breakEvenBid / (1 + 0.1 * t.r));
            return {
                left: breakEvenBid - bid, // 손익(분기점 대비)
                mid: t.label,
                right: bid,
            };
        });

        return [
            {
                left: itemPrice - directUseBid,
                mid: "직접 사용",
                right: directUseBid,
            },
            {
                left: 0,
                mid: "손익 분기점",
                right: breakEvenBid,
            },
            ...tierRows,
            {
                left: breakEvenBid - preemptBid,
                mid: "선점",
                right: preemptBid,
            },
        ];
    }, [itemPrice, directUseBid, breakEvenBid, preemptBid]);

    const copyBidList = async () => {
        // ✅ 선점 금액만 복사
        await navigator.clipboard.writeText(String(preemptBid));

        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };



    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-neutral-50"
                title="입찰 계산기"
            >
                계산기
            </button>

            {open && (
                <div className="fixed inset-0 z-[9999]">
                    {/* dim */}
                    <div
                        className="absolute inset-0 bg-black/30"
                        onClick={() => setOpen(false)}
                    />
                    {/* modal */}
                    <div className="absolute right-6 top-20 w-[340px] rounded-2xl bg-white p-4 shadow-xl">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="text-base font-semibold">입찰 계산기</div>
                            <button
                                className="rounded-lg px-2 py-1 text-sm hover:bg-neutral-100"
                                onClick={() => setOpen(false)}
                            >
                                닫기
                            </button>
                        </div>

                        <div className="space-y-2">
                            <div>
                                <div className="mb-1 text-xs text-neutral-500">아이템 가격</div>
                                <input
                                    className="w-full rounded-xl border px-3 py-2"
                                    type="number"
                                    value={itemPrice}
                                    onChange={(e) => setItemPrice(Math.max(0, Number(e.target.value)))}
                                />
                            </div>

                            <div>
                                <div className="mb-1 text-xs text-neutral-500">판매 수수료 (5%)</div>
                                <div className="w-full rounded-xl border px-3 py-2 bg-neutral-50 text-sm">
                                    {formatGold(fee)}
                                </div>
                            </div>


                            <div className="mt-2 flex gap-2">
                                {[4, 8, 16].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setPreset(n as 4 | 8 | 16)}
                                        className={[
                                            "flex-1 rounded-xl border px-3 py-2 text-sm",
                                            preset === n ? "bg-neutral-900 text-white" : "bg-white hover:bg-neutral-50",
                                        ].join(" ")}
                                    >
                                        {n}인
                                    </button>
                                ))}
                                <button
                                    onClick={() => setPreset("custom")}
                                    className={[
                                        "flex-1 rounded-xl border px-3 py-2 text-sm",
                                        preset === "custom" ? "bg-neutral-900 text-white" : "bg-white hover:bg-neutral-50",
                                    ].join(" ")}
                                >
                                    직접
                                </button>
                            </div>

                            {preset === "custom" && (
                                <div>
                                    <div className="mb-1 text-xs text-neutral-500">인원(2~16)</div>
                                    <input
                                        className="w-full rounded-xl border px-3 py-2"
                                        type="number"
                                        value={customParty}
                                        onChange={(e) =>
                                            setCustomParty(clampInt(Number(e.target.value), 2, 16))
                                        }
                                    />
                                </div>
                            )}

                            <div className="mt-3 rounded-2xl border">
                                <div className="grid grid-cols-3 gap-2 border-b px-3 py-2 text-xs text-neutral-500">
                                    <div className="text-left">손익</div>
                                    <div className="text-center">/</div>
                                    <div className="text-right">입찰가</div>
                                </div>

                                {rows.map((r) => (
                                    <div key={r.mid} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm">
                                        <div className="text-left">{formatGold(r.left)}</div>
                                        <div className="text-center text-neutral-700">{r.mid}</div>
                                        <div className="text-right font-medium">{formatGold(r.right)}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-2 rounded-2xl border px-3 py-2 text-xs text-neutral-600">
                                <div>4인 손익분기점: <b>{formatGold(breakEven4)}</b> / 선점(÷1.1): <b>{formatGold(preempt4)}</b></div>
                                <div>현재({partySize}인) 손익분기점: <b>{formatGold(breakEvenBid)}</b> / 선점(÷1.1): <b>{formatGold(preemptBid)}</b></div>
                            </div>

                            <button
                                onClick={copyBidList}
                                className="mt-2 w-full rounded-2xl bg-neutral-900 px-3 py-3 text-sm font-semibold text-white"
                            >
                                클릭시 입찰가 복사
                            </button>
                            {copied && (
                                <div
                                    style={{
                                        marginTop: "6px",
                                        textAlign: "center",
                                        fontSize: "12px",
                                        color: "#16a34a", // 초록색
                                    }}
                                >
                                    복사되었습니다!
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
