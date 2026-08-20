import fs from "fs";
import path from "path";
import { logger } from "@/lib/logger";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
const OVERRIDES_DIR = path.join(process.cwd(), "data", "audit-overrides");

export function cleanupSessionFiles(sessionId: string): void {
  const uploadDir = path.join(UPLOADS_DIR, sessionId);
  try {
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
  } catch (err) {
    logger.warn("[cleanup] failed to remove uploads", { sessionId, error: (err as Error).message });
  }

  const overrideFile = path.join(OVERRIDES_DIR, `${sessionId}.json`);
  try {
    if (fs.existsSync(overrideFile)) {
      fs.unlinkSync(overrideFile);
    }
  } catch (err) {
    logger.warn("[cleanup] failed to remove overrides", { sessionId, error: (err as Error).message });
  }
}
