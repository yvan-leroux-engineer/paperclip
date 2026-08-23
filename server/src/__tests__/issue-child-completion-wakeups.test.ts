import { describe, expect, it } from "vitest";
import {
  buildIssueChildrenCompletedWakeStateKey,
  isIssueChildrenCompletedWakeStateKey,
} from "../services/issue-child-completion-wakeups.js";

const CHILD_A = {
  id: "child-a",
  status: "done",
  updatedAt: new Date("2026-08-22T12:00:00.000Z"),
};
const CHILD_B = {
  id: "child-b",
  status: "cancelled",
  updatedAt: new Date("2026-08-22T12:05:00.000Z"),
};

describe("issue children-completed wake state keys", () => {
  it("is stable across child query order", () => {
    const forward = buildIssueChildrenCompletedWakeStateKey({
      parentIssueId: "parent-1",
      children: [CHILD_A, CHILD_B],
    });
    const reverse = buildIssueChildrenCompletedWakeStateKey({
      parentIssueId: "parent-1",
      children: [CHILD_B, CHILD_A],
    });

    expect(reverse).toBe(forward);
    expect(isIssueChildrenCompletedWakeStateKey(forward)).toBe(true);
  });

  it("changes when a child terminal state advances", () => {
    const before = buildIssueChildrenCompletedWakeStateKey({
      parentIssueId: "parent-1",
      children: [CHILD_A, CHILD_B],
    });
    const after = buildIssueChildrenCompletedWakeStateKey({
      parentIssueId: "parent-1",
      children: [
        CHILD_A,
        {
          ...CHILD_B,
          status: "done",
          updatedAt: new Date("2026-08-22T12:10:00.000Z"),
        },
      ],
    });

    expect(after).not.toBe(before);
  });

  it("changes when a child is updated again in the same terminal status", () => {
    const before = buildIssueChildrenCompletedWakeStateKey({
      parentIssueId: "parent-1",
      children: [CHILD_A, CHILD_B],
    });
    const after = buildIssueChildrenCompletedWakeStateKey({
      parentIssueId: "parent-1",
      children: [
        CHILD_A,
        {
          ...CHILD_B,
          updatedAt: new Date("2026-08-22T12:10:00.000Z"),
        },
      ],
    });

    expect(after).not.toBe(before);
  });

  it("does not classify unrelated idempotency keys as child state keys", () => {
    expect(isIssueChildrenCompletedWakeStateKey("issue_blockers_resolved:state:parent-1"))
      .toBe(false);
    expect(isIssueChildrenCompletedWakeStateKey(null)).toBe(false);
  });
});
