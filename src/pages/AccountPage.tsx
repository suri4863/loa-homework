import { useEffect, useMemo, useState } from "react";
import "./AccountPage.css";
import { DEFAULT_TODO_STATE, exportStateToJson, importStateFromJson } from "../store/todoStore";

const AUTH_TOKEN_KEY = "loa-auth-token:v1";
const AUTH_LOGIN_ID_KEY = "loa-auth-login-id:v1";

type AccessMode = "account" | "friendCode";
type AuthMode = "signIn" | "signUp";

type AccountInfo = {
  friendCode: string;
  nickname?: string | null;
  loginId?: string;
  shareMode?: "PUBLIC" | "PRIVATE" | string;
  hasBackup?: boolean;
  backupUpdatedAt?: string | null;
  legacyLoginAllowed?: boolean;
};

type LegacyLinkInfo = {
  friendCode: string;
  nickname?: string | null;
  hasBackup?: boolean;
  updatedAt?: string | null;
};

type FriendCodeAccessInfo = {
  friendCode: string;
  hasBackup: boolean;
  backupUpdatedAt?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

export default function AccountPage() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY) ?? "");
  const [signedInLoginId, setSignedInLoginId] = useState(() => localStorage.getItem(AUTH_LOGIN_ID_KEY) ?? "");
  const [accessMode, setAccessMode] = useState<AccessMode>("account");
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [authId, setAuthId] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [friendCodeLogin, setFriendCodeLogin] = useState("");
  const [friendCodeBusy, setFriendCodeBusy] = useState(false);
  const [friendCodeMessage, setFriendCodeMessage] = useState("");
  const [friendCodeAccess, setFriendCodeAccess] = useState<FriendCodeAccessInfo | null>(null);
  const [restoreCode, setRestoreCode] = useState("");
  const [legacyCode, setLegacyCode] = useState("");
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyLoginAllowed, setLegacyLoginAllowed] = useState(true);
  const [legacyLinkInfo, setLegacyLinkInfo] = useState<LegacyLinkInfo | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [resetDataBusy, setResetDataBusy] = useState(false);
  const [resetDataMessage, setResetDataMessage] = useState("");
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);

  const profile = useMemo(() => DEFAULT_TODO_STATE.load()?.profile ?? DEFAULT_TODO_STATE.make().profile, []);
  const isLoggedIn = Boolean(authToken);

  async function authedFetch(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers || {});
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    headers.set("x-friend-code", accountInfo?.friendCode || profile.friendCode);
    headers.set(
      "x-nickname",
      encodeURIComponent(
        (accountInfo?.nickname || profile.nickname || accountInfo?.friendCode || profile.friendCode || "").trim()
      )
    );
    if (authToken) headers.set("Authorization", `Bearer ${authToken}`);

    const res = await fetch(path, { ...init, headers });
    const ct = res.headers.get("content-type") || "";
    const payload = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error((payload as any)?.error || (payload as any)?.message || String(payload || res.statusText || `HTTP ${res.status}`));
    }
    return payload;
  }

  async function fetchWithFriendCode(path: string, friendCode: string, password: string, init?: RequestInit) {
    const headers = new Headers(init?.headers || {});
    headers.set("Content-Type", "application/json");
    headers.set("x-friend-code", friendCode);
    headers.set("x-nickname", encodeURIComponent(profile.nickname || friendCode));

    const res = await fetch(path, {
      ...init,
      headers,
      body: init?.body ?? JSON.stringify({ password }),
    });
    const ct = res.headers.get("content-type") || "";
    const payload = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error((payload as any)?.error || (payload as any)?.message || String(payload || res.statusText || `HTTP ${res.status}`));
    }
    return payload;
  }

  async function refreshAccount() {
    if (!authToken) {
      setAccountInfo(null);
      return;
    }
    const data = (await authedFetch("/api/me/account")) as AccountInfo;
    setAccountInfo(data);
    setLegacyLoginAllowed(data.legacyLoginAllowed !== false);
    if (data.loginId) {
      setSignedInLoginId(String(data.loginId));
      localStorage.setItem(AUTH_LOGIN_ID_KEY, String(data.loginId));
    }
  }

  useEffect(() => {
    refreshAccount().catch(() => {
      setAccountInfo(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  function applyStateJson(stateJson: string, friendCode: string, nickname?: string | null) {
    const nextState = importStateFromJson(stateJson);
    DEFAULT_TODO_STATE.save({
      ...nextState,
      profile: {
        ...nextState.profile,
        friendCode,
        nickname: nickname ?? nextState.profile.nickname,
      },
    });
  }

  async function submitAuth() {
    const loginId = authId.trim();
    if (!loginId) {
      setAuthMessage("아이디를 입력해줘.");
      return;
    }
    if (authPassword.length < 6) {
      setAuthMessage("비밀번호는 6자 이상이어야 해.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage("");
    try {
      const res = await fetch(authMode === "signUp" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId,
          password: authPassword,
          friendCode: profile.friendCode,
          nickname: profile.nickname ?? "",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || res.statusText || `HTTP ${res.status}`);

      const nextToken = String(data?.token ?? "");
      const nextLoginId = String(data?.user?.loginId ?? loginId);
      localStorage.setItem(AUTH_TOKEN_KEY, nextToken);
      localStorage.setItem(AUTH_LOGIN_ID_KEY, nextLoginId);
      setAuthToken(nextToken);
      setSignedInLoginId(nextLoginId);
      setAuthPassword("");
      setAuthMessage(authMode === "signUp" ? "회원가입이 완료됐어." : "아이디 로그인에 성공했어.");
      await refreshAccount();
    } catch (e: any) {
      setAuthMessage(e?.message || String(e));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (authToken) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => null);
    }

    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_LOGIN_ID_KEY);
    setAuthToken("");
    setSignedInLoginId("");
    setAccountInfo(null);
    setLegacyLinkInfo(null);
    setAuthMessage("");
    setResetMessage("");
  }

  async function signInWithFriendCode() {
    const friendCode = friendCodeLogin.trim();
    const password = backupPassword.trim();
    if (!friendCode) {
      setFriendCodeMessage("FC 코드를 입력해줘.");
      return;
    }
    if (!password) {
      setFriendCodeMessage("서버 백업 비밀번호를 입력해줘.");
      return;
    }

    setFriendCodeBusy(true);
    setFriendCodeMessage("");
    try {
      const data = (await fetchWithFriendCode("/api/me/state-backup", friendCode, password, {
        method: "POST",
      })) as any;
      setFriendCodeAccess({
        friendCode,
        hasBackup: true,
        backupUpdatedAt: data?.updatedAt ?? null,
      });
      setRestoreCode(friendCode);
      setLegacyCode(friendCode);
      setFriendCodeMessage("백업 정보를 확인했어.");
    } catch (e: any) {
      setFriendCodeAccess(null);
      setFriendCodeMessage(e?.message || String(e));
    } finally {
      setFriendCodeBusy(false);
    }
  }

  async function uploadBackupToServer() {
    const password = backupPassword.trim();
    if (!password) {
      alert("서버 백업 비밀번호를 입력해줘.");
      return;
    }
    const state = DEFAULT_TODO_STATE.load() ?? DEFAULT_TODO_STATE.make();
    await authedFetch("/api/me/state-backup", {
      method: "PUT",
      body: JSON.stringify({
        password,
        stateJson: exportStateToJson(state),
      }),
    });
    await refreshAccount();
    alert("서버 백업 업로드를 마쳤어.");
  }

  async function downloadBackupFromServer() {
    const password = backupPassword.trim();
    if (!password) {
      alert("서버 백업 비밀번호를 입력해줘.");
      return;
    }
    const data = (await authedFetch("/api/me/state-backup", {
      method: "POST",
      body: JSON.stringify({ password }),
    })) as any;
    applyStateJson(String(data?.stateJson ?? ""), accountInfo?.friendCode || profile.friendCode, accountInfo?.nickname);
    alert("내 계정 백업을 불러왔어.");
  }

  async function uploadBackupWithFriendCode() {
    const friendCode = (restoreCode || friendCodeLogin).trim();
    const password = backupPassword.trim();
    if (!friendCode) {
      alert("FC 코드를 입력해줘.");
      return;
    }
    if (!password) {
      alert("서버 백업 비밀번호를 입력해줘.");
      return;
    }

    const state = DEFAULT_TODO_STATE.load() ?? DEFAULT_TODO_STATE.make();
    await fetchWithFriendCode("/api/me/state-backup", friendCode, password, {
      method: "PUT",
      body: JSON.stringify({
        password,
        stateJson: exportStateToJson(state),
      }),
    });
    setFriendCodeAccess({
      friendCode,
      hasBackup: true,
      backupUpdatedAt: new Date().toISOString(),
    });
    setRestoreCode(friendCode);
    setLegacyCode(friendCode);
    alert("FC 코드 기준 서버 업로드를 마쳤어.");
  }

  async function downloadBackupWithFriendCode() {
    const friendCode = (restoreCode || friendCodeLogin).trim();
    const password = backupPassword.trim();
    if (!friendCode) {
      alert("FC 코드를 입력해줘.");
      return;
    }
    if (!password) {
      alert("서버 백업 비밀번호를 입력해줘.");
      return;
    }

    const data = (await fetchWithFriendCode("/api/me/state-backup", friendCode, password, {
      method: "POST",
    })) as any;
    applyStateJson(String(data?.stateJson ?? ""), friendCode);
    setFriendCodeAccess({
      friendCode,
      hasBackup: true,
      backupUpdatedAt: data?.updatedAt ?? null,
    });
    setRestoreCode(friendCode);
    setLegacyCode(friendCode);
    alert("FC 코드 서버 백업을 불러왔어.");
  }

  async function requestLegacyLink(action: "verify" | "load" | "claim") {
    if (!isLoggedIn) {
      alert("먼저 아이디로 로그인해줘.");
      return;
    }

    const friendCode = legacyCode.trim();
    const password = backupPassword.trim();
    if (!friendCode) {
      alert("FC 코드를 입력해줘.");
      return;
    }
    if (!password) {
      alert("서버 백업 비밀번호를 입력해줘.");
      return;
    }

    setLegacyBusy(true);
    try {
      const data = (await authedFetch("/api/me/link-legacy", {
        method: "POST",
        body: JSON.stringify({
          friendCode,
          password,
          action,
          legacyLoginAllowed,
        }),
      })) as any;

      if (action === "load") {
        applyStateJson(String(data?.stateJson ?? ""), friendCode, data?.nickname);
        alert("연동된 기존 데이터를 불러왔어.");
        return;
      }

      setLegacyLinkInfo({
        friendCode,
        nickname: data?.nickname ?? null,
        hasBackup: data?.hasBackup,
        updatedAt: data?.updatedAt ?? null,
      });

      if (action === "claim") {
        const nextToken = String(data?.token ?? "");
        if (nextToken) {
          localStorage.setItem(AUTH_TOKEN_KEY, nextToken);
          setAuthToken(nextToken);
        }
        if (data?.stateJson) {
          applyStateJson(String(data.stateJson), friendCode, data?.nickname);
        }
        setFriendCodeAccess({
          friendCode,
          hasBackup: Boolean(data?.hasBackup),
          backupUpdatedAt: data?.updatedAt ?? null,
        });
        await refreshAccount();
        alert("이 계정에 기존 FC 데이터를 귀속했어.");
      }
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setLegacyBusy(false);
    }
  }

  async function changePassword() {
    if (!isLoggedIn) return;
    if (resetPassword.trim().length < 6) {
      setResetMessage("비밀번호는 6자 이상으로 입력해줘.");
      return;
    }

    try {
      await authedFetch("/api/auth/password", {
        method: "PUT",
        body: JSON.stringify({ password: resetPassword }),
      });
      setResetPassword("");
      setResetMessage("비밀번호를 변경했어.");
    } catch (e: any) {
      setResetMessage(e?.message || String(e));
    }
  }

  async function deleteAccount() {
    if (!isLoggedIn) return;
    if (!deletePassword) {
      setDeleteMessage("비밀번호를 입력해줘.");
      return;
    }
    const ok = confirm(
      "회원탈퇴를 진행할까요? 서버의 계정, 친구 관계, 공유 일정표, 남은 레이드 스냅샷, 서버 백업이 삭제돼."
    );
    if (!ok) return;

    setDeleteBusy(true);
    setDeleteMessage("");
    try {
      await authedFetch("/api/auth/delete-account", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword }),
      });
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_LOGIN_ID_KEY);
      setAuthToken("");
      setSignedInLoginId("");
      setAccountInfo(null);
      setLegacyLinkInfo(null);
      setDeletePassword("");
      setDeleteMessage("회원탈퇴가 완료됐어.");
    } catch (e: any) {
      setDeleteMessage(e?.message || String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  function clearLocalAppStorage() {
    const prefixes = [
      "loa-weekly-raid-pick:v1:",
      "todoMemo:v1:",
      "loa-account-daily:v1:",
      "loa-life-energy:v1:",
    ];
    const exactKeys = [
      "loa-include-bound-gold:v1",
      "friendsDockOpen:v1",
      "loa-today-must-do-settings:v1",
      "loa-weekly-must-do-settings:v1",
    ];

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (exactKeys.includes(key) || prefixes.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
  }

  async function resetAppData() {
    const ok = confirm(
      isLoggedIn
        ? "데이터를 초기화할까요? 현재 브라우저 데이터와 서버의 백업/스냅샷/공유 일정표가 삭제돼. 계정과 친구 관계는 유지돼."
        : "현재 브라우저의 앱 데이터를 초기화할까요? 계정/FC 정보는 유지돼."
    );
    if (!ok) return;

    setResetDataBusy(true);
    setResetDataMessage("");
    try {
      if (isLoggedIn) {
        await authedFetch("/api/me/reset-data", { method: "DELETE" });
      }

      const current = DEFAULT_TODO_STATE.load() ?? DEFAULT_TODO_STATE.make();
      const next = DEFAULT_TODO_STATE.make();
      DEFAULT_TODO_STATE.save({
        ...next,
        profile: {
          ...next.profile,
          friendCode: accountInfo?.friendCode || current.profile.friendCode || profile.friendCode,
          nickname: accountInfo?.nickname ?? current.profile.nickname,
          shareMode:
            accountInfo?.shareMode === "PUBLIC" || accountInfo?.shareMode === "PRIVATE"
              ? accountInfo.shareMode
              : current.profile.shareMode,
        },
      });
      clearLocalAppStorage();
      setFriendCodeAccess(null);
      setLegacyLinkInfo(null);
      setResetDataMessage("데이터를 초기화했어. 열려 있던 숙제 화면은 새로고침하면 바로 반영돼.");
      await refreshAccount().catch(() => null);
    } catch (e: any) {
      setResetDataMessage(e?.message || String(e));
    } finally {
      setResetDataBusy(false);
    }
  }

  function moveFriendCodeToAccount(nextAuthMode: AuthMode) {
    setAccessMode("account");
    setAuthMode(nextAuthMode);
    setLegacyCode((restoreCode || friendCodeLogin).trim());
    setAuthMessage("로그인 후 아래에서 기존 FC 데이터를 바로 연동할 수 있어.");
  }

  const linkedWithCurrentAccount = Boolean(friendCodeAccess?.friendCode && accountInfo?.friendCode === friendCodeAccess.friendCode);

  return (
    <div className="accountPage">
      <section className="accountCard">
        <div className="accountCardHead">
          <div>
            <h2>로그인</h2>
            <div className="accountCardSub">아이디 계정 로그인과 FC 코드 백업 접근을 분리해서 쓸 수 있어.</div>
          </div>
          {isLoggedIn && (
            <button className="accountAction" onClick={signOut}>
              로그아웃
            </button>
          )}
        </div>

        <div className="accessSwitch">
          <button className={accessMode === "account" ? "active" : ""} onClick={() => setAccessMode("account")}>
            아이디로 로그인하기
          </button>
          <button className={accessMode === "friendCode" ? "active" : ""} onClick={() => setAccessMode("friendCode")}>
            FC 코드로 로그인하기
          </button>
        </div>

        {accessMode === "account" ? (
          <div className="accountGrid">
            {!isLoggedIn ? (
              <section className="accountBox">
                <div className="accountBoxTitle">회원 계정 로그인</div>
                <div className="accountSwitch">
                  <button className={authMode === "signIn" ? "active" : ""} onClick={() => setAuthMode("signIn")}>
                    로그인
                  </button>
                  <button className={authMode === "signUp" ? "active" : ""} onClick={() => setAuthMode("signUp")}>
                    회원가입
                  </button>
                </div>
                <div className="accountStack">
                  <input value={authId} onChange={(e) => setAuthId(e.target.value)} placeholder="아이디" />
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="비밀번호"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitAuth();
                    }}
                  />
                  <button className="accountPrimary" onClick={submitAuth} disabled={authBusy}>
                    {authBusy ? "처리 중..." : authMode === "signIn" ? "로그인" : "회원가입"}
                  </button>
                  {authMessage && <div className="accountHint">{authMessage}</div>}
                </div>
              </section>
            ) : (
              <>
                <section className="accountBox">
                  <div className="accountBoxTitle">내 계정</div>
                  <div className="accountInfoRow">
                    <span>로그인 ID</span>
                    <strong>{signedInLoginId || "-"}</strong>
                  </div>
                  <div className="accountInfoRow">
                    <span>연동된 FC 코드</span>
                    <strong>{accountInfo?.friendCode || "-"}</strong>
                  </div>
                  <div className="accountInfoRow">
                    <span>서버 백업</span>
                    <strong>{accountInfo?.hasBackup ? "올라가 있음" : "없음"}</strong>
                  </div>
                  <div className="accountInfoRow">
                    <span>백업 날짜</span>
                    <strong>{formatDateTime(accountInfo?.backupUpdatedAt)}</strong>
                  </div>
                  {friendCodeAccess && (
                    <div className="accountStatus">
                      {linkedWithCurrentAccount
                        ? `FC ${friendCodeAccess.friendCode}는 현재 계정과 연동되어 있어.`
                        : `FC ${friendCodeAccess.friendCode}는 아직 현재 계정과 연동되지 않았어.`}
                    </div>
                  )}
                </section>

                <section className="accountBox">
                  <div className="accountBoxTitle">비밀번호 재설정</div>
                  <div className="accountStack">
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="새 비밀번호"
                    />
                    <button className="accountPrimary" onClick={changePassword}>
                      비밀번호 변경
                    </button>
                    {resetMessage && <div className="accountHint">{resetMessage}</div>}
                  </div>
                </section>

                <section className="accountBox">
                  <div className="accountBoxTitle">데이터 초기화</div>
                  <div className="accountHint">
                    계정과 친구 관계는 유지하고, 로컬 앱 데이터와 서버 백업/스냅샷/공유 일정표를 기본 상태로 되돌려.
                  </div>
                  <div className="accountStack">
                    <button className="accountAction" onClick={resetAppData} disabled={resetDataBusy}>
                      {resetDataBusy ? "초기화 중..." : "데이터 초기화"}
                    </button>
                    {resetDataMessage && <div className="accountHint">{resetDataMessage}</div>}
                  </div>
                </section>

                <section className="accountBox">
                  <div className="accountBoxTitle">회원탈퇴</div>
                  <div className="accountHint">
                    탈퇴하면 서버에 저장된 계정, 친구 관계, 공유 일정표, 남은 레이드 스냅샷, 서버 백업이 삭제돼.
                  </div>
                  <div className="accountStack">
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="현재 비밀번호"
                    />
                    <button className="accountAction" onClick={deleteAccount} disabled={deleteBusy}>
                      {deleteBusy ? "탈퇴 처리 중..." : "회원탈퇴"}
                    </button>
                    {deleteMessage && <div className="accountHint">{deleteMessage}</div>}
                  </div>
                </section>

                <section className="accountBox">
                  <div className="accountBoxTitle">기존 FC 데이터 연동</div>
                  <div className="accountStack">
                    <input
                      value={legacyCode}
                      onChange={(e) => {
                        setLegacyCode(e.target.value);
                        setLegacyLinkInfo(null);
                      }}
                      placeholder="FC 코드"
                    />
                    <input
                      type="password"
                      value={backupPassword}
                      onChange={(e) => setBackupPassword(e.target.value)}
                      placeholder="서버 백업 비밀번호"
                    />
                    <button className="accountPrimary" onClick={() => requestLegacyLink("verify")} disabled={legacyBusy}>
                      연동하기
                    </button>
                    {legacyLinkInfo && (
                      <>
                        <div className="accountHint">
                          {legacyLinkInfo.friendCode} 확인됨
                          {legacyLinkInfo.updatedAt ? ` · 백업 ${formatDateTime(legacyLinkInfo.updatedAt)}` : ""}
                        </div>
                        <button
                          className="accountAction"
                          onClick={() => requestLegacyLink("load")}
                          disabled={legacyBusy || !legacyLinkInfo.hasBackup}
                        >
                          연동된 기존 데이터 불러오기
                        </button>
                        <button className="accountAction" onClick={() => requestLegacyLink("claim")} disabled={legacyBusy}>
                          이 계정에 기존 데이터를 귀속하기
                        </button>
                        <label className="accountCheck">
                          <input
                            type="checkbox"
                            checked={legacyLoginAllowed}
                            onChange={(e) => setLegacyLoginAllowed(e.target.checked)}
                          />
                          <span>기존 코드 로그인도 허용</span>
                        </label>
                      </>
                    )}
                  </div>
                </section>
              </>
            )}

            <section className="accountBox">
              <div className="accountBoxTitle">서버 백업</div>
              <div className="accountHint">로그인 전에도 FC 코드와 서버 백업 비밀번호로 바로 복원하거나 업로드할 수 있어.</div>
              <div className="accountStack">
                <input
                  value={restoreCode}
                  onChange={(e) => {
                    setRestoreCode(e.target.value);
                    if (!friendCodeLogin) setFriendCodeLogin(e.target.value);
                  }}
                  placeholder="내 FC 코드"
                />
                <input
                  type="password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  placeholder="서버 백업 비밀번호"
                />
                <button className="accountAction" onClick={() => downloadBackupWithFriendCode().catch((e) => alert(String(e)))}>
                  이 코드로 서버 복원
                </button>
                <div className="accountButtonRow">
                  <button className="accountAction" onClick={() => uploadBackupWithFriendCode().catch((e) => alert(String(e)))}>
                    서버 업로드
                  </button>
                  {isLoggedIn ? (
                    <button className="accountAction" onClick={() => downloadBackupFromServer().catch((e) => alert(String(e)))}>
                      서버 다운로드
                    </button>
                  ) : (
                    <button className="accountAction" onClick={() => downloadBackupWithFriendCode().catch((e) => alert(String(e)))}>
                      서버 다운로드
                    </button>
                  )}
                </div>
                <div className="accountHint">
                  최신 백업 날짜: {formatDateTime(isLoggedIn ? accountInfo?.backupUpdatedAt : friendCodeAccess?.backupUpdatedAt)}
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="accountGrid">
            <section className="accountBox">
              <div className="accountBoxTitle">FC 코드 로그인</div>
              <div className="accountHint">회원가입 전에도 내 FC 코드와 서버 백업 비밀번호로 백업 상태를 확인할 수 있어.</div>
              <div className="accountStack">
                <input value={friendCodeLogin} onChange={(e) => setFriendCodeLogin(e.target.value)} placeholder="내 FC 코드" />
                <input
                  type="password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  placeholder="서버 백업 비밀번호"
                />
                <button className="accountPrimary" onClick={signInWithFriendCode} disabled={friendCodeBusy}>
                  {friendCodeBusy ? "확인 중..." : "FC 코드로 로그인"}
                </button>
                {friendCodeMessage && <div className="accountHint">{friendCodeMessage}</div>}
              </div>
            </section>

            <section className="accountBox">
              <div className="accountBoxTitle">FC 코드 백업</div>
              {friendCodeAccess ? (
                <>
                  <div className="accountInfoRow">
                    <span>접근 중인 FC 코드</span>
                    <strong>{friendCodeAccess.friendCode}</strong>
                  </div>
                  <div className="accountInfoRow">
                    <span>백업 상태</span>
                    <strong>{friendCodeAccess.hasBackup ? "백업 있음" : "백업 없음"}</strong>
                  </div>
                  <div className="accountInfoRow">
                    <span>백업 날짜</span>
                    <strong>{formatDateTime(friendCodeAccess.backupUpdatedAt)}</strong>
                  </div>
                </>
              ) : (
                <div className="accountHint">로그인하면 백업 날짜와 연동 상태가 여기 보일 거야.</div>
              )}
              <div className="accountButtonRow">
                <button className="accountAction" onClick={() => downloadBackupWithFriendCode().catch((e) => alert(String(e)))}>
                  서버 백업 다운로드
                </button>
                <button className="accountAction" onClick={() => uploadBackupWithFriendCode().catch((e) => alert(String(e)))}>
                  현재 상태 서버 업로드
                </button>
              </div>
            </section>

            <section className="accountBox">
              <div className="accountBoxTitle">회원 계정 연동</div>
              {isLoggedIn ? (
                <div className="accountStatus">
                  이미 <strong>{signedInLoginId}</strong> 계정으로 로그인되어 있어. 같은 FC 코드를 넣고 기존 FC 데이터 연동을 진행하면 돼.
                </div>
              ) : (
                <>
                  <div className="accountStatus">아직 회원 계정과 연동되지 않았어.</div>
                  <div className="accountButtonRow">
                    <button className="accountAction" onClick={() => moveFriendCodeToAccount("signUp")}>
                      회원가입 하러가기
                    </button>
                    <button className="accountAction" onClick={() => moveFriendCodeToAccount("signIn")}>
                      내 계정과 연동하기
                    </button>
                  </div>
                </>
              )}
            </section>
            <section className="accountBox">
              <div className="accountBoxTitle">데이터 초기화</div>
              <div className="accountHint">
                현재 브라우저의 앱 데이터를 기본 상태로 되돌려. FC 코드와 로그인 정보는 유지돼.
              </div>
              <button className="accountAction" onClick={resetAppData} disabled={resetDataBusy}>
                {resetDataBusy ? "초기화 중..." : "데이터 초기화"}
              </button>
              {resetDataMessage && <div className="accountHint">{resetDataMessage}</div>}
            </section>

            <section className="accountBox">
              <div className="accountBoxTitle">회원탈퇴</div>
              <div className="accountHint">
                회원탈퇴는 아이디/비밀번호 회원 계정으로 로그인한 뒤 진행할 수 있어. FC 코드 백업 접근은 회원 계정 로그인이 아니라서 여기서는 탈퇴 버튼이 비활성화돼.
              </div>
              <button className="accountAction" onClick={() => moveFriendCodeToAccount("signIn")}>
                아이디 로그인으로 이동
              </button>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
