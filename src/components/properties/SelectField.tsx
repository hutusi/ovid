export interface SelectOption {
  value: string;
  label: string;
}

export function SelectField({
  ariaLabel,
  value,
  options,
  onSave,
}: {
  ariaLabel: string;
  value: string | undefined;
  options: readonly SelectOption[];
  onSave: (v: string) => void;
}) {
  // Existing files may already carry an out-of-vocabulary value (e.g. an older
  // sort: "weight" from a hand-edited file). Surfacing it as an extra option
  // keeps the user in control instead of silently overwriting on the first
  // change.
  const currentValue = value ?? "";
  const knownValues = new Set(options.map((o) => o.value));
  const showFallback = currentValue !== "" && !knownValues.has(currentValue);

  return (
    <select
      aria-label={ariaLabel}
      className="prop-select"
      value={currentValue}
      onChange={(e) => onSave(e.target.value)}
    >
      {showFallback && <option value={currentValue}>{currentValue}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
