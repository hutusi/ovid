const PERF_FLAG_KEY = "ovid:perf";
const PERF_PANEL_COLLAPSED_KEY = "ovid:perf-panel-collapsed";
const PERF_PANEL_HIDDEN_KEY = "ovid:perf-panel-hidden";
const MAX_EVENTS = 40;

export interface PerfEvent {
  id: number;
  name: string;
  elapsedMs: number;
  detail?: Record<string, string | number | boolean>;
  at: number;
}

export interface PerfMetricSummary {
  name: string;
  count: number;
  maxElapsedMs: number;
  latestElapsedMs: number;
  maxDetail?: Record<string, string | number | boolean>;
  latestDetail?: Record<string, string | number | boolean>;
}

let nextPerfEventId = 1;
let perfEvents: PerfEvent[] = [];
let perfSummaries = new Map<string, PerfMetricSummary>();
const perfListeners = new Set<() => void>();

export function isPerfLoggingEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PERF_FLAG_KEY) === "1";
}

export function isPerfPanelCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PERF_PANEL_COLLAPSED_KEY) === "1";
}

export function setPerfPanelCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  if (collapsed) {
    window.localStorage.setItem(PERF_PANEL_COLLAPSED_KEY, "1");
  } else {
    window.localStorage.removeItem(PERF_PANEL_COLLAPSED_KEY);
  }
}

export function isPerfPanelHidden(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PERF_PANEL_HIDDEN_KEY) === "1";
}

export function setPerfPanelHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  if (hidden) {
    window.localStorage.setItem(PERF_PANEL_HIDDEN_KEY, "1");
  } else {
    window.localStorage.removeItem(PERF_PANEL_HIDDEN_KEY);
  }
}

export function formatDetail(
  detail?: Record<string, string | number | boolean>,
  leadingSpace = true
): string {
  if (!detail) return "";
  const suffix = Object.entries(detail)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  if (!suffix) return "";
  return leadingSpace ? ` ${suffix}` : suffix;
}

function notifyPerfListeners(): void {
  for (const listener of perfListeners) listener();
}

function pushPerfEvent(
  name: string,
  elapsedMs: number,
  detail?: Record<string, string | number | boolean>
): void {
  const roundedElapsedMs = Math.round(elapsedMs);
  const existingSummary = perfSummaries.get(name);
  if (existingSummary) {
    existingSummary.count += 1;
    existingSummary.latestElapsedMs = roundedElapsedMs;
    existingSummary.latestDetail = detail;
    if (roundedElapsedMs >= existingSummary.maxElapsedMs) {
      existingSummary.maxElapsedMs = roundedElapsedMs;
      existingSummary.maxDetail = detail;
    }
  } else {
    perfSummaries.set(name, {
      name,
      count: 1,
      maxElapsedMs: roundedElapsedMs,
      latestElapsedMs: roundedElapsedMs,
      maxDetail: detail,
      latestDetail: detail,
    });
  }
  perfEvents = [
    {
      id: nextPerfEventId++,
      name,
      elapsedMs: roundedElapsedMs,
      detail,
      at: Date.now(),
    },
    ...perfEvents,
  ].slice(0, MAX_EVENTS);
  notifyPerfListeners();
}

export function getPerfEvents(): PerfEvent[] {
  return [...perfEvents];
}

export function getPerfSummaries(): PerfMetricSummary[] {
  return Array.from(perfSummaries.values()).map((summary) => ({ ...summary }));
}

export function clearPerfEvents(): void {
  if (perfEvents.length === 0 && perfSummaries.size === 0) return;
  perfEvents = [];
  perfSummaries = new Map();
  notifyPerfListeners();
}

export function subscribePerfEvents(listener: () => void): () => void {
  perfListeners.add(listener);
  return () => {
    perfListeners.delete(listener);
  };
}

export function logPerf(
  name: string,
  elapsedMs: number,
  detail?: Record<string, string | number | boolean>
): void {
  if (!isPerfLoggingEnabled()) return;
  pushPerfEvent(name, elapsedMs, detail);
  console.info(`[perf] ${name} took ${Math.round(elapsedMs)}ms${formatDetail(detail)}`);
}

export function measureSync<T>(
  name: string,
  work: () => T,
  detail?: Record<string, string | number | boolean>
): T {
  const started = performance.now();
  try {
    return work();
  } finally {
    logPerf(name, performance.now() - started, detail);
  }
}

export async function measureAsync<T>(
  name: string,
  work: () => Promise<T>,
  detail?: Record<string, string | number | boolean>
): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    logPerf(name, performance.now() - started, detail);
  }
}
