import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkifiedText, linkLabel, linkify } from "./linkified-text";

const links = (text: string) => linkify(text).flatMap((p) => (p.kind === "link" ? [p.href] : []));

describe("linkify", () => {
  it("leaves text without a URL as one plain part", () => {
    expect(linkify("Join us for games and chai!")).toEqual([{ kind: "text", text: "Join us for games and chai!" }]);
    expect(linkify("")).toEqual([]);
    expect(links("RSVP at forms.gle/abc or www.ucscmsa.com")).toEqual([]);
  });

  it("links an http(s) URL and keeps the text around it", () => {
    expect(linkify("RSVP for the address: https://forms.gle/thkacLx82yYcgxjt9")).toEqual([
      { kind: "text", text: "RSVP for the address: " },
      { kind: "link", text: "https://forms.gle/thkacLx82yYcgxjt9", href: "https://forms.gle/thkacLx82yYcgxjt9" },
    ]);
    expect(links("HTTP://EXAMPLE.COM/A")).toEqual(["HTTP://EXAMPLE.COM/A"]);
  });

  it("finds several URLs", () => {
    expect(links("Form: https://forms.gle/a\nMap: http://maps.example.com/x?q=1&z=2 and https://b.example.org")).toEqual([
      "https://forms.gle/a",
      "http://maps.example.com/x?q=1&z=2",
      "https://b.example.org",
    ]);
  });

  it("keeps trailing punctuation outside the link", () => {
    expect(links("RSVP: https://forms.gle/abc.")).toEqual(["https://forms.gle/abc"]);
    expect(links("See https://a.example/x, then https://b.example/y; ok?")).toEqual([
      "https://a.example/x",
      "https://b.example/y",
    ]);
    expect(links("Done!! https://a.example/z!?")).toEqual(["https://a.example/z"]);
    expect(linkify("(RSVP at https://forms.gle/abc).").at(-1)).toEqual({ kind: "text", text: ")." });
    // Brackets the URL opened itself stay in.
    expect(links("Read https://en.wikipedia.org/wiki/Jumu%27ah_(prayer).")).toEqual([
      "https://en.wikipedia.org/wiki/Jumu%27ah_(prayer)",
    ]);
  });

  it("never links javascript:, data: or other schemes", () => {
    for (const s of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(document.cookie)",
      "data:text/html,<script>alert(1)</script>",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "mailto:board@ucscmsa.com",
      "ftp://files.example.com",
      "https://",
      "xhttps://evil.example",
    ]) {
      expect(links(s), s).toEqual([]);
    }
    // A javascript: prefix can't smuggle a script in: only the https URL after it links.
    expect(links("javascript:https://evil.example")).toEqual(["https://evil.example"]);
  });

  it("stops a URL at quotes and angle brackets", () => {
    expect(links('<a href="https://evil.example/x" onclick="alert(1)">')).toEqual(["https://evil.example/x"]);
  });
});

describe("LinkifiedText", () => {
  it("renders http(s) URLs as safe links in a new tab, labelled by where they go", () => {
    render(<p><LinkifiedText text="RSVP for the address: https://forms.gle/thkacLx82yYcgxjt9." /></p>);
    const a = screen.getByRole("link", { name: "Google Form (opens in a new tab)" });
    expect(a).toHaveAttribute("href", "https://forms.gle/thkacLx82yYcgxjt9");
    expect(a).toHaveAttribute("title", "https://forms.gle/thkacLx82yYcgxjt9");
    expect(a).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    expect(a).toHaveAttribute("target", "_blank");
    // Only screen readers hear the new-tab note; the full stop stays outside.
    expect(a.querySelector(".sr-only")).toHaveTextContent("(opens in a new tab)");
    expect(a.closest("p")).toHaveTextContent("RSVP for the address: Google Form (opens in a new tab).");
  });

  it("labels a link by a known place, else by its domain", () => {
    expect(linkLabel("https://docs.google.com/forms/d/e/abc/viewform")).toBe("Google Form");
    expect(linkLabel("https://docs.google.com/document/d/abc/edit")).toBe("Google Doc");
    expect(linkLabel("https://maps.app.goo.gl/xyz")).toBe("Map");
    expect(linkLabel("https://www.google.com/maps/place/Santa+Cruz")).toBe("Map");
    expect(linkLabel("https://www.google.com/search?q=maps")).toBe("google.com");
    expect(linkLabel("https://www.instagram.com/ucscmsa/")).toBe("Instagram");
    expect(linkLabel("https://chat.whatsapp.com/AbC")).toBe("WhatsApp group");
    expect(linkLabel("https://WWW.Eventbrite.com/e/123")).toBe("eventbrite.com");
    // A look-alike host is not the known place.
    expect(linkLabel("https://forms.gle.evil.example/x")).toBe("forms.gle.evil.example");
  });

  it("escapes HTML in the description instead of interpreting it", () => {
    const { container } = render(
      <p><LinkifiedText text={'<img src=x onerror="alert(1)"><script>alert(2)</script> javascript:alert(3) https://ok.example'} /></p>,
    );
    expect(container.querySelector("img, script")).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelector("a")).toHaveAttribute("href", "https://ok.example");
    expect(container.textContent).toContain('<script>alert(2)</script> javascript:alert(3)');
  });
});
