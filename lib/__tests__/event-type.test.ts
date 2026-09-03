import { describe, expect, it } from "vitest";
import { getEventType } from "@/lib/event-type";

describe("getEventType", () => {
  it.each([
    ["Berlin AI Hackathon", "hackathon"],
    ["Hackathon Challenge: build for climate", "hackathon"],
    ["Open Data Challenge", "challenge"],
    ["Concours de programmation", "competition"],
    ["Developer meetup", "other"],
  ] as const)("classifies %s as %s", (title, eventType) => {
    expect(getEventType(title)).toBe(eventType);
  });
});
