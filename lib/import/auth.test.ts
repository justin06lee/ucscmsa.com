import { describe, expect, it } from "vitest";
import { checkImportToken } from "./auth";

const TOKEN = "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo=";

describe("checkImportToken", () => {
  it("accepts the configured token, with any Bearer casing", () => {
    expect(checkImportToken(`Bearer ${TOKEN}`, TOKEN)).toMatchObject({ ok: true });
    expect(checkImportToken(`bearer ${TOKEN}`, TOKEN)).toMatchObject({ ok: true });
  });

  it("ignores a trailing newline pasted into the env var", () => {
    expect(checkImportToken(`Bearer ${TOKEN}`, `${TOKEN}\n`)).toMatchObject({ ok: true });
  });

  it("rejects missing, malformed, wrong and prefix tokens", () => {
    for (const header of [null, "", TOKEN, `Basic ${TOKEN}`, `Bearer ${TOKEN.slice(0, -1)}`, `Bearer ${TOKEN}x`, `Bearer ${TOKEN} extra`]) {
      expect(checkImportToken(header, TOKEN)).toEqual({ ok: false, reason: "unauthorized" });
    }
  });

  it("fails closed when no usable token is configured", () => {
    for (const configured of [undefined, "", "   ", "x".repeat(31)]) {
      expect(checkImportToken(`Bearer ${configured ?? ""}`, configured)).toEqual({ ok: false, reason: "disabled" });
    }
  });

  it("names the token for rate limiting without exposing it", () => {
    const r = checkImportToken(`Bearer ${TOKEN}`, TOKEN);
    expect(r.ok && r.tokenId).toMatch(/^[0-9a-f]{16}$/);
    expect(r.ok && TOKEN.includes(r.tokenId)).toBe(false);
  });
});
