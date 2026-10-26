import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { RichDocument } from "./rich-document";
import { encodeDocument } from "@/lib/board-document";

it("shows short resource labels while preserving exact destinations", () => {
  const href = "https://docs.google.com/forms/d/e/long-form-id/viewform";
  const { container } = render(
    <RichDocument source={`1. College lounges: ${href}`} />,
  );
  const link = container.querySelector("a")!;
  expect(link.textContent).toContain("College lounges form");
  expect(container.textContent).not.toContain(href);
  expect(link.getAttribute("href")).toBe(href);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
});

it("renders nested rich blocks as escaped elements and never raw HTML", () => {
  const source = encodeDocument([
    {
      type: "numberedListItem",
      props: {},
      content: [{ type: "text", text: "Parent", styles: { bold: true } }],
      children: [
        {
          type: "bulletListItem",
          props: {},
          content: [
            {
              type: "text",
              text: "<img src=x onerror=alert(1)>",
              styles: { italic: true },
            },
          ],
          children: [],
        },
      ],
    },
  ]);
  const { container } = render(<RichDocument source={source} />);
  expect(container.querySelector("ol > li ul > li em")?.textContent).toBe(
    "<img src=x onerror=alert(1)>",
  );
  expect(container.querySelector("strong")?.textContent).toBe("Parent");
  expect(container.querySelector("img,script,[onerror]")).toBeNull();
});
