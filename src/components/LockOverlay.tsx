import { Key, Lock, LockOpen } from "@phosphor-icons/react";
import { useState } from "react";

interface LockOverlayProps {
  mode: "unlock" | "setup";
  onUnlock: (password: string) => Promise<boolean>;
  onSavePassword: (password: string) => Promise<void>;
  onCancelSetup: () => void;
}

export function LockOverlay({
  mode,
  onUnlock,
  onSavePassword,
  onCancelSetup,
}: LockOverlayProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!password) {
      setError("请输入密码");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "unlock") {
        const ok = await onUnlock(password);
        if (!ok) {
          setError("密码错误，请重试");
          setPassword("");
        }
      } else {
        if (password.length < 4) {
          setError("密码至少需要 4 位");
          setSubmitting(false);
          return;
        }
        if (password !== confirm) {
          setError("两次输入的密码不一致");
          setSubmitting(false);
          return;
        }
        await onSavePassword(password);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 py-4">
      <div
        className="w-full p-4 rounded-xl border flex flex-col items-center text-center gap-3"
        style={{
          backgroundColor: "var(--surface-card)",
          borderColor: "var(--border-primary)",
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            backgroundColor: "var(--action-primary)",
            color: "var(--text-inverted)",
          }}
        >
          {mode === "unlock" ? <Lock size={18} weight="fill" /> : <Key size={18} weight="fill" />}
        </div>

        <div>
          <p className="title-4" style={{ color: "var(--text-primary)" }}>
            {mode === "unlock" ? "便利贴已锁定" : "设置锁屏密码"}
          </p>
          <p className="caption-5 mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {mode === "unlock" ? "输入密码以查看和编辑待办" : "设置后点击锁图标即可锁定便利贴"}
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="w-full flex flex-col gap-2">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "unlock" ? "输入密码" : "输入新密码（至少 4 位）"}
            className="body-6 w-full px-3 py-1.5 rounded-lg border outline-none select-text"
            style={{
              backgroundColor: "var(--surface-input-focus)",
              borderColor: error ? "var(--border-error)" : "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          />

          {mode === "setup" && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再次确认密码"
              className="body-6 w-full px-3 py-1.5 rounded-lg border outline-none select-text"
              style={{
                backgroundColor: "var(--surface-input-focus)",
                borderColor: error ? "var(--border-error)" : "var(--border-primary)",
                color: "var(--text-primary)",
              }}
            />
          )}

          {error && (
            <p className="caption-5 text-left" style={{ color: "var(--text-error)" }}>
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 mt-1">
            {mode === "setup" && (
              <button
                type="button"
                onClick={onCancelSetup}
                className="interactive-btn button-xsm flex-1 py-1.5 rounded-lg border"
                style={{
                  backgroundColor: "var(--action-secondary)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                取消
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="interactive-btn button-xsm flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1"
              style={{
                backgroundColor: "var(--action-primary)",
                color: "var(--text-inverted)",
              }}
            >
              <LockOpen size={13} weight="bold" />
              {mode === "unlock" ? "解锁" : "保存并锁定"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
