import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { encodeDocument } from "@/lib/board-document";
import { CardText } from "./card-text";

it("words arrows in visible text without rewriting a saved link address", () => {
  const href = "https://example.com/path/→/form";
  const source = encodeDocument([
    {
      type: "paragraph",
      props: {},
      content: [
        { type: "text", text: "Submit → wait. ", styles: {} },
        {
          type: "link",
          href,
          content: [{ type: "text", text: "Booking form", styles: {} }],
        },
      ],
      children: [],
    },
  ]);
  const { container } = render(<CardText source={source} />);
  expect(container.querySelector("a")?.getAttribute("href")).toBe(href);
  expect(container.textContent).toContain("Submit, then wait.");
});
