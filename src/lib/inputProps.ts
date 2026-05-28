// Disable macOS text-substitution (first-letter auto-capitalization + auto-correct)
// on identifier-type inputs. On macOS desktop WKWebView `autocorrect` is the
// effective lever; `autocapitalize` is included for correct intent / other platforms.
export const PLAIN_TEXT_INPUT_PROPS = {
  autoCapitalize: "off" as const,
  autoCorrect: "off" as const,
};
