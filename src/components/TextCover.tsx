import "./TextCover.css";

// Mirrors Amytis CoverImage.shortenTitle: <= 12 chars passthrough,
// CJK → first 4 chars, Latin → first 2 words (else first word).
export function shortenTitle(text: string): string {
  if (text.length <= 12) return text;
  // CJK Unified Ideographs + Extension A + CJK symbols/punctuation
  const cjk = /[一-鿿㐀-䶿　-〿]/;
  if (cjk.test(text)) return text.slice(0, 4);
  const words = text.split(/\s+/);
  if (words.length >= 2 && words.slice(0, 2).join(" ").length <= 20) {
    return words.slice(0, 2).join(" ");
  }
  return words[0];
}

const PALETTE_COUNT = 7;

export function paletteIndexForSlug(slug: string): number {
  return slug.length % PALETTE_COUNT;
}

export function TextCover({
  text,
  fallbackText,
  slug,
  className,
}: {
  text: string;
  fallbackText: string;
  slug: string;
  className?: string;
}) {
  const display = text.trim() || shortenTitle(fallbackText);
  const palette = paletteIndexForSlug(slug);
  return (
    <div
      className={`text-cover text-cover-palette-${palette}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={display}
    >
      <div className={`text-cover-accent text-cover-accent-top text-cover-accent-${palette}`} />
      <span className="text-cover-label">{display}</span>
      <div className={`text-cover-accent text-cover-accent-bottom text-cover-accent-${palette}`} />
    </div>
  );
}
