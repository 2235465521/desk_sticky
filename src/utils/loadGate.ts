export type DomainPhase = "loading" | "ready" | "error";

export interface ResolvedDomain<T> {
  phase: Exclude<DomainPhase, "loading">;
  data: T | null;
  error: string | null;
}

export function resolveDomainLoad<T>(
  data: T | null | undefined,
  error: string | null | undefined,
): ResolvedDomain<T> {
  if (error || data == null) {
    const message = error?.trim() ? error.trim() : "加载失败";
    return { phase: "error", data: null, error: message };
  }
  return { phase: "ready", data, error: null };
}

export function applySaveResult(
  latestRevision: number,
  finishedRevision: number,
  ok: boolean,
): "clear" | "fail" | "ignore" {
  if (finishedRevision !== latestRevision) return "ignore";
  return ok ? "clear" : "fail";
}

export function canPersistDomain(phase: DomainPhase): boolean {
  return phase === "ready";
}

export function describeDataStatus(input: {
  todosPhase: DomainPhase;
  settingsPhase: DomainPhase;
  todosError: string | null;
  settingsError: string | null;
  monitorsError: string | null;
}): { messages: string[]; showRetry: boolean } {
  const messages: string[] = [];
  if (input.todosPhase === "loading" || input.settingsPhase === "loading") {
    messages.push("正在读取本地数据…");
  }
  if (input.todosPhase === "error") {
    messages.push(`待办没有加载成功，已停止保存，原文件未改动。${input.todosError ?? ""}`.trim());
  }
  if (input.settingsPhase === "error") {
    messages.push(
      `设置没有加载成功，已停止保存设置，原文件未改动。${input.settingsError ?? ""}`.trim(),
    );
  }
  if (input.monitorsError) {
    messages.push(`显示器列表读取失败：${input.monitorsError}`);
  }
  return {
    messages,
    showRetry:
      input.todosPhase === "error" ||
      input.settingsPhase === "error" ||
      Boolean(input.monitorsError),
  };
}
