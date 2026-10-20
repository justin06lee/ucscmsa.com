import { describe, expect, it } from "vitest";
import { isAllowedGoogleSignIn } from "./auth-policy";

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
