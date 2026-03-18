import type { JSONContent } from "@tiptap/core";

const TASK_PREFIX = /^\[([ xX])\]\s+/;

function getLeadingText(node: JSONContent | undefined): string {
  if (!node?.content) return "";
  for (const child of node.content) {
    if (child.type === "text") return child.text ?? "";
    if (child.type !== "hardBreak") return "";
  }
  return "";
}

function stripTaskPrefix(node: JSONContent): { checked: boolean; paragraph: JSONContent } | null {
  const leadingText = getLeadingText(node);
  const match = leadingText.match(TASK_PREFIX);
  if (!match) return null;

  const prefixLength = match[0].length;
  let stripped = false;
  const content = (node.content ?? []).flatMap((child) => {
    if (!stripped && child.type === "text") {
      stripped = true;
      const text = child.text?.slice(prefixLength) ?? "";
      return text.length > 0 ? [{ ...child, text }] : [];
    }
    return [child];
  });

  return {
    checked: match[1].toLowerCase() === "x",
    paragraph: { ...node, content },
  };
}

function isTaskListCandidate(node: JSONContent): boolean {
  if (node.type !== "listItem" || !node.content?.length) return false;
  const [firstChild] = node.content;
  return firstChild.type === "paragraph" && stripTaskPrefix(firstChild) !== null;
}

function convertTaskListItem(node: JSONContent): JSONContent {
  const [firstChild, ...rest] = node.content ?? [];
  if (firstChild?.type !== "paragraph") return node;

  const stripped = stripTaskPrefix(firstChild);
  if (!stripped) return node;

  return {
    type: "taskItem",
    attrs: { checked: stripped.checked },
    content: [stripped.paragraph, ...rest],
  };
}

export function normalizeTaskLists(content: JSONContent): JSONContent {
  const children = content.content?.map(normalizeTaskLists);
  const normalized = children ? { ...content, content: children } : content;

  if (normalized.type !== "bulletList" || !normalized.content?.length) {
    return normalized;
  }

  if (!normalized.content.every(isTaskListCandidate)) {
    return normalized;
  }

  return {
    type: "taskList",
    content: normalized.content.map(convertTaskListItem),
  };
}
