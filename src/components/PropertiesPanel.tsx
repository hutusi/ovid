import { ParsedFrontmatter } from "../lib/frontmatter";

interface PropertiesPanelProps {
  frontmatter: ParsedFrontmatter;
  isOpen: boolean;
  onToggle: () => void;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(value + "T00:00:00")
    );
  } catch {
    return value;
  }
}

const FIELD_ORDER = ["title", "date", "tags", "draft"];

function sortedKeys(frontmatter: ParsedFrontmatter): string[] {
  const known = FIELD_ORDER.filter((k) => k in frontmatter);
  const rest = Object.keys(frontmatter)
    .filter((k) => !FIELD_ORDER.includes(k))
    .sort();
  return [...known, ...rest];
}

export function PropertiesPanel({ frontmatter, isOpen, onToggle }: PropertiesPanelProps) {
  const keys = sortedKeys(frontmatter);

  return (
    // Wrapper stays visible at all times so the toggle button is always reachable
    <div className={`properties-wrapper ${isOpen ? "" : "panel-closed"}`}>
      <div className={`properties-panel ${isOpen ? "open" : "closed"}`}>
        <div className="properties-inner">
          {keys.map((key) => {
            const val = frontmatter[key];
            if (val === null || val === undefined) return null;

            if (key === "draft" && val === true) {
              return (
                <div key={key} className="prop-field">
                  <span className="prop-draft">Draft</span>
                </div>
              );
            }

            if (key === "tags" && Array.isArray(val)) {
              if (val.length === 0) return null;
              return (
                <div key={key} className="prop-field">
                  {val.map((tag) => (
                    <span key={tag} className="prop-tag">{tag}</span>
                  ))}
                </div>
              );
            }

            if (key === "date" && typeof val === "string") {
              return (
                <div key={key} className="prop-field">
                  <span className="prop-label">date</span>
                  <span className="prop-value">{formatDate(val)}</span>
                </div>
              );
            }

            if (key === "title") {
              return (
                <div key={key} className="prop-field">
                  <span className="prop-value prop-title">{String(val)}</span>
                </div>
              );
            }

            return (
              <div key={key} className="prop-field">
                <span className="prop-label">{key}</span>
                <span className="prop-value">{String(val)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Toggle lives outside the collapsible panel so it's always visible */}
      <button
        className="properties-toggle"
        onClick={onToggle}
        title={isOpen ? "Hide properties" : "Show properties"}
        aria-label="Toggle properties panel"
      >
        {isOpen ? "›" : "‹"}
      </button>
    </div>
  );
}
