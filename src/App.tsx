import React, { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import GemTracker from "./components/GemTracker";
import TodoTracker from "./pages/TodoTracker";
import AccountPage from "./pages/AccountPage";
import GrowthPlannerPage from "./pages/GrowthPlannerPage";

const THEME_KEY = "todoTheme";

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname === to;

  return (
    <Link to={to} className={["navBtn", active ? "navBtnActive" : "navBtnIdle"].join(" ")}>
      {children}
    </Link>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const isWideSurface = pathname.startsWith("/todo") || pathname.startsWith("/growth");
  const shell = isWideSurface ? "mx-auto w-full max-w-[2000px] px-4" : "mx-auto max-w-6xl px-4";

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return (
    <div className="min-h-dvh">
      <header className="appHeader sticky top-0 z-10 backdrop-blur">
        <div className={`${shell} flex flex-wrap items-center justify-between gap-3 py-3`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-neutral-900" />
            <div className="min-w-0">
              <h1 className="appTitle truncate text-lg font-semibold">로스트아크 트래커</h1>
              <p className="appSub truncate text-sm">원정대 보석 현황 + 숙제 체크리스트 + 성장 플래너</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="navBtn navBtnIdle"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              title="테마 전환"
            >
              {theme === "dark" ? "☀️ 화이트모드" : "🌙 다크모드"}
            </button>
            <NavLink to="/account">로그인</NavLink>
            <NavLink to="/gems">보석</NavLink>
            <NavLink to="/todo">숙제</NavLink>
            <NavLink to="/growth">성장</NavLink>
          </div>
        </div>
      </header>

      <main className={`${shell} py-6`}>
        <Routes>
          <Route path="/" element={<Navigate to="/todo" replace />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/gems" element={<GemTracker />} />
          <Route path="/todo" element={<TodoTracker />} />
          <Route path="/growth" element={<GrowthPlannerPage />} />
          <Route path="*" element={<Navigate to="/todo" replace />} />
        </Routes>
      </main>

      <footer className="appFooter border-t">
        <div className={`${shell} py-4 text-sm appSub`}>
          <span className="font-medium appTitle">Tip</span> : 오늘은 성장 플래너의 첫 버전을 넣어뒀고, 다음 단계에서 OCR과
          실시간 화면 스캔을 이어붙일 수 있어.
        </div>
      </footer>
    </div>
  );
}
