import { spawn } from "node:child_process";
import type { DabGitWorkerConfig } from "./dab-git-worker-config.js";
import type { DabGitCommandRunner } from "./dab-git-workspace-adapter.js";

export function createDabGitCommandRunner(config: DabGitWorkerConfig): DabGitCommandRunner {
  return Object.freeze({
    run: async (args: readonly string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) => new Promise<string>((resolve, reject) => {
      if (!Array.isArray(args) || args.length < 1 || args.length > 64 || args.some((arg) => typeof arg !== "string" || arg.length > 4096 || arg.includes("\0"))) {
        reject(new Error("DAB_GIT_COMMAND_ARGUMENTS_INVALID"));
        return;
      }
      const child = spawn("git", [...args], {
        cwd: options.cwd,
        env: {
          ...process.env,
          ...options.env,
          GIT_TERMINAL_PROMPT: "0",
          DAB_GIT_GITHUB_TOKEN: config.credential ?? "",
          GIT_ASKPASS: "/usr/local/bin/dab-git-askpass",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
        if (stdout.length > 262_144) child.kill("SIGKILL");
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
        if (stderr.length > 65_536) child.kill("SIGKILL");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`DAB_GIT_COMMAND_FAILED:${code}:${stderr.slice(0, 240)}`));
      });
    }),
  });
}
