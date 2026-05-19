import React, { Suspense, lazy, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

const GemTracker = lazy(() => import("./components/GemTracker"));
const TodoTracker = lazy(() => import("./pages/TodoTracker"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const GrowthPlannerPage = lazy(() => import("./pages/GrowthPlannerPage"));

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
        <div className={`${shell} appHeaderInner py-3`}>
          <div className="appHeaderTools">
            <button
              className="navBtn navBtnIdle"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              title="테마 전환"
            >
              {theme === "dark" ? "화이트" : "다크"}
            </button>
            <NavLink to="/account">로그인</NavLink>
          </div>

          <div className="appBrand">
            <div className="appLogo" />
            <div className="min-w-0">
              <h1 className="appTitle truncate text-lg font-semibold">로스트아크 트래커</h1>
              <p className="appSub truncate text-sm">숙제 체크리스트, 일정표, 성장 플래너</p>
            </div>
          </div>

          <div className="appNav">
            <NavLink to="/gems">보석</NavLink>
            <NavLink to="/todo">숙제</NavLink>
            <NavLink to="/growth">성장</NavLink>
          </div>
        </div>
      </header>

      <main className={`${shell} py-6`}>
        <Suspense fallback={<div className="rounded-xl border p-4 text-sm appSub">불러오는 중...</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/todo" replace />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/gems" element={<GemTracker />} />
            <Route path="/todo" element={<TodoTracker />} />
            <Route path="/growth" element={<GrowthPlannerPage />} />
            <Route path="*" element={<Navigate to="/todo" replace />} />
          </Routes>
        </Suspense>
      </main>

      <footer className="appFooter border-t">
        <div className={`${shell} py-4 text-sm appSub`}>
          <span className="font-medium appTitle">Tip</span> : 성장 플래너에서 목표 레벨과 전투력 목표를 함께 계산할 수 있어.
        </div>
      </footer>
    </div>
  );
}
