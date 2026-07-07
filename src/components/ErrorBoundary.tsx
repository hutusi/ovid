import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./ErrorBoundary.css";

interface Props {
  children: ReactNode;
  resetKey?: string;
  /** Optional heading; falls back to a generic localized "Something went wrong". */
  title?: string;
}

interface State {
  error: Error | null;
}

/** Rendered inside the class boundary so the fallback can use hooks (i18n) and
 *  re-localize when the language changes. */
function ErrorFallback({
  error,
  title,
  onRetry,
}: {
  error: Error;
  title?: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="error-boundary" role="alert">
      <strong>{title ?? t("errors.boundary_title")}</strong>
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
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
