// Database: Supabase (Postgres) through a direct connection string.
const fs = require("fs");
const path = require("path");
const { Pool, types } = require("pg");
const { DEFAULT_SETTINGS, deepMerge } = require("./config");

// Return timestamps as ISO strings, and COUNT(*)/bigint as numbers.
types.setTypeParser(1184, (v) => (v === null ? null : new Date(v).toISOString())); // timestamptz
types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
types.setTypeParser(1082, (v) => v); // date -> "YYYY-MM-DD"

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy the connection string from Supabase (Project Settings > Database) into your environment. See README.");
  process.exit(1);
}
const local = /localhost|127\.0\.0\.1|host=\/|@\/|%2F/.test(url) || process.env.DATABASE_SSL === "off";
const pool = new Pool({
  connectionString: url,
  ssl: local ? false : { rejectUnauthorized: false },
  max: Number(process.env.DATABASE_POOL_SIZE || 5),
});
pool.on("error", (e) => console.error("Database connection error:", e.message));

const db = {
  async all(sql, params = []) { return (await pool.query(sql, params)).rows; },
  async one(sql, params = []) { return (await pool.query(sql, params)).rows[0]; },
  async run(sql, params = []) { return pool.query(sql, params); },
  // Run fn(client) inside a transaction. client has the same all/one/run helpers.
  async tx(fn) {
    const c = await pool.connect();
    const h = {
      all: async (s, p = []) => (await c.query(s, p)).rows,
      one: async (s, p = []) => (await c.query(s, p)).rows[0],
      run: (s, p = []) => c.query(s, p),
    };
    try {
      await c.query("BEGIN");
      const r = await fn(h);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  },
};

async function init() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "schema.sql"), "utf8");
  await pool.query(sql);
}

async function getSettings() {
  const row = await db.one("SELECT value FROM settings WHERE key = 'config'");
  return deepMerge(DEFAULT_SETTINGS, row ? row.value : {});
}

async function saveSettings(next) {
  const merged = deepMerge(await getSettings(), next);
  await db.run(
    "INSERT INTO settings(key, value) VALUES('config', $1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(merged)]
  );
  return merged;
}

function logEvent(bookingId, actor, text, conn = db) {
  return conn.run("INSERT INTO booking_events(booking_id, actor, text) VALUES($1,$2,$3)", [bookingId, actor, text]);
}

module.exports = { db, pool, init, getSettings, saveSettings, logEvent };
