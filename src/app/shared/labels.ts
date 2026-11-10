import { DecisionValue } from '../models/decision.model';
import { CountData, MatchCategory, MatchResult, SkillRef } from '../models/requirement.model';
import { TagCode } from '../models/tagged-people.model';

export interface CategoryInfo {
  key: MatchCategory;
  label: string;
  css: string;
  ring: string;
}

export const CATEGORIES: Record<MatchCategory, CategoryInfo> = {
  EXCELLENT: { key: 'EXCELLENT', label: 'Strong fit', css: 'pill-excellent', ring: 'var(--excellent-ring)' },
  GOOD: { key: 'GOOD', label: 'Potential', css: 'pill-good', ring: 'var(--good-ring)' },
  PARTIAL: { key: 'PARTIAL', label: 'Can grow', css: 'pill-partial', ring: 'var(--partial-ring)' },
  LOW: { key: 'LOW', label: 'Low match', css: 'pill-low', ring: 'var(--low-ring)' }
};

export const CATEGORY_ORDER: MatchCategory[] = ['EXCELLENT', 'GOOD', 'PARTIAL', 'LOW'];

// Label always comes from match_category or the score, never from free text.
export function categoryOf(score: number | null | undefined, category?: string | null): CategoryInfo {
  const key = (category ?? '').toUpperCase();
  if (key in CATEGORIES) {
    return CATEGORIES[key as MatchCategory];
  }
  const value = score ?? 0;
  if (value >= 80) return CATEGORIES.EXCELLENT;
  if (value >= 65) return CATEGORIES.GOOD;
  if (value >= 50) return CATEGORIES.PARTIAL;
  return CATEGORIES.LOW;
}

// Availability may arrive as text, or as an object such as {status: "BENCH", ...}; anything else shows "Unknown".
// Capacity and free-from date come from the arguments, else from the object form.
export function availabilityOf(
  value: unknown,
  capacity?: number | null,
  availableFrom?: string | null
): { label: string; css: string } {
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const raw = obj ? obj['status'] ?? obj['availability_status'] ?? obj['availabilityStatus'] : value;
  const status = typeof raw === 'string' ? raw : '';
  const pct = capacity ?? (obj?.['available_capacity_percentage'] ?? obj?.['availableCapacityPercentage'] ?? obj?.['capacity']) as number | null | undefined;
  const from = availableFrom ?? (obj?.['available_from'] ?? obj?.['availableFrom']) as string | null | undefined;
  switch (status.toUpperCase()) {
    case 'BENCH': return { label: 'Available', css: 'pill-success' };
    case 'PARTIALLY_AVAILABLE':
      return { label: typeof pct === 'number' ? `Partially available - ${pct}%` : 'Partially available', css: 'pill-warning' };
    case 'ALLOCATED':
      return { label: from ? `Free from ${formatDayMonYear(from)}` : 'Allocated', css: 'pill-info' };
    case 'UNAVAILABLE': return { label: 'Unavailable', css: 'pill-danger' };
    default: return { label: status ? humanise(status) : 'Unknown', css: 'pill-neutral' };
  }
}

// ---------- Match status (one place, used by every screen) ----------
export type MatchStatusKey = 'WAITING' | 'SHORTLISTED' | 'ON_HOLD' | 'REJECTED' | 'APPROVED' | 'ALLOCATED';

export const MATCH_STATUS: Record<MatchStatusKey, { label: string; css: string }> = {
  WAITING: { label: 'Waiting for you', css: 'pill-neutral' },
  SHORTLISTED: { label: 'Shortlisted', css: 'pill-info' },
  ON_HOLD: { label: 'On hold', css: 'pill-warning' },
  REJECTED: { label: 'Rejected', css: 'pill-danger' },
  APPROVED: { label: 'Approved', css: 'pill-success' },
  ALLOCATED: { label: 'Allocated', css: 'pill-success' }
};

export function matchStatus(match: MatchResult): MatchStatusKey {
  const d = match.current_decision;
  switch (d?.decision) {
    case 'SELECTED': return d.allocation_id ? 'ALLOCATED' : 'APPROVED';
    case 'ON_HOLD':
    case 'DEFERRED': return 'ON_HOLD';
    case 'REJECTED': return 'REJECTED';
  }
  return match.recommendation_status === 'RECOMMENDED' ? 'SHORTLISTED' : 'WAITING';
}

