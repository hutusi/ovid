import { useEffect, useState } from "react";
import {
  clearPerfEvents,
  formatDetail,
  getPerfEvents,
  getPerfSummaries,
  isPerfLoggingEnabled,
  isPerfPanelCollapsed,
  isPerfPanelHidden,
  type PerfEvent,
  type PerfMetricSummary,
  setPerfPanelCollapsed,
  setPerfPanelHidden,
  subscribePerfEvents,
} from "../lib/perf";

interface PerfPanelState {
  events: PerfEvent[];
  summaries: PerfMetricSummary[];
}

export function PerfPanel() {
  const [perfState, setPerfState] = useState<PerfPanelState>(() => ({
    events: getPerfEvents(),
    summaries: getPerfSummaries(),
  }));
  const [showRecent, setShowRecent] = useState(false);
  const [collapsed, setCollapsed] = useState(() => isPerfPanelCollapsed());
  const [hidden, setHidden] = useState(() => isPerfPanelHidden());

  useEffect(() => {
    const syncPerfState = () =>
      setPerfState({
        events: getPerfEvents(),
        summaries: getPerfSummaries(),
      });
    const unsubscribe = subscribePerfEvents(syncPerfState);
    syncPerfState();
    return unsubscribe;
  }, []);

  const { events, summaries } = perfState;
  if (!isPerfLoggingEnabled() || hidden || (events.length === 0 && summaries.length === 0)) {
    return null;
  }

  const sortedSummaries = [...summaries].sort(
    (left, right) => right.maxElapsedMs - left.maxElapsedMs || right.count - left.count
  );

  return (
    <aside
      className={`perf-panel${collapsed ? " is-collapsed" : ""}`}
      aria-label="Performance events"
    >
      <div className="perf-panel-header">
        <strong>Perf</strong>
        <div className="perf-panel-actions">
          <button
            type="button"
            className="perf-panel-clear"
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              setPerfPanelCollapsed(next);
            }}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
          <button
            type="button"
            className={`perf-panel-toggle${showRecent ? "" : " is-active"}`}
            aria-pressed={!showRecent}
            onClick={() => setShowRecent(false)}
          >
            Summary
          </button>
          <button
            type="button"
            className={`perf-panel-toggle${showRecent ? " is-active" : ""}`}
            aria-pressed={showRecent}
            onClick={() => setShowRecent(true)}
          >
            Recent
          </button>
          <button type="button" className="perf-panel-clear" onClick={clearPerfEvents}>
            Clear
          </button>
          <button
            type="button"
            className="perf-panel-clear"
            onClick={() => {
              setHidden(true);
              setPerfPanelHidden(true);
            }}
          >
            Hide
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="perf-panel-list">
          {showRecent
            ? events.map((event: PerfEvent) => (
                <div key={event.id} className="perf-panel-item">
                  <div className="perf-panel-row">
                    <span className="perf-panel-name">{event.name}</span>
                    <span className="perf-panel-time">{event.elapsedMs}ms</span>
                  </div>
                  {event.detail && (
                    <div className="perf-panel-detail">{formatDetail(event.detail, false)}</div>
                  )}
                </div>
              ))
            : sortedSummaries.map((event) => (
                <div key={event.name} className="perf-panel-item">
                  <div className="perf-panel-row">
                    <span className="perf-panel-name">{event.name}</span>
                    <span className="perf-panel-time">{event.maxElapsedMs}ms</span>
                  </div>
                  {event.count > 1 && (
                    <div className="perf-panel-detail">
                      latest={event.latestElapsedMs}ms count={event.count}
                    </div>
                  )}
                  {(event.maxDetail || event.latestDetail) && (
                    <div className="perf-panel-detail">
                      {event.maxDetail ? `peak=${formatDetail(event.maxDetail, false)}` : ""}
                      {event.latestDetail
                        ? `${event.maxDetail ? " " : ""}latest=${formatDetail(event.latestDetail, false)}`
                        : ""}
                    </div>
                  )}
                </div>
              ))}
        </div>
      )}
    </aside>
  );
}
