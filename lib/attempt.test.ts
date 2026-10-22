import { describe, expect, it } from "vitest";
import { attempt, errorText, GENERIC_ERROR, OFFLINE_ERROR } from "./attempt";

describe("attempt", () => {
  it("passes a result through", async () => {
    expect(await attempt(async () => ({ ok: true, id: "a" }))).toEqual({ ok: true, value: { ok: true, id: "a" } });
  });

  it("counts an action that returns nothing as done", async () => {
    expect(await attempt(async () => undefined)).toEqual({ ok: true, value: undefined });
  });

  it("turns { ok: false } into a sentence", async () => {
    expect(await attempt(async () => ({ ok: false, error: "not_found" }))).toEqual({
      ok: false,
      error: "That no longer exists. Reload the page.",
      code: "not_found",
    });
    expect(await attempt(async () => ({ ok: false, error: "Event not found" }))).toEqual({
      ok: false,
      error: "Event not found",
      code: "Event not found",
    });
  });

  it("treats a throw (the network, a 500) as a failure, never an exception", async () => {
    expect(
      await attempt(async () => {
        throw new Error("fetch failed");
      }),
    ).toEqual({ ok: false, error: OFFLINE_ERROR });
  });
});

describe("errorText", () => {
  it("never shows a bare code it doesn't know", () => {
    expect(errorText("weird_code")).toBe(GENERIC_ERROR);
    expect(errorText(undefined)).toBe(GENERIC_ERROR);
  });
});
