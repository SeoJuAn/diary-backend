"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAppStore } from "@/store/useAppStore";

export default function LoginPage() {
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
      const res = await authApi.login(form);
      const { user, accessToken, refreshToken } = res.data;
      setAuth(user, accessToken, refreshToken);
      router.push("/record");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "로그인 중 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-dvh px-6 pt-20 pb-10" style={{ backgroundColor: "var(--color-bg)" }}>
      <div className="flex flex-col items-center mb-12">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-md"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <span className="text-white text-2xl">📖</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">다이어리</h1>
        <p className="text-sm text-gray-500 mt-1">AI와 함께하는 하루 기록</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            아이디
          </label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="아이디를 입력하세요"
            required
            className="w-full px-4 py-3.5 rounded-2xl bg-white text-gray-900 text-sm outline-none transition-all"
            style={{ border: "1.5px solid var(--color-border)" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            비밀번호
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="비밀번호를 입력하세요"
            required
            className="w-full px-4 py-3.5 rounded-2xl bg-white text-gray-900 text-sm outline-none transition-all"
            style={{ border: "1.5px solid var(--color-border)" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
          />
        </div>

        {error && (
          <p className="text-sm text-red-500 text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 rounded-2xl text-white font-semibold text-base mt-2 transition-opacity disabled:opacity-60"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        아직 계정이 없으신가요?{" "}
        <Link
          href="/register"
          className="font-semibold"
          style={{ color: "var(--color-primary)" }}
        >
          회원가입
        </Link>
      </p>
    </div>
  );
}
