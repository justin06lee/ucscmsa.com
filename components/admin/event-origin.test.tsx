import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventBadges, SourceRef, importLabel } from "./event-origin";

describe("event origin markers", () => {
  it("labels imports by source and leaves admin-made events unmarked", () => {
    expect(importLabel("manual")).toBeNull();
    expect(importLabel("whatsapp")).toBe("Imported from WhatsApp");
    expect(importLabel("instagram")).toBe("Imported (instagram)");
  });

  it("shows Imported and Cancelled badges only when they apply", () => {
    const { container, rerender } = render(<EventBadges source="manual" cancelledAt={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<EventBadges source="whatsapp" cancelledAt={new Date()} />);
    expect(screen.getByText("Imported from WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("links sourceRef only when it is an http(s) URL", () => {
    const { rerender } = render(<SourceRef value="https://chat.whatsapp.com/abc" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://chat.whatsapp.com/abc");
    rerender(<SourceRef value="WhatsApp MSA Announcements, 2026-10-20 18:04" />);
    expect(screen.queryByRole("link")).toBeNull();
    rerender(<SourceRef value="javascript:alert(1)" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
