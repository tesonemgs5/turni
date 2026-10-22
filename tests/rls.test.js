import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sqlSetupFiles = ["../schema.sql", "../colori.sql"];
const setupSql = await Promise.all(
  sqlSetupFiles.map(path => readFile(new URL(path, import.meta.url), "utf8"))
);

function policiesFor(sql, table) {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `CREATE\\s+POLICY\\s+[^;]+?ON\\s+public\\.${escapedTable}\\b[\\s\\S]*?;`,
    "gi"
  );
  return [...sql.matchAll(pattern)].map(match => match[0]);
}

test("every table created by the checked-in Supabase setup enables user-scoped RLS", () => {
  const definitions = setupSql.flatMap(sql => [
    ...sql.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.([a-z_][a-z0-9_]*)/gi),
  ]);
  assert.ok(definitions.length > 0, "expected to find public table definitions");

  for (const [, table] of definitions) {
    const sql = setupSql.find(source =>
      new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}\\b`, "i").test(source)
    );
    assert.ok(sql, `missing SQL setup for ${table}`);
    assert.match(
      sql,
      new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"),
      `${table} must enable RLS`
    );

    const policies = policiesFor(sql, table);
    assert.ok(policies.length > 0, `${table} must have an RLS policy`);
    for (const policy of policies) {
      assert.match(policy, /\bTO\s+authenticated\b/i, `${table} policy must target authenticated users`);
      assert.match(policy, /auth\.uid\(\)\s*=\s*[a-z_][a-z0-9_]*\.user_id|auth\.uid\(\)\s*=\s*user_id/i,
        `${table} policy must scope rows to the authenticated user`);
    }
  }
});

test("write policies prevent cross-user calendar, model, and rotation references", () => {
  const schema = setupSql[0];
  const expectations = [
    ["modelli", "public.calendars"],
    ["rotazioni", "public.modelli"],
    ["events", "public.calendars"],
    ["events", "public.modelli"],
    ["events", "public.rotazioni"],
  ];

  for (const [table, referencedTable] of expectations) {
    const writePolicy = policiesFor(schema, table).find(policy => /\bFOR\s+ALL\b/i.test(policy));
    assert.ok(writePolicy, `${table} must have an all-operations policy`);
    assert.match(writePolicy, /\bWITH\s+CHECK\b/i, `${table} writes must validate new row ownership`);
    assert.ok(
      writePolicy.toLowerCase().includes(referencedTable),
      `${table} writes must validate references to ${referencedTable}`
    );
  }
});
