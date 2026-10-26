"use client";

import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  DragHandleButton,
  SideMenu,
  useBlockNoteEditor,
  useExtensionState,
} from "@blocknote/react";
import { useEffect, useRef, type PointerEvent } from "react";

/** One pointer-captured drag path for mouse and touch; edits move in one undo step. */
export function EditorSideMenu() {
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, {
    selector: (s) => s?.block,
  });
  const drag = useRef<{
    id: string;
    pointer: number;
    x: number;
    y: number;
    source: HTMLElement;
    ghost: HTMLElement | null;
    line: HTMLElement | null;
    target: string | null;
    after: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  useEffect(
    () => () => {
      drag.current?.ghost?.remove();
      drag.current?.line?.remove();
    },
    [],
  );
  function end(cancel = false) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    suppressClick.current = d.ghost !== null;
    d.ghost?.remove();
    d.line?.remove();
    editor.getExtension(SideMenuExtension)?.unfreezeMenu();
    const source = editor.getBlock(d.id);
    if (cancel || !source || !d.target || !editor.getBlock(d.target)) return;
    editor.transact(() => {
      editor.removeBlocks([source]);
      editor.insertBlocks([source], d.target!, d.after ? "after" : "before");
      editor.setTextCursorPosition(source.id, "start");
    });
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    if (!d.ghost && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    const rect = d.source.getBoundingClientRect();
    if (!d.ghost) {
      const ghost = d.source.cloneNode(true) as HTMLElement;
      ghost.inert = true;
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        position: "fixed",
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        zIndex: "80",
        pointerEvents: "none",
        opacity: ".85",
        boxShadow: "0 8px 24px #15131220",
      });
      document.body.append(ghost);
      d.ghost = ghost;
      const line = document.createElement("div");
      Object.assign(line.style, {
        position: "fixed",
        height: "3px",
        background: "var(--color-burgundy)",
        borderRadius: "4px",
        zIndex: "81",
        pointerEvents: "none",
      });
      document.body.append(line);
      d.line = line;
    }
    d.ghost.style.transform = `translate(${e.clientX - d.x}px, ${e.clientY - d.y}px)`;
    if (e.clientY < 90) window.scrollBy(0, -16);
    else if (e.clientY > innerHeight - 90) window.scrollBy(0, 16);
    const target = document
      .elementFromPoint(Math.max(e.clientX, rect.left + 24), e.clientY)
      ?.closest<HTMLElement>("[data-id]");
    if (
      !target ||
      !editor.domElement?.contains(target) ||
      d.source.contains(target) ||
      !target.dataset.id ||
      !editor.getBlock(target.dataset.id)
    ) {
      d.target = null;
      if (d.line) d.line.style.width = "0";
      return;
    }
    const r = target.getBoundingClientRect();
    d.target = target.dataset.id;
    d.after = e.clientY > r.top + r.height / 2;
    Object.assign(d.line!.style, {
      left: `${r.left}px`,
      top: `${d.after ? r.bottom : r.top}px`,
      width: `${r.width}px`,
    });
  }
  return (
    <div
      onPointerDownCapture={(e) => {
        if (
          e.button !== 0 ||
          !block ||
          !e.currentTarget
            .querySelector('[draggable="true"]')
            ?.contains(e.target as Node)
        )
          return;
        const source = editor.domElement?.querySelector<HTMLElement>(
          `[data-id="${CSS.escape(block.id)}"]`,
        );
        if (!source) return;
        e.preventDefault();
        e.stopPropagation();
        editor.getExtension(SideMenuExtension)?.freezeMenu();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          id: block.id,
          pointer: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          source,
          ghost: null,
          line: null,
          target: null,
          after: false,
        };
      }}
      onPointerMove={move}
      onPointerUp={() => end()}
      onPointerCancel={() => end(true)}
      onLostPointerCapture={() => end(true)}
      onDragStartCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <SideMenu>
        <DragHandleButton />
      </SideMenu>
    </div>
  );
}
