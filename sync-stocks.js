const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "stockwars.db");
const CSV_PATH = path.join(__dirname, "STOCK_LIST.csv");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    price REAL NOT NULL,
    base_price REAL NOT NULL
  );
`);

const csv = fs.readFileSync(CSV_PATH, "utf8").replace(/^\uFEFF/, "").trim();
const lines = csv.split(/\r?\n/).filter(Boolean);
if (lines.length < 2) throw new Error("STOCK_LIST.csv contains no stock rows.");

const insert = db.prepare(`
  INSERT OR IGNORE INTO stocks(symbol,name,sector,price,base_price)
  VALUES(?,?,?,?,?)
`);
let inserted = 0;
const sync = db.transaction(() => {
  for (const line of lines.slice(1)) {
    const match = line.match(/^([^,]+),(.+),([^,]+),([^,]+)$/);
    if (!match) continue;
    const [, symbol, name, sector, rawPrice] = match;
    const basePrice = Number(rawPrice);
    if (!symbol || !name || !sector || !Number.isFinite(basePrice)) continue;
    const info = insert.run(symbol.trim(), name.trim(), sector.trim(), basePrice, basePrice);
    if (info.changes) inserted += 1;
  }
});
sync();

const count = db.prepare("SELECT COUNT(*) AS count FROM stocks").get().count;
console.log(`[Stock Wars] Stock catalog synced: ${count} total stocks (${inserted} newly added).`);
if (count < 100) throw new Error(`Expected at least 100 stocks, found ${count}.`);
db.close();
