import fs from "node:fs";
let sql = fs
  .readFileSync("server/schema.sql", "utf8")
  .replace(/^\uFEFF/, "")
  .replaceAll("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")
  .replaceAll("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ");
fs.writeFileSync("server/schema.sql", sql);
fs.mkdirSync(".cloudflare", { recursive: true });
fs.writeFileSync(
  ".cloudflare/schema-batch.json",
  JSON.stringify(
    sql
      .split(";")
      .map((sql) => sql.trim())
      .filter(Boolean)
      .map((sql) => ({ sql, params: [] })),
  ),
);
