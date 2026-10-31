"use client";

import {
  BlockNoteSchema,
  createHeadingBlockSpec,
  defaultBlockSpecs,
} from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { SideMenuController, useCreateBlockNote } from "@blocknote/react";
import { useRef, useState } from "react";
import { Bold, Italic, Link as LinkIcon, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  boardBodySchema,
  DOCUMENT_PREFIX,
  documentBlocks,
  readableLink,
} from "@/lib/board-document";
import { safeHref } from "@/lib/markdown";
import type { VisualEditorProps } from "./visual-editor";
import { EditorSideMenu } from "./editor-side-menu";
import styles from "./visual-editor.module.css";

const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: createHeadingBlockSpec({
      levels: [1, 2, 3],
      allowToggleHeadings: false,
    }),
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    quote: defaultBlockSpecs.quote,
  },
});

export default function VisualEditorClient({
  value,
  onChange,
  onValidityChange,
  label,
  disabled = false,
}: VisualEditorProps) {
  const [error, setError] = useState("");
  const [link, setLink] = useState<{
    href: string;
    label: string;
    editing: boolean;
    position: number;
  } | null>(null);
  const [linkError, setLinkError] = useState("");
  const [selectedType, setSelectedType] = useState("paragraph");
  const [activeStyles, setActiveStyles] = useState({
    bold: false,
    italic: false,
  });
  const [moves, setMoves] = useState({
    up: false,
    down: false,
    nest: false,
    unnest: false,
  });
  const more = useRef<HTMLDetailsElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const editor = useCreateBlockNote({
    schema,
    initialContent: documentBlocks(value),
    domAttributes: {
      editor: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
      },
    },
    links: {
      isValidLink: (href) => safeHref(href) !== null,
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      // A link in an editor opens its edit controls; readers open the destination.
      onClick: (event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (!anchor) return false;
        event.preventDefault();
        const position = editor._tiptapEditor.view.posAtDOM(anchor, 0);
        editor._tiptapEditor.commands.setTextSelection(position);
        openLink(position);
        return true;
      },
    },
  });

  function selectionChanged() {
    const cursor = editor.getTextCursorPosition();
    const block = cursor.block;
    setSelectedType(
      block.type === "heading" ? `heading-${block.props.level}` : block.type,
    );
    const s = editor.getActiveStyles();
    setActiveStyles((previous) =>
      previous.bold === !!s.bold && previous.italic === !!s.italic
        ? previous
        : { bold: !!s.bold, italic: !!s.italic },
    );
    const nextMoves = {
      up: !!(cursor.prevBlock || cursor.parentBlock),
      down: !!(cursor.nextBlock || cursor.parentBlock),
      nest: editor.canNestBlock(),
      unnest: editor.canUnnestBlock(),
    };
    setMoves((previous) =>
      previous.up === nextMoves.up &&
      previous.down === nextMoves.down &&
      previous.nest === nextMoves.nest &&
      previous.unnest === nextMoves.unnest
        ? previous
        : nextMoves,
    );
  }
  function changed() {
    // BlockNote's toggle-only heading property is not offered by this editor.
    const body =
      DOCUMENT_PREFIX +
      JSON.stringify(editor.document, (key, v) =>
        key === "isToggleable" ? undefined : v,
      );
    const valid = boardBodySchema.safeParse(body);
    setError(valid.success ? "" : valid.error.issues[0].message);
    onValidityChange?.(valid.success);
    onChange(body);
    selectionChanged();
  }
  function openLink(position = editor._tiptapEditor.state.selection.from) {
    const existing = editor.getLinkMarkAtPos(position);
    setLink({
      href: existing?.href ?? "",
      label: existing?.text ?? editor.getSelectedText(),
      editing: !!existing,
      position,
    });
    setLinkError("");
  }
  function closeLink() {
    setLink(null);
    requestAnimationFrame(() => linkButton.current?.focus());
  }
  function applyLink() {
    if (!link) return;
    const href = safeHref(link.href);
    if (!href) {
      setLinkError("Paste a full address starting with https:// or http://.");
      return;
    }
    const text = link.label.trim() || readableLink(href);
    if (link.editing) editor.editLink(href, text, link.position);
    else editor.createLink(href, text);
    closeLink();
  }
  function blockAction(action: () => void) {
    action();
    if (more.current) more.current.open = false;
    editor.focus();
    selectionChanged();
  }
  const toolClass =
    "flex min-h-11 min-w-11 items-center justify-center rounded-[2px] px-2 text-sm hover:bg-ink/5 disabled:opacity-40";
  return (
    <div onFocus={selectionChanged}>
      <p className="mb-2 text-sm text-dim">
        Write in any block. To move one, drag the grip that appears beside it.
      </p>
      <div className={styles.frame}>
        <div
          className={styles.toolbar}
          role="toolbar"
          aria-label="Text formatting"
        >
          <select
            aria-label="Block style"
            className="min-h-11 max-w-32 rounded-[2px] bg-transparent px-2 text-base"
            value={selectedType}
            disabled={disabled}
            onChange={(e) => {
              const type = e.target.value;
              const block = editor.getTextCursorPosition().block;
              if (type.startsWith("heading-"))
                editor.updateBlock(block, {
                  type: "heading",
                  props: { level: Number(type.at(-1)) as 1 | 2 | 3 },
                });
              else
                editor.updateBlock(block, {
                  type: type as
                    | "paragraph"
                    | "bulletListItem"
                    | "numberedListItem"
                    | "checkListItem"
                    | "quote",
                });
              editor.focus();
              selectionChanged();
            }}
          >
            <option value="paragraph">Text</option>
            <option value="heading-1">Heading</option>
            <option value="heading-2">Subheading</option>
            <option value="heading-3">Small heading</option>
            <option value="bulletListItem">Bullets</option>
            <option value="numberedListItem">Numbered steps</option>
            <option value="checkListItem">Checklist</option>
            <option value="quote">Callout</option>
          </select>
          <button
            type="button"
            className={toolClass}
            aria-label="Bold"
            aria-pressed={activeStyles.bold}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.toggleStyles({ bold: true });
              editor.focus();
              selectionChanged();
            }}
          >
            <Bold size={17} />
          </button>
          <button
            type="button"
            className={toolClass}
            aria-label="Italic"
            aria-pressed={activeStyles.italic}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.toggleStyles({ italic: true });
              editor.focus();
              selectionChanged();
            }}
          >
            <Italic size={17} />
          </button>
          <button
            ref={linkButton}
            type="button"
            className={toolClass}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openLink()}
          >
            <LinkIcon size={16} aria-hidden />
            <span className="ml-1">Link</span>
          </button>
          <details ref={more} className="relative">
            <summary className={`${toolClass} cursor-pointer list-none`}>
              More
            </summary>
            <div className={styles.menu}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  blockAction(() => editor.toggleStyles({ underline: true }))
                }
              >
                Underline text
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  blockAction(() => editor.toggleStyles({ strike: true }))
                }
              >
                Strikethrough text
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  blockAction(() =>
                    editor.toggleStyles({ backgroundColor: "yellow" }),
                  )
                }
              >
                Highlight text
              </button>
              <button
                type="button"
                disabled={disabled || !moves.up}
                onClick={() => blockAction(() => editor.moveBlocksUp())}
              >
                Move up
              </button>
              <button
                type="button"
                disabled={disabled || !moves.down}
                onClick={() => blockAction(() => editor.moveBlocksDown())}
              >
                Move down
              </button>
              <button
                type="button"
                disabled={disabled || !moves.nest}
                onClick={() =>
                  blockAction(() => {
                    if (editor.canNestBlock()) editor.nestBlock();
                  })
                }
              >
                Make a subtask
              </button>
              <button
                type="button"
                disabled={disabled || !moves.unnest}
                onClick={() =>
                  blockAction(() => {
                    if (editor.canUnnestBlock()) editor.unnestBlock();
                  })
                }
              >
                Move out of subtask
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  blockAction(() => {
                    const b = editor.getTextCursorPosition().block;
                    const copyTree = (
                      blocks: typeof editor.document,
                    ): typeof editor.document =>
                      blocks.map((child) => ({
                        ...child,
                        id: crypto.randomUUID(),
                        children: copyTree(child.children),
                      }));
                    const [copy] = editor.insertBlocks(
                      copyTree([b]),
                      b,
                      "after",
                    );
                    editor.setTextCursorPosition(copy, "end");
                  })
                }
              >
                Duplicate block
              </button>
              <button
                type="button"
                disabled={disabled}
                className="text-burgundy"
                onClick={() =>
                  blockAction(() =>
                    editor.removeBlocks([editor.getTextCursorPosition().block]),
                  )
                }
              >
                Delete block
              </button>
            </div>
          </details>
          <span className="grow" />
          <button
            type="button"
            aria-label="Undo"
            disabled={disabled}
            className={toolClass}
            onClick={() => {
              editor.undo();
              editor.focus();
            }}
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            aria-label="Redo"
            disabled={disabled}
            className={toolClass}
            onClick={() => {
              editor.redo();
              editor.focus();
            }}
          >
            <Redo2 size={17} />
          </button>
        </div>
        {link ? (
          <div
            role="dialog"
            aria-label={link.editing ? "Edit link" : "Add link"}
            className={styles.linkPanel}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeLink();
              }
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
          >
            <label className="grid gap-1 text-sm text-dim">
              Link label
              <Input
                value={link.label}
                autoFocus
                onChange={(e) => setLink({ ...link, label: e.target.value })}
                placeholder="e.g. Book a college lounge"
                maxLength={300}
              />
            </label>
            <label className="grid gap-1 text-sm text-dim">
              Web address
              <Input
                value={link.href}
                onChange={(e) => setLink({ ...link, href: e.target.value })}
                placeholder="https://…"
                inputMode="url"
                maxLength={2048}
              />
            </label>
            {linkError ? (
              <p role="alert" className="text-sm text-burgundy">
                {linkError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={applyLink}>Save link</Button>
              {link.editing ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    editor.deleteLink(link.position);
                    closeLink();
                  }}
                >
                  Remove link
                </Button>
              ) : null}
              <Button variant="ghost" onClick={closeLink}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
        <BlockNoteView
          editor={editor}
          theme="light"
          editable={!disabled}
          formattingToolbar={false}
          linkToolbar={false}
          slashMenu={false}
          emojiPicker={false}
          sideMenu={false}
          onChange={changed}
          onSelectionChange={selectionChanged}
        >
          <SideMenuController sideMenu={EditorSideMenu} />
        </BlockNoteView>
        <div className="flex flex-wrap border-t border-ink/10">
          <button
            type="button"
            className="min-h-11 grow px-4 text-left text-sm text-dim hover:bg-ink/3"
            disabled={disabled}
            onClick={() => {
              const last = editor.document.at(-1)!;
              const [block] = editor.insertBlocks(
                [{ type: "paragraph" }],
                last,
                "after",
              );
              editor.setTextCursorPosition(block, "start");
              editor.focus();
            }}
          >
            + Add a block
          </button>
          <button
            type="button"
            className="min-h-11 grow px-4 text-left text-sm text-dim hover:bg-ink/3"
            disabled={disabled}
            onClick={() => {
              const parent = editor.getTextCursorPosition().block;
              const [child] = editor.insertBlocks(
                [{ type: "bulletListItem" }],
                parent,
                "after",
              );
              editor.setTextCursorPosition(child, "start");
              if (editor.canNestBlock()) editor.nestBlock();
              editor.focus();
            }}
          >
            + Add a subtask
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-burgundy">
          {error}
        </p>
      ) : null}
    </div>
  );
}
