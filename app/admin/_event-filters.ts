// The admin Events page's filters, shared by the server page and the client list.
export const FILTERS = {
  all: "All",
  drafts: "Drafts",
  cancelled: "Cancelled",
  "no-flyer": "No flyer",
  imported: "Imported",
  manual: "Made here",
} as const;
export type Filter = keyof typeof FILTERS;
export type Tab = "upcoming" | "past";
