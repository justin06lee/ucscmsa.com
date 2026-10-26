"use client";

import dynamic from "next/dynamic";
import "@blocknote/mantine/style.css";
import styles from "./visual-editor.module.css";

export type VisualEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (valid: boolean) => void;
  label: string;
  disabled?: boolean;
};

// Editing code is only loaded when an admin opens an editor. Readers stay SSR.
const EditorClient = dynamic<VisualEditorProps>(
  () => import("./visual-editor-client"),
  {
    ssr: false,
    loading: () => (
      <p className="min-h-32 p-4 text-sm text-dim" role="status">
        Opening editor…
      </p>
    ),
  },
);

export function VisualEditor(props: VisualEditorProps) {
  return (
    <div className={styles.root}>
      <EditorClient {...props} />
    </div>
  );
}
