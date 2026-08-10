import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/redirect";

describe("safeNext", () => {
  it("keeps internal paths", () => {
    expect(safeNext("/report")).toBe("/report");
    expect(safeNext("/incident/abc?x=1")).toBe("/incident/abc?x=1");
  });
  it("rejects external and protocol-relative values", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
  });
  it("falls back when null", () => {
    expect(safeNext(null)).toBe("/");
  });
});
