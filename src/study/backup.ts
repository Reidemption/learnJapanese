import {
  ATTEMPT_SCOPES,
  hasDeck,
  isAttemptMode,
  type AttemptScope,
  type ItemResult,
  type LoggedAttempt,
} from "../progress";
import { normalizeStat, type ItemStat } from "./mastery";
import { isMode } from "./modes";

export const BACKUP_VERSION = 1;

/**
 * Everything needed to restore progress: every logged session with its
 * answers, plus the baseline counts that predate the log. The server and the
 * static (localStorage) implementation produce and accept the same shape.
 */
export type Backup = {
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  baseline: Record<string, ItemStat>;
  attempts: LoggedAttempt[];
};

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseAttempt(raw: unknown, index: number): LoggedAttempt {
  const where = `Session ${index + 1}`;
  if (!raw || typeof raw !== "object") throw new Error(`${where} is not an object.`);
  const a = raw as Record<string, unknown>;
  if (typeof a.uid !== "string" || !a.uid) throw new Error(`${where} has no uid.`);
  if (a.scope !== undefined && !ATTEMPT_SCOPES.includes(a.scope as AttemptScope)) {
    throw new Error(`${where} has an unknown scope: ${String(a.scope)}.`);
  }
  const scope = (a.scope ?? "deck") as AttemptScope;
  const custom = !hasDeck(scope);
  // Custom sessions and word tests span decks, so they are the kinds without a deckId.
  if (typeof a.deckId !== "string" || (!custom && !a.deckId)) {
    throw new Error(`${where} has no deckId.`);
  }
  if (typeof a.mode !== "string" || !isAttemptMode(a.mode)) {
    throw new Error(`${where} has an unknown mode: ${String(a.mode)}.`);
  }
  const mode = a.mode;
  if (!isCount(a.correct) || !isCount(a.total) || a.total === 0 || a.correct > a.total) {
    throw new Error(`${where} has an impossible score.`);
  }
  if (typeof a.at !== "number" || !Number.isFinite(a.at)) {
    throw new Error(`${where} has no timestamp.`);
  }
  if (!Array.isArray(a.items)) throw new Error(`${where} has no answers list.`);

  const items: ItemResult[] = a.items.map((rawItem, i) => {
    const item = (rawItem ?? {}) as Record<string, unknown>;
    if (typeof item.itemId !== "string" || !item.itemId || typeof item.correct !== "boolean") {
      throw new Error(`${where}, answer ${i + 1} is malformed.`);
    }
    const own = typeof item.mode === "string" && isMode(item.mode) ? item.mode : undefined;
    // A test mixes modes, so each of its answers has to say which.
    const itemMode = own ?? (mode === "test" ? undefined : mode);
    if (!itemMode) throw new Error(`${where}, answer ${i + 1} has no mode.`);
    return {
      itemId: item.itemId,
      mode: itemMode,
      correct: item.correct,
      ...(item.skipped === true ? { skipped: true } : {}),
    };
  });

  return {
    uid: a.uid,
    deckId: a.deckId,
    mode,
    correct: a.correct,
    total: a.total,
    kana: flag(a.kana),
    hints: flag(a.hints),
    at: a.at,
    ...(a.retry === true ? { retry: true } : {}),
    ...(custom ? { scope } : {}),
    items,
  };
}

/** Parses a backup file, throwing an error a person can act on. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (!raw || typeof raw !== "object") throw new Error("That file is not a backup.");
  const data = raw as Record<string, unknown>;
  if (data.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(data.version)}.`);
  }
  if (!Array.isArray(data.attempts)) throw new Error("That backup has no sessions list.");

  const baseline: Record<string, ItemStat> = {};
  if (data.baseline && typeof data.baseline === "object") {
    for (const [id, value] of Object.entries(data.baseline)) {
      const stat = normalizeStat(value);
      if (stat) baseline[id] = stat;
    }
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: typeof data.exportedAt === "number" ? data.exportedAt : 0,
    baseline,
    attempts: data.attempts.map(parseAttempt),
  };
}

/** e.g. `learnjapanese-backup-2026-09-20.json`, in local time. */
export function backupFileName(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `learnjapanese-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
