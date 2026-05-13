import fs from "fs";
import path from "path";

const SKILLS_DIR = path.join(process.cwd(), "skills");

/**
 * Write (or dismiss) a lesson to SKILL.md §7 Experience Accumulation.
 *
 * When confirmed: appends the lesson under §7.
 * When dismissed: returns immediately — no writing.
 */
export function integrateLesson(
  skillId: string,
  lessonText: string,
  confirmed: boolean
): { written: boolean } {
  if (!confirmed) return { written: false };

  const skillMdPath = path.join(SKILLS_DIR, skillId, "SKILL.md");

  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found for skill "${skillId}"`);
  }

  // Read current content
  const content = fs.readFileSync(skillMdPath, "utf-8");

  // Check if the exact lesson already exists under §7
  if (content.includes(`- ${lessonText}`)) {
    return { written: false };
  }

  // Find or create §7 section
  const sectionHeader = "## 7. Experience Accumulation";

  if (content.includes(sectionHeader)) {
    // Append to existing §7 section — find the end of the section
    const sectionRegex = new RegExp(`(${escapeRegex(sectionHeader)}[\\s\\S]*?)(?=\n## |\n*$)`);
    const updated = content.replace(sectionRegex, (match) => {
      const trimmed = match.trimEnd();
      return `${trimmed}\n- ${lessonText}`;
    });
    fs.writeFileSync(skillMdPath, updated, "utf-8");
  } else {
    // No §7 section exists — append it at the end
    const lessonBlock = `\n\n${sectionHeader}\n\n> This section is auto-maintained by system experience, equally important as the initial flow.\n\n- ${lessonText}\n`;
    fs.writeFileSync(skillMdPath, content.trimEnd() + lessonBlock, "utf-8");
  }

  return { written: true };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
