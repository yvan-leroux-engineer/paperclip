import { createHash } from "node:crypto";

export const ISSUE_CHILDREN_COMPLETED_WAKE_REASON = "issue_children_completed";
const ISSUE_CHILDREN_COMPLETED_STATE_KEY_PREFIX = `${ISSUE_CHILDREN_COMPLETED_WAKE_REASON}:state:`;

export const IDEMPOTENT_CHILD_COMPLETION_WAKE_STATUSES = [
  "queued",
  "deferred_issue_execution",
  "claimed",
  "coalesced",
  "completed",
] as const;

export function buildIssueChildrenCompletedWakeStateKey(input: {
  parentIssueId: string;
  children: Array<{
    id: string;
    status: string;
    updatedAt: Date | string;
  }>;
}) {
  const childState = input.children
    .map((child) => ({
      id: child.id,
      status: child.status,
      updatedAt: child.updatedAt instanceof Date ? child.updatedAt.toISOString() : child.updatedAt,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const digest = createHash("sha256")
    .update(JSON.stringify(childState))
    .digest("hex")
    .slice(0, 32);

  return [
    ISSUE_CHILDREN_COMPLETED_WAKE_REASON,
    "state",
    input.parentIssueId,
    String(childState.length),
    digest,
  ].join(":");
}

export function isIssueChildrenCompletedWakeStateKey(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && value.startsWith(ISSUE_CHILDREN_COMPLETED_STATE_KEY_PREFIX);
}
