import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "./markdown";
import { parseInline, parseMarkdown, safeHref } from "@/lib/markdown";

function html(source: string) {
  return render(<Markdown source={source} />).container;
}

describe("guide markdown: no way to inject script", () => {
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<a href="javascript:alert(1)">x</a>',
    "<iframe src=https://evil.example></iframe>",
    "<svg onload=alert(1)>",
  ])("renders raw HTML as text: %s", (src) => {
    const el = html(src);
    expect(el.querySelector("script, img, iframe, svg, [onerror], [onload]")).toBeNull();
    // A bare https URL inside the text may become a link; nothing else does.
    for (const a of el.querySelectorAll("a")) expect(a.getAttribute("href")).toMatch(/^https:\/\//);
    expect(el.textContent).toContain(src);
  });

  it.each([
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](java\tscript:alert(1))",
    "[click](%6Aavascript:alert(1))",
    "[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[click](vbscript:msgbox(1))",
    "[click](//evil.example/path)",
    "[click](/admin/admins)",
    "[click](file:///etc/passwd)",
    "[click](mailto:a@b.c)",
  ])("drops a link that isn't absolute http(s): %s", (src) => {
    const el = html(src);
    expect(el.querySelectorAll("a")).toHaveLength(0);
    expect(el.textContent).toContain("click");
  });

  it("keeps http(s) links, opening in a new tab with noopener noreferrer", () => {
    const el = html("See [the form](https://docs.google.com/forms/x) or http://example.com/a.");
    const links = [...el.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://docs.google.com/forms/x",
      "http://example.com/a",
    ]);
    for (const a of links) {
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
      expect(a.getAttribute("target")).toBe("_blank");
    }
    // Trailing punctuation stays outside a bare link.
    expect(el.textContent).toContain("http://example.com/a.");
  });

  it("escapes HTML inside link text, bold and code", () => {
    const el = html('**<b>x</b>** `<script>` [<img src=x onerror=alert(1)>](https://a.example)');
    expect(el.querySelector("b, script, img")).toBeNull();
    expect(el.querySelector("a")?.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("never emits an attribute from guide text", () => {
    const el = html('[x](https://a.example" onmouseover="alert(1))');
    for (const a of el.querySelectorAll("a")) {
      expect(a.getAttributeNames().sort()).toEqual(["class", "href", "rel", "target"]);
    }
  });
});

describe("guide markdown: what it renders", () => {
  it("renders headings, ordered steps with a nested list, and bold", () => {
    const el = html(
      "## Steps\n\n1. Pick a room.\n2. Check how it's booked:\n   - Some rooms: email.\n   - Others: press **Reserve**.\n3. Wait.\n\n## Gotchas\n\n- One.",
    );
    expect([...el.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Steps", "Gotchas"]);
    const ol = el.querySelector("ol")!;
    expect(ol.children).toHaveLength(3);
    expect(ol.children[1].querySelectorAll("ul > li")).toHaveLength(2);
    expect(el.querySelector("strong")?.textContent).toBe("Reserve");
  });

  it("marks TODO so it stays visible", () => {
    const el = html("- TODO: college funding emails (to be filled in).");
    expect(el.querySelector("li span")?.textContent).toBe("TODO");
    expect(el.textContent).toBe("TODO: college funding emails (to be filled in).");
  });

  it("joins wrapped paragraph lines", () => {
    expect(parseMarkdown("one\ntwo\n\nthree")).toEqual([
      { t: "para", c: [{ t: "text", v: "one two" }] },
      { t: "para", c: [{ t: "text", v: "three" }] },
    ]);
  });

  it("keeps a link with a query string whole", () => {
    const url = "https://powerforms.docusign.net/x?env=na2&acct=a&recipientLang=en";
    expect(parseInline(`[DocuSign form](${url}).`)).toEqual([
      { t: "link", href: url, c: [{ t: "text", v: "DocuSign form" }] },
      { t: "text", v: "." },
    ]);
  });

  it("safeHref accepts only absolute http(s)", () => {
    expect(safeHref("https://a.example/x")).toBe("https://a.example/x");
    expect(safeHref(" javascript:alert(1)")).toBeNull();
    expect(safeHref("https://a.example/\u0000x")).toBeNull();
  });
});
