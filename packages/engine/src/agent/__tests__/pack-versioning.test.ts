import { describe, it, expect, afterAll } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

const TEST_DIR = path.join(os.tmpdir(), "clausr-pack-versioning-test");
const PACKS_DIR = path.join(TEST_DIR, "packs");

process.env.PACKS_DIR = PACKS_DIR;
fs.mkdirSync(PACKS_DIR, { recursive: true });

afterAll(() => {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch { }
});

const { bumpVersion, archivePackVersion, listPackVersions, restorePackVersion } = await import("../../compliance-packs");

function writePackJson(packId: string, version: string) {
  const dir = path.join(PACKS_DIR, packId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify({
    pack: { title: "Test", description: "d", industries: ["General"], icon: "📋", version, author: "a@b.c", visibility: "author" },
    fields: [], documents: [], checks: [], redlines: [], lessons: [],
  }, null, 2), "utf-8");
  fs.writeFileSync(path.join(dir, "SKILL.md"), "x", "utf-8");
}

function currentVersion(packId: string): string {
  const raw = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, packId, "pack.json"), "utf-8"));
  return raw.pack.version;
}

describe("bumpVersion", () => {
  it("bumps patch by default", () => {
    expect(bumpVersion("1.2.3")).toBe("1.2.4");
  });
  it("bumps minor and major", () => {
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });
  it("handles 1.0.0", () => {
    expect(bumpVersion("1.0.0", "patch")).toBe("1.0.1");
  });
});

describe("pack version archiving", () => {
  it("archives, lists, and restores versions", () => {
    writePackJson("eu-ver-test", "1.0.0");

    // No versions before first archive
    expect(listPackVersions("eu-ver-test")).toEqual([]);

    // Archive 1.0.0
    const a1 = archivePackVersion("eu-ver-test");
    expect(a1.archived).toBe(true);
    expect(a1.version).toBe("1.0.0");

    // Simulate an edit to 1.1.0 then archive again
    writePackJson("eu-ver-test", "1.1.0");
    archivePackVersion("eu-ver-test");

    const versions = listPackVersions("eu-ver-test");
    expect(versions.length).toBe(2);
    expect(versions[0]!.version).toBe("1.1.0");
    expect(versions[1]!.version).toBe("1.0.0");
    expect(versions[0]!.id).toContain("v1.1.0@");

    // Restore the newest snapshot (1.1.0) — current was also 1.1.0
    const res = restorePackVersion("eu-ver-test", versions[0]!.id);
    expect(res.ok).toBe(true);
    expect(currentVersion("eu-ver-test")).toBe("1.1.0");

    // Restore an older snapshot (1.0.0) — rollback
    const oldRes = restorePackVersion("eu-ver-test", versions[1]!.id);
    expect(oldRes.ok).toBe(true);
    expect(currentVersion("eu-ver-test")).toBe("1.0.0");

    // Restoring archives the current first, so history grows
    expect(listPackVersions("eu-ver-test").length).toBeGreaterThanOrEqual(4);
  });

  it("fails gracefully for unknown versions", () => {
    writePackJson("eu-ver-missing", "1.0.0");
    const res = restorePackVersion("eu-ver-missing", "v9.9.9@nonexistent");
    expect(res.ok).toBe(false);
  });

  it("does not archive when pack does not exist", () => {
    const a = archivePackVersion("eu-ver-does-not-exist");
    expect(a.archived).toBe(false);
  });
});
