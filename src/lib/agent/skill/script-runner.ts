import { execFile } from "child_process";

export interface ScriptResult {
  stdout: string;
  stderr: string;
  success: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Run a Python script from a skill's scripts/ directory.
 *
 * Uses execFile (not exec) to prevent shell injection.
 * Throws on ENOENT; returns { success: false } on non-zero exit or timeout.
 */
export function runScript(
  scriptPath: string,
  input: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const child = execFile(
      "python3",
      [scriptPath],
      {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PATH: process.env.PATH },
      },
      (err, stdout, stderr) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            resolve({
              stdout: "",
              stderr: "python3 is not installed or not on PATH. Install Python 3 to run compliance scripts.",
              success: false,
            });
            return;
          }
          resolve({ stdout, stderr, success: false });
          return;
        }
        resolve({ stdout, stderr, success: true });
      }
    );

    // Send JSON input via stdin
    if (input !== undefined) {
      child.stdin?.write(JSON.stringify(input));
      child.stdin?.end();
    }
  });
}
