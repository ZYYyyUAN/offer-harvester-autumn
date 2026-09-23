import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectRoot } from "./sites-env.mjs";

const statePath = path.resolve(projectRoot, ".wrangler/e2e");
const workspacePath = path.resolve(projectRoot);
if (!statePath.startsWith(`${workspacePath}${path.sep}`)) throw new Error("Refusing to clear an E2E directory outside the workspace");
rmSync(statePath, { recursive: true, force: true });

const wrangler = path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js");
const config = path.join(projectRoot, "dist/server/wrangler.json");
for (const filename of readdirSync(path.join(projectRoot, "drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
  const result = spawnSync(process.execPath, [wrangler, "d1", "execute", "DB", "--local", "--config", config, "--persist-to", statePath, "--file", path.join(projectRoot, "drizzle", filename)], { cwd: projectRoot, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
