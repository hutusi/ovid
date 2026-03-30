const PERF_FLAG_KEY = "ovid:perf";

function isPerfLoggingEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PERF_FLAG_KEY) === "1";
}

function formatDetail(detail?: Record<string, string | number | boolean>): string {
  if (!detail) return "";
  const suffix = Object.entries(detail)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  return suffix ? ` ${suffix}` : "";
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
    if (isPerfLoggingEnabled()) {
      const elapsed = Math.round(performance.now() - started);
      console.info(`[perf] ${name} took ${elapsed}ms${formatDetail(detail)}`);
    }
  }
}
