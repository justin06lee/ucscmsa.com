import { describe, expect, it } from "vitest";
import {
  boardBodySchema,
  decodeDocument,
  DOCUMENT_PREFIX,
  documentBlocks,
  documentSummary,
  encodeDocument,
  type RichBlock,
} from "./board-document";

const paragraph = (text = "A step"): RichBlock => ({
  type: "paragraph",
  props: {},
  content: [{ type: "text", text, styles: {} }],
  children: [],
});

describe("visual playbook documents", () => {
  it("imports existing formatting, steps and subtasks without changing destinations", () => {
    const url = "https://docs.google.com/forms/d/e/example/viewform";
    const blocks = documentBlocks(
      `## Booking\n\n1. **Pick a space** at https://spaces.ucsc.edu/spaces-directory/\n2. Book it:\n   - College lounges: ${url}\n   - [Classrooms](https://classroomreservations.ucsc.edu/)`,
    );
    expect(blocks[0].props.level).toBe(2);
    expect(blocks[1].content[0]).toMatchObject({
      text: "Pick a space",
      styles: { bold: true },
    });
    expect(blocks[1].content.at(-1)).toMatchObject({
      href: "https://spaces.ucsc.edu/spaces-directory/",
      content: [{ text: "Spaces directory" }],
    });
    expect(blocks[2].children[0].content.at(-1)).toMatchObject({
      href: url,
      content: [{ text: "College lounges form" }],
    });
    expect(blocks[2].children[1].content[0]).toMatchObject({
      content: [{ text: "Classrooms" }],
    });
    expect(decodeDocument(encodeDocument(blocks))).toEqual(blocks);
  });

  it("preserves rich marks, nested checklists, order and edited link labels", () => {
    const blocks = [
      paragraph("First"),
      {
        ...paragraph(),
        type: "checkListItem" as const,
        props: { checked: true },
        children: [
          {
            ...paragraph(),
            content: [
              {
                type: "link" as const,
                href: "https://example.com/form?x=1&y=2",
                content: [
                  {
                    type: "text" as const,
                    text: "Reserve our room",
                    styles: { bold: true, italic: true, underline: true },
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const body = encodeDocument(blocks);
    expect(boardBodySchema.safeParse(body).success).toBe(true);
    expect(documentBlocks(body)).toEqual(blocks);
    expect(documentSummary(body)).toBe("First");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "//example.com",
    "/admin",
    "https://example.com/\u0000x",
  ])("refuses unsafe link %s", (href) => {
    const b = paragraph();
    b.content = [
      {
        type: "link",
        href,
        content: [{ type: "text", text: "Open", styles: {} }],
      },
    ];
    expect(boardBodySchema.safeParse(encodeDocument([b])).success).toBe(false);
  });

  it("rejects unknown block types, arbitrary styles, duplicate IDs and malformed documents", () => {
    const bad: unknown[] = [
      [{ ...paragraph(), type: "script" }],
      [{ ...paragraph(), type: { toString: null } }],
      [{ ...paragraph(), props: { textAlignment: { toString: null } } }],
      [
        {
          ...paragraph(),
          content: [
            {
              type: "text",
              text: "x",
              styles: { backgroundColor: "url(https://example.com)" },
            },
          ],
        },
      ],
      [
        { ...paragraph(), id: "same" },
        { ...paragraph(), id: "same" },
      ],
      [{ ...paragraph(), children: "bad" }],
      [],
    ];
    for (const value of bad)
      expect(
        boardBodySchema.safeParse(DOCUMENT_PREFIX + JSON.stringify(value))
          .success,
      ).toBe(false);
    expect(decodeDocument(DOCUMENT_PREFIX + "oops")).toBeNull();
  });

  it("bounds nesting, block count, and text length before recursive rendering", () => {
    const deep = paragraph();
    let at = deep;
    for (let i = 0; i < 8; i++) {
      const child = paragraph();
      at.children = [child];
      at = child;
    }
    expect(boardBodySchema.safeParse(encodeDocument([deep])).success).toBe(
      false,
    );
    expect(
      boardBodySchema.safeParse(
        encodeDocument(Array.from({ length: 251 }, () => paragraph())),
      ).success,
    ).toBe(false);
    expect(
      boardBodySchema.safeParse(encodeDocument([paragraph("x".repeat(20001))]))
        .success,
    ).toBe(false);
    expect(boardBodySchema.safeParse("x".repeat(20001)).success).toBe(false);
    expect(boardBodySchema.safeParse("Original Markdown").success).toBe(true);
  });
});
