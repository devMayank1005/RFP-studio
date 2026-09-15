import { describe, expect, it } from "vitest";

import { daysBetween, dueLabel, formatDate, todayInKolkata } from "./dates";

describe("todayInKolkata", () => {
  it("rolls over at midnight IST, not UTC", () => {
    // 2026-09-15 20:30 UTC is 2026-09-16 02:00 IST.
    expect(todayInKolkata(new Date("2026-09-15T20:30:00Z"))).toBe("2026-09-16");
    expect(todayInKolkata(new Date("2026-09-15T10:00:00Z"))).toBe("2026-09-15");
  });
});

describe("daysBetween", () => {
  it("counts calendar days from today to the due date", () => {
    expect(daysBetween("2026-09-15", "2026-09-15")).toBe(0);
    expect(daysBetween("2026-09-15", "2026-09-16")).toBe(1);
    expect(daysBetween("2026-09-15", "2026-10-09")).toBe(24);
    expect(daysBetween("2026-09-15", "2026-09-12")).toBe(-3);
  });

  it("is unaffected by daylight-saving style offsets", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("dueLabel", () => {
  it("names the urgency band", () => {
    expect(dueLabel(null)).toEqual({ text: "No due date", urgency: "none" });
    expect(dueLabel(-3)).toEqual({ text: "Overdue by 3 days", urgency: "overdue" });
    expect(dueLabel(-1)).toEqual({ text: "Overdue by 1 day", urgency: "overdue" });
    expect(dueLabel(0)).toEqual({ text: "Due today", urgency: "soon" });
    expect(dueLabel(1)).toEqual({ text: "Due tomorrow", urgency: "soon" });
    expect(dueLabel(7)).toEqual({ text: "Due in 7 days", urgency: "soon" });
    expect(dueLabel(8)).toEqual({ text: "Due in 8 days", urgency: "later" });
    expect(dueLabel(40)).toEqual({ text: "Due in 40 days", urgency: "later" });
  });
});

describe("formatDate", () => {
  it("formats a YYYY-MM-DD as a short British date without timezone drift", () => {
    expect(formatDate("2026-10-09")).toBe("9 Oct 2026");
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
  });
});
