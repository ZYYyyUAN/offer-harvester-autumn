import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { projectRoot } from "./sites-env.mjs";
const target = process.argv[2] || ".wrangler/e2e";
if (![".wrangler/e2e", ".wrangler/jd-regression"].includes(target)) throw new Error("Unknown isolated test target");
const statePath = path.resolve(projectRoot, target);
if (!statePath.startsWith(path.resolve(projectRoot) + path.sep)) throw new Error("Refusing to clear outside the workspace");
rmSync(statePath, { recursive: true, force: true });
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('test database')}}",
  d1Databases: { DB: "00000000-0000-4000-8000-000000000000" }, resourcePersistencePath: path.join(statePath,"v3") }));
try {
  const db = await mf.getD1Database("DB");
  for (const filename of readdirSync(path.join(projectRoot,"drizzle")).filter(n=>n.endsWith(".sql")).sort()) {
    const sql=readFileSync(path.join(projectRoot,"drizzle",filename),"utf8");
    await db.batch(sql.split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
    console.log("Applied local test migration: "+filename);
  }
} finally { await mf.dispose(); }
