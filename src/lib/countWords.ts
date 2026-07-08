// CJK codepoint ranges where each character is its own "word" for counting
// purposes: Chinese (Unified Ideographs + Ext A + Compatibility + Ext B–F via
// the astral range), Japanese kana, and Korean Hangul syllables. Splitting on
// whitespace alone counts a whole Chinese paragraph as one word, which makes
// the word-count and session-goal features meaningless for CJK writers.
const CJK_CHAR = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯\u{20000}-\u{2FA1F}]/gu;

// A non-CJK "word": starts with a letter or number (any script), optionally
// continuing with letters/numbers plus intra-word apostrophes and hyphens.
// Starting on \p{L}/\p{N} means pure-punctuation runs (e.g. "—", "，") don't
// count as words.
const NON_CJK_WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/**
 * Count words in a mixed-script string. Each CJK character counts as one word;
 * remaining text is counted as whitespace/punctuation-delimited word tokens.
 * "你好世界" → 4, "hello world" → 2, "你好 world" → 3, "" → 0.
 */
export function countWords(text: string): number {
  const cjkCount = (text.match(CJK_CHAR) ?? []).length;
  // Remove CJK so its characters don't also match \p{L} in the token pass.
  const rest = text.replace(CJK_CHAR, " ");
  const wordCount = (rest.match(NON_CJK_WORD) ?? []).length;
  return cjkCount + wordCount;
}
