export const ISSUE_WAKE_STATE_KEYS_PAYLOAD_KEY = "_paperclipIssueWakeStateKeys";
export const ISSUE_WAKE_STATE_KEYS_OVERFLOW_PAYLOAD_KEY = "_paperclipIssueWakeStateKeysOverflow";

// Keep the carrier row bounded when an issue flaps through many distinct
// dependency/child states while one follow-up is already in flight. Once the
// limit is crossed, the overflow marker suppresses every additional state-key
// wake only until that carrier finishes. Completed rows still dedupe the exact
// retained keys, but never suppress all future states forever.
export const MAX_ISSUE_WAKE_STATE_KEYS = 64;
export const MAX_ISSUE_WAKE_STATE_KEY_LENGTH = 256;

// Payloads can originate at API boundaries. Only inspect a small suffix rather
// than walking an attacker-controlled array of arbitrary size. Rows written by
// this service never exceed MAX_ISSUE_WAKE_STATE_KEYS.
const MAX_ISSUE_WAKE_STATE_KEY_INPUTS = MAX_ISSUE_WAKE_STATE_KEYS * 2;

const ISSUE_CHILDREN_COMPLETED_STATE_KEY_PREFIX = "issue_children_completed:state:";
const ISSUE_BLOCKERS_RESOLVED_STATE_KEY_PREFIX = "issue_blockers_resolved:state:";

export const IN_FLIGHT_ISSUE_WAKE_STATUSES = [
  "queued",
  "deferred_issue_execution",
  "claimed",
] as const;

export const IDEMPOTENT_ISSUE_WAKE_STATE_STATUSES = [
  ...IN_FLIGHT_ISSUE_WAKE_STATUSES,
  "coalesced",
  "completed",
] as const;

export function isIssueWakeStateKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_ISSUE_WAKE_STATE_KEY_LENGTH) return false;
  const parts = value.split(":");
  if (parts.length !== 5 || parts[1] !== "state") return false;
  const [reason, , issueId, count, digest] = parts;
  return (
    reason === "issue_children_completed" || reason === "issue_blockers_resolved"
  ) && issueId.length > 0 && /^\d+$/.test(count) && /^[a-f0-9]{32}$/.test(digest);
}

export function readIssueWakeStateKeys(payload: Record<string, unknown> | null | undefined) {
  const value = payload?.[ISSUE_WAKE_STATE_KEYS_PAYLOAD_KEY];
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .slice(-MAX_ISSUE_WAKE_STATE_KEY_INPUTS)
        .filter(isIssueWakeStateKey),
    ),
  ];
}

export function hasIssueWakeStateKeysOverflow(
  payload: Record<string, unknown> | null | undefined,
) {
  return payload?.[ISSUE_WAKE_STATE_KEYS_OVERFLOW_PAYLOAD_KEY] === true;
}

export function mergeIssueWakeStateKeys(
  ...inputs: Array<Record<string, unknown> | string | null | undefined>
) {
  const keys: string[] = [];
  const seen = new Set<string>();
  let overflow = false;

  const append = (value: unknown) => {
    if (!isIssueWakeStateKey(value) || seen.has(value)) return;
    seen.add(value);
    keys.push(value);
  };

  for (const input of inputs) {
    if (typeof input === "string" || input == null) {
      append(input);
      continue;
    }
    overflow ||= hasIssueWakeStateKeysOverflow(input);
    for (const key of readIssueWakeStateKeys(input)) append(key);
  }

  if (keys.length > MAX_ISSUE_WAKE_STATE_KEYS) overflow = true;

  // Keep the newest identity for each state namespace. A child that is also a
  // blocker produces both identities; a long sequence in one namespace must
  // not evict the only identity from the other namespace.
  const newestNamespaceIndexes = [
    ISSUE_CHILDREN_COMPLETED_STATE_KEY_PREFIX,
    ISSUE_BLOCKERS_RESOLVED_STATE_KEY_PREFIX,
  ].flatMap((prefix) => {
    const index = keys.findLastIndex((key) => key.startsWith(prefix));
    return index >= 0 ? [index] : [];
  });
  const retainedIndexes = new Set<number>(newestNamespaceIndexes);
  for (let index = keys.length - 1; index >= 0 && retainedIndexes.size < MAX_ISSUE_WAKE_STATE_KEYS; index -= 1) {
    retainedIndexes.add(index);
  }

  return {
    keys: [...retainedIndexes]
      .sort((left, right) => left - right)
      .map((index) => keys[index]),
    overflow,
  };
}

export function writeIssueWakeStateKeys(
  payload: Record<string, unknown>,
  state: { keys: string[]; overflow: boolean },
) {
  const next = { ...payload };
  if (state.keys.length > 0) next[ISSUE_WAKE_STATE_KEYS_PAYLOAD_KEY] = state.keys;
  else delete next[ISSUE_WAKE_STATE_KEYS_PAYLOAD_KEY];
  if (state.overflow) next[ISSUE_WAKE_STATE_KEYS_OVERFLOW_PAYLOAD_KEY] = true;
  else delete next[ISSUE_WAKE_STATE_KEYS_OVERFLOW_PAYLOAD_KEY];
  return next;
}
