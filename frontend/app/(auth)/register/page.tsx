"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAppStore((s) => s.setAuth);
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.register(form);
      const { user, accessToken, refreshToken } = res.data;
      setAuth(user, accessToken, refreshToken);
      router.push("/home");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "회원가입 중 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "linear-gradient(160deg, #1e1040 0%, #150d30 60%, #0d1a3a 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "0 24px", gap: "24px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: "-40px", left: "-40px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(124,92,252,0.22)", filter: "blur(55px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "60px", right: "-30px", width: "130px", height: "130px", borderRadius: "50%", background: "rgba(99,102,241,0.18)", filter: "blur(45px)", pointerEvents: "none" }} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", zIndex: 1 }}>
        <div style={{
          width: "64px", height: "64px", borderRadius: "20px",
          background: "linear-gradient(135deg, #7C5CFC, #a78bfa)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 32px rgba(124,92,252,0.55)", fontSize: "26px",
        }}>📖</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0eeff" }}>회원가입</div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", marginTop: "2px" }}>새 계정을 만들어보세요</div>
        </div>
      </div>

      <div style={{
        width: "100%", zIndex: 1,
        background: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "24px", padding: "20px",
        display: "flex", flexDirection: "column", gap: "14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)", paddingLeft: "2px" }}>아이디</label>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.07)", borderRadius: "14px", padding: "7px 14px", border: "1px solid rgba(255,255,255,0.10)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.8)" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <input type="text" value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit(e)}
              placeholder="사용할 아이디를 입력하세요"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "14px", color: "#f0eeff" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)", paddingLeft: "2px" }}>비밀번호</label>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.07)", borderRadius: "14px", padding: "7px 14px", border: "1px solid rgba(255,255,255,0.10)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.8)" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input type="password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit(e)}
              placeholder="비밀번호를 입력하세요"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: "14px", color: "#f0eeff" }}
            />
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.12)", borderRadius: "12px", padding: "8px 12px", fontSize: "12px", color: "#fca5a5", textAlign: "center", border: "1px solid rgba(248,113,113,0.2)" }}>
            {error}
          </div>
        )}

        <button type="button" onClick={handleSubmit} disabled={loading} style={{
          width: "100%", padding: "9px", borderRadius: "14px", border: "none",
          background: "linear-gradient(135deg, #7C5CFC, #a78bfa)",
          color: "white", fontSize: "14px", fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.65 : 1,
          boxShadow: "0 4px 20px rgba(124,92,252,0.45)", marginTop: "2px",
        }}>
          {loading ? "가입 중..." : "가입하기"}
        </button>
      </div>

      <p style={{ textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.4)", zIndex: 1 }}>
        이미 계정이 있으신가요?{" "}
        <Link href="/login" style={{ color: "#a78bfa", fontWeight: 700 }}>로그인</Link>
      </p>
    </div>
  );
}
