import { describe, expect, it } from "vitest";
import { checkMuteToken, muteLinks, muteToken } from "@/lib/mute-token";

describe("mute links", () => {
  it("only work for the person and secret they were made for", () => {
    const t = muteToken("u-omar", "s1");
    expect(checkMuteToken("u-omar", t, "s1")).toBe(true);
    expect(checkMuteToken("u-aisha", t, "s1")).toBe(false);
    expect(checkMuteToken("u-omar", t, "s2")).toBe(false);
    expect(checkMuteToken("u-omar", "", "s1")).toBe(false);
    expect(checkMuteToken("u-omar", t.slice(1), "s1")).toBe(false);
  });

  it("point at the page and the one-click endpoint", () => {
    const links = muteLinks("https://ucscmsa.com", "u-omar", "s1");
    const t = muteToken("u-omar", "s1");
    expect(links.page).toBe(`https://ucscmsa.com/unsubscribe?u=u-omar&t=${t}`);
    expect(links.oneClick).toBe(`https://ucscmsa.com/api/notify/unsubscribe?u=u-omar&t=${t}`);
  });
});
