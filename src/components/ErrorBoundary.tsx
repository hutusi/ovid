import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./ErrorBoundary.css";

/** How a caught error is shown:
 *  - "page": the full message and stack, for the editor (the main surface);
 *  - "panel": a compact notice sized for a side panel;
 *  - "bar": a single line, for the status bar;
 *  - "floating": a small card over the app, for a crashed dialog. */
export type ErrorBoundaryVariant = "page" | "panel" | "bar" | "floating";

interface Props {
  children: ReactNode;
  resetKey?: string;
  /** Optional heading; falls back to a generic localized "Something went wrong". */
  title?: string;
  /** Called by Retry instead of simply re-rendering the same children — for
   *  hosts that must rebuild them from fresh state (the editor remounts with
   *  its current body, not the props it crashed with). */
  onReset?: () => void;
  variant?: ErrorBoundaryVariant;
}

interface State {
  error: Error | null;
}

/** Rendered inside the class boundary so the fallback can use hooks (i18n) and
 *  re-localize when the language changes. */
function ErrorFallback({
  error,
  title,
  variant,
  onRetry,
}: {
  error: Error;
  title?: string;
  variant: ErrorBoundaryVariant;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const heading = title ?? t("errors.boundary_title");
  if (variant !== "page") {
    return (
      <div className={`error-boundary-compact error-boundary-compact--${variant}`} role="alert">
        <strong className="error-boundary-compact__title">{heading}</strong>
        <span className="error-boundary-compact__summary">{error.message.split("\n")[0]}</span>
        <button type="button" className="error-boundary-compact__action" onClick={onRetry}>
          {variant === "floating" ? t("common.close") : t("errors.reload_panel")}
        </button>
      </div>
    );
  }
  return (
    <div className="error-boundary" role="alert">
      <strong>{heading}</strong>
      <pre className="error-boundary__message">
        {error.message}
        {"\n\n"}
        {error.stack}
      </pre>
      <button type="button" className="error-boundary__retry" onClick={onRetry}>
        {t("common.retry")}
      </button>
    </div>
  );
}

/** Contains a render error to the subtree it wraps. The app wraps each region
 *  (editor, sidebar, properties panel, status bar, dialogs) in its own
 *  boundary, so one region's bug leaves the rest — and the user's text —
 *  usable instead of replacing the whole window with a stack trace. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          title={this.props.title}
          variant={this.props.variant ?? "page"}
          onRetry={() => {
            this.setState({ error: null });
            this.props.onReset?.();
          }}
        />
      );
    }
    return this.props.children;
  }
}
