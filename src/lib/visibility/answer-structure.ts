const ANSWER_STRUCTURE_LABELS: Record<string, string> = {
  list: "列表式",
  comparison: "对比式",
  narrative: "叙述式",
  qa: "问答式",
  "q&a": "问答式",
  unknown: "其他",
};

/** Convert answer-structure values returned by the analysis service into customer-facing Chinese labels. */
export function getAnswerStructureLabel(type: string): string {
  const normalized = type.trim().toLowerCase();
  return ANSWER_STRUCTURE_LABELS[normalized] ?? type;
}
