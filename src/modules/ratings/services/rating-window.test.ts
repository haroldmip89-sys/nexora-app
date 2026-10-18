import { describe, expect, it } from "vitest";
import {
  RATING_EDIT_WINDOW_MS,
  getEditCutoff,
  getEditWindow,
  getEditableUntil,
} from "./rating-window";

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const at = (offsetMs: number) => new Date(createdAt.getTime() + offsetMs);

describe("rating window", () => {
  it("is 336 hours", () => {
    expect(RATING_EDIT_WINDOW_MS).toBe(336 * 60 * 60 * 1000);
    expect(getEditableUntil(createdAt).getTime()).toBe(createdAt.getTime() + RATING_EDIT_WINDOW_MS);
  });

  it("just created: 14 days left", () => {
    expect(getEditWindow(createdAt, createdAt)).toEqual({ canEdit: true, daysLeft: 14 });
  });

  it("1 ms before the end: editable, 1 day left", () => {
    expect(getEditWindow(createdAt, at(RATING_EDIT_WINDOW_MS - 1))).toEqual({
      canEdit: true,
      daysLeft: 1,
    });
  });

  it("exactly at 336 h and after: not editable, 0 days", () => {
    expect(getEditWindow(createdAt, at(RATING_EDIT_WINDOW_MS))).toEqual({
      canEdit: false,
      daysLeft: 0,
    });
    expect(getEditWindow(createdAt, at(RATING_EDIT_WINDOW_MS + 1))).toEqual({
      canEdit: false,
      daysLeft: 0,
    });
  });

  it("cutoff is coherent with editableUntil", () => {
    const until = getEditableUntil(createdAt);
    expect(getEditCutoff(until).getTime()).toBe(createdAt.getTime());
    // created_at > cutoff  <=>  now < editableUntil
    expect(createdAt.getTime() > getEditCutoff(at(RATING_EDIT_WINDOW_MS - 1)).getTime()).toBe(true);
    expect(createdAt.getTime() > getEditCutoff(at(RATING_EDIT_WINDOW_MS)).getTime()).toBe(false);
  });
});
