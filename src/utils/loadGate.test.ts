import { describe, expect, it } from "vitest";
import { canPersistDomain, describeDataStatus, resolveDomainLoad, applySaveResult } from "./loadGate";

describe("resolveDomainLoad", () => {
  it("接受空待办列表为成功加载", () => {
    expect(resolveDomainLoad([], null)).toEqual({
      phase: "ready",
      data: [],
      error: null,
    });
  });

  it("有错误时丢弃数据，避免用默认快照覆盖原文件", () => {
    expect(resolveDomainLoad([{ id: "1" }], "解析失败")).toEqual({
      phase: "error",
      data: null,
      error: "解析失败",
    });
  });

  it("数据和错误都缺失时视为失败", () => {
    expect(resolveDomainLoad(null, null).phase).toBe("error");
  });
});

describe("applySaveResult", () => {
  it("只有最后一次保存的结果能清除或留下错误", () => {
    expect(applySaveResult(2, 1, true)).toBe("ignore");
    expect(applySaveResult(2, 2, true)).toBe("clear");
    expect(applySaveResult(2, 2, false)).toBe("fail");
  });
});

describe("canPersistDomain", () => {
  it("只有 ready 可以写盘", () => {
    expect(canPersistDomain("ready")).toBe(true);
    expect(canPersistDomain("loading")).toBe(false);
    expect(canPersistDomain("error")).toBe(false);
  });
});

describe("describeDataStatus", () => {
  it("加载中不提供重试", () => {
    const status = describeDataStatus({
      todosPhase: "loading",
      settingsPhase: "loading",
      todosError: null,
      settingsError: null,
      monitorsError: null,
    });
    expect(status.showRetry).toBe(false);
    expect(status.messages).toEqual(["正在读取本地数据…"]);
  });

  it("设置失败时说明原文件未改动，并允许重试", () => {
    const status = describeDataStatus({
      todosPhase: "ready",
      settingsPhase: "error",
      todosError: null,
      settingsError: "解析数据文件失败",
      monitorsError: null,
    });
    expect(status.showRetry).toBe(true);
    expect(status.messages[0]).toContain("原文件未改动");
    expect(status.messages[0]).toContain("解析数据文件失败");
  });
});
