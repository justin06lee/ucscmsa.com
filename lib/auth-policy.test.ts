import { describe, expect, it } from "vitest";
import { isAllowedGoogleSignIn, isAllowedSignIn, parseEmailList } from "./auth-policy";

const ucsc = { email: "slug@ucsc.edu", email_verified: true, hd: "ucsc.edu" };

describe("isAllowedGoogleSignIn", () => {
  it("allows a verified account in UCSC's Workspace", () => {
    expect(isAllowedGoogleSignIn(ucsc)).toBe(true);
    expect(isAllowedGoogleSignIn({ ...ucsc, email: "Slug@UCSC.edu" })).toBe(true);
  });

  it("rejects an @ucsc.edu address that isn't a UCSC Workspace account", () => {
    expect(isAllowedGoogleSignIn({ ...ucsc, hd: undefined })).toBe(false);
    expect(isAllowedGoogleSignIn({ ...ucsc, hd: "gmail.com" })).toBe(false);
  });

  it("rejects unverified addresses", () => {
    expect(isAllowedGoogleSignIn({ ...ucsc, email_verified: false })).toBe(false);
    expect(isAllowedGoogleSignIn({ ...ucsc, email_verified: undefined })).toBe(false);
  });

  it("rejects look-alike domains and missing emails", () => {
    expect(isAllowedGoogleSignIn({ ...ucsc, email: "x@ucsc.edu.evil.com" })).toBe(false);
    expect(isAllowedGoogleSignIn({ ...ucsc, email: "x@notucsc.edu" })).toBe(false);
    expect(isAllowedGoogleSignIn({ ...ucsc, email: null })).toBe(false);
    expect(isAllowedGoogleSignIn(undefined)).toBe(false);
  });

  it("lets in an exact extra address only when it is verified", () => {
    const extra = new Set(["ucsc.msa@gmail.com"]);
    const gmail = { email: "UCSC.MSA@gmail.com", email_verified: true, hd: undefined };
    expect(isAllowedGoogleSignIn(gmail, extra)).toBe(true);
    expect(isAllowedGoogleSignIn({ ...gmail, email_verified: false }, extra)).toBe(false);
    expect(isAllowedGoogleSignIn({ ...gmail, email: "other@gmail.com" }, extra)).toBe(false);
    expect(isAllowedGoogleSignIn(gmail)).toBe(false);
  });
});

describe("parseEmailList", () => {
  it("trims, lowercases and drops empty entries", () => {
    expect(parseEmailList(" A@ucsc.edu, ,Maintainer@Gmail.com,")).toEqual([
      "a@ucsc.edu",
      "maintainer@gmail.com",
    ]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList("")).toEqual([]);
  });
});

describe("isAllowedSignIn", () => {
  const extra = new Set(["maintainer@gmail.com"]);
  const gmail = { email: "maintainer@gmail.com", email_verified: true };

  it("still lets in any @ucsc.edu address, as before", () => {
    expect(isAllowedSignIn("slug@ucsc.edu", { email: "slug@ucsc.edu" })).toBe(true);
    expect(isAllowedSignIn("Slug@UCSC.edu", undefined, extra)).toBe(true);
  });

  it("lets in a listed address only when Google says it is verified", () => {
    expect(isAllowedSignIn("Maintainer@gmail.com", gmail, extra)).toBe(true);
    expect(isAllowedSignIn("maintainer@gmail.com", { ...gmail, email_verified: false }, extra)).toBe(false);
    expect(isAllowedSignIn("maintainer@gmail.com", { email: gmail.email }, extra)).toBe(false);
    expect(isAllowedSignIn("maintainer@gmail.com", undefined, extra)).toBe(false);
  });

  it("rejects other gmail addresses, and listed ones when the list is empty", () => {
    expect(isAllowedSignIn("other@gmail.com", { ...gmail, email: "other@gmail.com" }, extra)).toBe(false);
    expect(isAllowedSignIn("maintainer@gmail.com", gmail)).toBe(false);
  });

  it("checks the verified profile's own address, not just the user's", () => {
    expect(isAllowedSignIn("maintainer@gmail.com", { ...gmail, email: "other@gmail.com" }, extra)).toBe(false);
    expect(isAllowedSignIn("", { ...gmail, email: "" }, new Set([""]))).toBe(false);
    expect(isAllowedSignIn(null, gmail, extra)).toBe(false);
  });

  it("rejects look-alike domains", () => {
    expect(isAllowedSignIn("x@ucsc.edu.evil.com", undefined)).toBe(false);
    expect(isAllowedSignIn("x@notucsc.edu", undefined)).toBe(false);
  });
});
