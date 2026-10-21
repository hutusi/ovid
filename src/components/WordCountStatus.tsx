import { useTranslation } from "react-i18next";
import { useWritingStats, type WritingStats } from "../lib/writingStats";

interface WordCountStatusProps {
  stats: WritingStats;
  /** The open file, or null when none is. */
  path: string | null;
  wordCountGoal: number | null;
}

/** The status bar's "+N" session badge and word count. Its own component so
 *  it alone subscribes to the writing stats — typing re-renders this readout,
 *  not the window around it. */
export function WordCountStatus({ stats, path, wordCountGoal }: WordCountStatusProps) {
  const { t } = useTranslation();
  const { wordCount, sessionWordsAdded } = useWritingStats(stats, path);
  const goalProgress =
    wordCountGoal !== null && wordCountGoal > 0 ? sessionWordsAdded / wordCountGoal : null;
  const sessionClass =
    goalProgress === null
      ? "statusbar-session"
      : goalProgress >= 1
        ? "statusbar-session goal-reached"
        : goalProgress >= 0.5
          ? "statusbar-session goal-halfway"
          : "statusbar-session";
  const sessionTitle =
    wordCountGoal !== null
      ? t("status_bar.session_goal", { added: sessionWordsAdded, goal: wordCountGoal })
      : t("status_bar.session_words_title");

  return (
    <>
      {sessionWordsAdded > 0 && (
        <span className={sessionClass} title={sessionTitle}>
          +{sessionWordsAdded}
          {wordCountGoal !== null && `/${wordCountGoal}`}
        </span>
      )}
      <span className="statusbar-words">
        {wordCount > 0 ? t("status_bar.word_count", { count: wordCount }) : ""}
      </span>
    </>
  );
}