export function decisionLabel(decision: DecisionValue | null): { label: string; css: string } {
  switch (decision) {
    case 'SELECTED': return MATCH_STATUS.APPROVED;
    case 'ON_HOLD':
    case 'DEFERRED': return MATCH_STATUS.ON_HOLD;
    case 'REJECTED': return MATCH_STATUS.REJECTED;
    case 'WITHDRAWN': return { label: 'Withdrawn', css: 'pill-neutral' };
    default: return MATCH_STATUS.WAITING;
  }
}

// ---------- Tagged people (blocked from AI search) ----------
// APPROVED_PENDING only appears on AI search results and blocks nobody: it is informational.
export const TAG_INFO: Record<TagCode, { label: string; css: string }> = {
  FULLY_ALLOCATED: { label: 'Fully allocated', css: 'pill-danger' },
  PARTIALLY_ALLOCATED: { label: 'Partially allocated', css: 'pill-warning' },
  APPROVED_PENDING: { label: 'Approved elsewhere - pending allocation', css: 'pill-info' }
};

export function tagInfo(tag: string | null | undefined): { label: string; css: string } {
  const key = (tag ?? '').toUpperCase();
  return key in TAG_INFO ? TAG_INFO[key as TagCode] : { label: humanise(tag) || 'Tagged', css: 'pill-neutral' };
}

export function statusPill(status: string | null | undefined): string {
  const value = (status ?? '').toUpperCase();
  if (['OPEN', 'ACTIVE', 'IN_PROGRESS', 'NEW', 'RUNNING', 'QUEUED'].includes(value)) return 'pill-info';
  if (['FILLED', 'CLOSED', 'COMPLETED', 'FULFILLED', 'APPROVED'].includes(value)) return 'pill-success';
  if (['ON_HOLD', 'PENDING', 'PLANNED', 'MATCHING', 'COMPLETED_WITH_ERRORS'].includes(value)) return 'pill-warning';
  if (['CANCELLED', 'CANCELED', 'FAILED', 'REJECTED'].includes(value)) return 'pill-danger';
  return 'pill-neutral';
}

export function humanise(value: string | null | undefined): string {
  if (!value) return '';
  const text = value.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function skillName(ref: SkillRef | null | undefined): string {
  if (typeof ref === 'string') return ref;
  if (!ref || typeof ref !== 'object') return '';
  const name = ref.skill_name ?? ref.skill ?? ref.name;
  return typeof name === 'string' ? name : '';
}

// Rule-scored results may send skills as a JSON string or a comma list instead of an array.
export function skillNames(refs: SkillRef[] | string | null | undefined): string[] {
  let list: unknown = refs;
  if (typeof refs === 'string') {
    try { list = JSON.parse(refs); } catch { list = refs.split(','); }
  }
  if (!Array.isArray(list)) return [];
  return list.map(ref => skillName(ref as SkillRef).trim()).filter(name => name.length > 0);
}

// ---------- Dates ----------
// Backend timestamps are already India time (IST) and are shown exactly as sent:
// the date and clock parts are read as-is, any zone suffix is ignored, nothing is converted.
export function parseTimestamp(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value ?? '');
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  return isNaN(date.getTime()) ? null : date;
}

// The current time in the backend's format (IST wall clock, no zone), for optimistic updates.
export function nowTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${toIsoDate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function formatDate(value: string | null | undefined): string {
  const date = parseTimestamp(value);
  return date ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : value ?? '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-12-01" -> "01-Dec-2026"; empty -> "-".
export function formatDayMonYear(value: string | null | undefined): string {
  const date = parseTimestamp(value);
  if (!date) return value || '-';
  return `${String(date.getDate()).padStart(2, '0')}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`;
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseTimestamp(value);
  return date
    ? date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : value ?? '';
}

export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ---------- Counts for charts ----------
// Accepts {"EXCELLENT": 3} or [{category: "EXCELLENT", count: 3}] (any key/count field names).
export function toCounts(data: CountData | null | undefined): Array<{ key: string; count: number }> {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map(row => {
      const values = Object.values(row);
      const key = values.find(v => typeof v === 'string') as string | undefined;
      const count = (row['count'] ?? row['total'] ?? values.find(v => typeof v === 'number')) as number | undefined;
      return { key: key ?? 'Unknown', count: Number(count ?? 0) };
    });
  }
  return Object.entries(data).map(([key, count]) => ({ key, count: Number(count) }));
}
