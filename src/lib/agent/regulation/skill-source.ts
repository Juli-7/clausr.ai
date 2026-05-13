import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { loadReference } from "@/lib/agent/skill/loader";

interface LoadingRule {
  condition: string;
  refFile: string;
}

const SKILLS_DIR = path.join(process.cwd(), "skills");

/** Module-level cache: skillId → parsed §6 rules */
const rulesCache = new Map<string, LoadingRule[]>();

/**
 * Parse §6 Reference Loading Rules from a skill's SKILL.md.
 * Returns the parsed rules, or null if §6 can't be parsed (caller falls back).
 */
function loadReferenceRules(skillId: string): LoadingRule[] | null {
  if (rulesCache.has(skillId)) return rulesCache.get(skillId) ?? null;

  const skillMdPath = path.join(SKILLS_DIR, skillId, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) return null;

  const raw = fs.readFileSync(skillMdPath, "utf-8");
  const parsed = matter(raw);
  const body = parsed.content;

  // Find "## 6. Reference Loading Rules" section
  const sectionMatch = body.match(/##\s*6\.\s*Reference Loading Rules[\s\S]*?(?=##|\n*$)/);
  if (!sectionMatch) return null;

  const section = sectionMatch[0];

  // Parse markdown table: | Condition | Must Load |
  const tableLines = section.split("\n").filter((l) => l.trim().startsWith("|"));
  // Skip header and separator rows (first 2 rows)
  const dataRows = tableLines.slice(2);

  const rules: LoadingRule[] = [];
  for (const row of dataRows) {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    const condition = cells[0].toLowerCase();
    const refPath = cells[1];
    // Extract filename from path (e.g. "references/un-r48.md" → "un-r48.md")
    const refFile = path.basename(refPath);
    if (condition && refFile) {
      rules.push({ condition, refFile });
    }
  }

  if (rules.length === 0) return null;

  rulesCache.set(skillId, rules);
  return rules;
}

/**
 * Look up the clause text for a regulation reference.
 * Reads from the skill's references/ directory.
 */
export function getClauseText(
  skillId: string,
  regulation: string,
  clause: string
): string | null {
  const refFile = regulationToFile(regulation);
  if (!refFile) return null;

  try {
    const text = loadReference(skillId, refFile);
    return extractClauseText(text, clause);
  } catch {
    return null;
  }
}

/**
 * Load all reference texts for a skill that match the given conditions.
 * Implements §6 loading rules from SKILL.md.
 */
export function loadReferencesForConditions(
  skillId: string,
  conditions: string[]
): string[] {
  const loaded: string[] = [];
  const needed = new Set<string>();

  const rules = loadReferenceRules(skillId);

  for (const cond of conditions) {
    const refFile = rules ? matchRuleDynamic(cond, rules) : matchRuleHardcoded(cond);
    if (refFile) needed.add(refFile);
    // Supplement: also try hardcoded matching for conditions the dynamic rules may not cover
    if (rules) {
      const hardcodedRef = matchRuleHardcoded(cond);
      if (hardcodedRef) needed.add(hardcodedRef);
    }
  }

  // Always load common-pitfalls
  needed.add("common-pitfalls.md");

  for (const ref of needed) {
    try {
      const text = loadReference(skillId, ref);
      loaded.push(`--- ${ref} ---\n${text}`);
    } catch {
      // Reference not found — skip silently
    }
  }

  return loaded;
}

/**
 * Match a condition against dynamically-parsed §6 rules.
 */
function matchRuleDynamic(condition: string, rules: LoadingRule[]): string | null {
  const lower = condition.toLowerCase();
  for (const rule of rules) {
    // Check if the condition keyword (from rule) appears in the input condition
    // e.g. rule "any lighting check" contains "lighting", which matches condition "lighting"
    const ruleKeywords = rule.condition
      .split(/[\s,]+/)
      .filter((w) => w.length > 2); // words longer than 2 chars
    if (ruleKeywords.some((kw) => lower.includes(kw))) {
      return rule.refFile;
    }
  }
  return null;
}

/**
 * Fallsback hardcoded §6 rules when dynamic parsing fails.
 */
function matchRuleHardcoded(condition: string): string | null {
  const lower = condition.toLowerCase();

  if (lower.includes("lighting") || lower.includes("headlamp") || lower.includes("led")) {
    return "un-r48.md";
  }
  if (lower.includes("beam") || lower.includes("cutoff") || lower.includes("colour") || lower.includes("color")) {
    return "un-r112.md";
  }
  if (lower.includes("emission") || lower.includes("exhaust")) {
    return "un-r83.md";
  }
  if (lower.includes("obd") || lower.includes("diagnostic")) {
    return "un-r83.md";
  }
  if (lower.includes("brake") || lower.includes("braking")) {
    return "un-r13.md";
  }

  return null;
}

function regulationToFile(regulation: string): string | null {
  const map: Record<string, string> = {
    "R48": "un-r48.md",
    "R112": "un-r112.md",
    "R83": "un-r83.md",
    "R154": "un-r154.md",
    "R13": "un-r13.md",
  };
  return map[regulation.toUpperCase()] ?? null;
}

function extractClauseText(markdown: string, clause: string): string | null {
  const regex = new RegExp(
    `(?:##\\s*)?§?${escapeRegex(clause)}[^\\n]*\\n([^#]*)`,
    "i"
  );
  const match = markdown.match(regex);
  return match ? match[1].trim() : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
