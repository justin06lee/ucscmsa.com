import { describe, expect, it } from "vitest";
import { cardSummary, mapSearchUrl, splitHostedBy, splitLinks } from "./event-text";

describe("splitHostedBy", () => {
  it("splits off the import's Hosted by line", () => {
    expect(splitHostedBy("Hosted by SWANA.\n\nDinner and a talk.")).toEqual({
      hostedBy: "SWANA",
      body: "Dinner and a talk.",
    });
    expect(splitHostedBy("Hosted by SJP. Teach-in at the quarry.")).toEqual({
      hostedBy: "SJP",
      body: "Teach-in at the quarry.",
    });
  });

  it("leaves other descriptions alone", () => {
    expect(splitHostedBy("Board games and chai.")).toEqual({ hostedBy: null, body: "Board games and chai." });
    expect(splitHostedBy("We hosted by the beach last year.").hostedBy).toBeNull();
  });
});

describe("cardSummary", () => {
  it("is the first paragraph, without the Hosted by line or URLs", () => {
    expect(cardSummary("Hosted by ICSC.\n\nJoin us for a fun bonding night with games and chai!\n\nRSVP: https://forms.gle/x")).toBe(
      "Join us for a fun bonding night with games and chai!",
    );
  });

  it("drops lines that only introduced a link", () => {
    expect(cardSummary("RSVP for the address:\nhttps://forms.gle/thkacLx82yYcgxjt9\n\nBring a friend.")).toBe("Bring a friend.");
    expect(cardSummary("Sign up here: https://forms.gle/abc")).toBe("");
  });

  it("joins a paragraph's lines and cuts at a word with an ellipsis", () => {
    const s = cardSummary("Who's ready for some friendly competition?\nWe're heading to the Santa Cruz Beach Boardwalk for a Laser Tag + Arcade Social!", 60);
    expect(s).toBe("Who's ready for some friendly competition? We're heading to…");
    expect(s.length).toBeLessThanOrEqual(60);
  });

  it("is empty for no description", () => {
    expect(cardSummary(null)).toBe("");
    expect(cardSummary("  \n ")).toBe("");
  });
});

describe("splitLinks", () => {
  const rsvp = { kind: "rsvp" as const, label: "RSVP", url: "https://forms.gle/a" };
  const form = { kind: "form" as const, label: "Volunteer form", url: "https://forms.gle/b" };
  const donate = { kind: "donate" as const, label: "Donate", url: "https://launchgood.com/x" };
  const map = { kind: "map" as const, label: "Map", url: "https://maps.app.goo.gl/x" };

  it("makes the RSVP link the main action, else a form", () => {
    expect(splitLinks([donate, form, rsvp, map])).toEqual({ primary: rsvp, map, secondary: [donate, form] });
    expect(splitLinks([donate, form]).primary).toBe(form);
    expect(splitLinks([donate])).toEqual({ primary: null, map: null, secondary: [donate] });
  });
});

describe("mapSearchUrl", () => {
  it("searches the place, adding Santa Cruz when it isn't named", () => {
    expect(mapSearchUrl("Cowell College")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Cowell%20College%2C%20Santa%20Cruz%2C%20CA",
    );
    expect(mapSearchUrl("Santa Cruz Beach Boardwalk")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Santa%20Cruz%20Beach%20Boardwalk",
    );
  });
});
