import { describe, expect, it } from "vitest";
import {
  ISSUE_WAKE_STATE_KEYS_OVERFLOW_PAYLOAD_KEY,
  ISSUE_WAKE_STATE_KEYS_PAYLOAD_KEY,
  MAX_ISSUE_WAKE_STATE_KEY_LENGTH,
  MAX_ISSUE_WAKE_STATE_KEYS,
  isIssueWakeStateKey,
  mergeIssueWakeStateKeys,
  readIssueWakeStateKeys,
  writeIssueWakeStateKeys,
} from "../services/issue-wakeup-state-keys.js";

function stateKey(reason: "issue_children_completed" | "issue_blockers_resolved", index: number) {
  return `${reason}:state:issue-1:${index}:${index.toString(16).padStart(32, "0")}`;
}

describe("issue wake state key payloads", () => {
  it("bounds aliases while retaining the newest identity from both namespaces", () => {
    const blockerKey = stateKey("issue_blockers_resolved", 1);
    const childKeys = Array.from(
      { length: MAX_ISSUE_WAKE_STATE_KEYS + 8 },
      (_, index) => stateKey("issue_children_completed", index + 1),
    );

    const merged = mergeIssueWakeStateKeys(
      writeIssueWakeStateKeys({}, { keys: [blockerKey], overflow: false }),
      ...childKeys,
    );

    expect(merged.overflow).toBe(true);
    expect(merged.keys).toHaveLength(MAX_ISSUE_WAKE_STATE_KEYS);
    expect(merged.keys).toContain(blockerKey);
    expect(merged.keys).toContain(childKeys.at(-1));
    expect(merged.keys).not.toContain(childKeys[0]);

    const payload = writeIssueWakeStateKeys({}, merged);
    expect(payload[ISSUE_WAKE_STATE_KEYS_OVERFLOW_PAYLOAD_KEY]).toBe(true);
    expect(readIssueWakeStateKeys(payload)).toEqual(merged.keys);
  });

  it("rejects malformed and oversized aliases before retaining them", () => {
    const valid = stateKey("issue_children_completed", 1);
    const oversized = `issue_children_completed:state:${"x".repeat(MAX_ISSUE_WAKE_STATE_KEY_LENGTH)}:1:${"a".repeat(32)}`;
    const malformed = "issue_children_completed:state:issue-1:1:not-a-digest";
    const payload = {
      [ISSUE_WAKE_STATE_KEYS_PAYLOAD_KEY]: [oversized, malformed, valid],
    };

    expect(isIssueWakeStateKey(oversized)).toBe(false);
    expect(isIssueWakeStateKey(malformed)).toBe(false);
    expect(readIssueWakeStateKeys(payload)).toEqual([valid]);
  });
});
