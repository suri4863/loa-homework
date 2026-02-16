import React from "react";
import GemTracker from "./components/GemTracker";
import TodoTracker from "./pages/TodoTracker";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname === to;

  return (
    <Link
      to={to}
      className={[
        "navBtn",
        active ? "navBtnActive" : "navBtnIdle",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const isTodo = pathname.startsWith("/todo");

  // ✅ 숙제(/todo) 화면은 더 넓은 컨테이너 허용
  const shell = isTodo ? "mx-auto w-full max-w-[2000px] px-4" : "mx-auto max-w-6xl px-4";

  return (
    <div className="min-h-dvh">
      {/* ✅ 헤더 */}
      <header className="appHeader sticky top-0 z-10 backdrop-blur">
        <div className={`${shell} flex items-center justify-between gap-3 py-3`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-neutral-900" />
            <div className="min-w-0">
              <h1 className="appTitle truncate text-lg font-semibold">로스트아크 트래커</h1>
              <p className="appSub truncate text-sm">보석 현황 + 숙제 체크리스트(일일/주간 리셋)</p>
            </div>
          </div>

          <nav className="flex gap-2">
            <NavLink to="/gems">보석</NavLink>
            <NavLink to="/todo">숙제</NavLink>
          </nav>
        </div>
      </header>

      <main className={`${shell} py-6`}>
        <Routes>
          <Route path="/" element={<Navigate to="/todo" replace />} />
          <Route path="/gems" element={<GemTracker />} />
          <Route path="/todo" element={<TodoTracker />} />
          <Route path="*" element={<Navigate to="/todo" replace />} />
        </Routes>
      </main>

      <footer className="appFooter border-t">
        <div className={`${shell} py-4 text-sm appSub`}>
          <span className="font-medium appTitle">Tip</span> : 데이터는 브라우저에 자동 저장(localStorage). 보석 탭은
          “개수/시세 입력 → 가치 자동 계산”, 숙제 탭은 “일일 6시 / 주간 수요일 6시 자동 초기화”.
        </div>
      </footer>
    </div>
  );
}
