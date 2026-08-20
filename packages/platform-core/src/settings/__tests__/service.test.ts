import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";

const TEST_DB = join(tmpdir(), `test-settings-service-${process.pid}.db`);

import { closeAuthDb, getAuthDb } from "../../auth/db";
import { getSetting, setSetting } from "../service";

function cleanup() {
  closeAuthDb();
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(`${TEST_DB}-wal`); } catch {}
  try { unlinkSync(`${TEST_DB}-shm`); } catch {}
}

describe("settings service", () => {
  beforeAll(() => {
    process.env.AUTH_DB_PATH = TEST_DB;
  });

  afterAll(() => {
    cleanup();
  });

  beforeEach(() => {
    const db = getAuthDb();
    db.exec("DELETE FROM settings");
  });

  it("getSetting returns null for missing key", () => {
    expect(getSetting("nonexistent")).toBeNull();
  });

  it("setSetting creates a new setting", () => {
    setSetting("llm_provider", "deepseek");
    expect(getSetting("llm_provider")).toBe("deepseek");
  });

  it("setSetting updates existing setting", () => {
    setSetting("llm_model", "gpt-4");
    setSetting("llm_model", "deepseek-v4-flash");
    expect(getSetting("llm_model")).toBe("deepseek-v4-flash");
  });

  it("stores and retrieves multiple settings", () => {
    setSetting("key1", "val1");
    setSetting("key2", "val2");
    expect(getSetting("key1")).toBe("val1");
    expect(getSetting("key2")).toBe("val2");
  });

  it("getSetting returns null after delete", () => {
    setSetting("temp", "value");
    const db = getAuthDb();
    db.exec("DELETE FROM settings WHERE key = 'temp'");
    expect(getSetting("temp")).toBeNull();
  });
});
