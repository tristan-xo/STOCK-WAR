require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT || 3000);
const STARTING_CAPITAL = Number(process.env.STARTING_CAPITAL || 200000);
const NEWS_SECONDS = Number(process.env.NEWS_SECONDS || 120);
const TRADE_SECONDS = Number(process.env.TRADE_SECONDS || 180);
const DEFAULT_COST_BASIS = String(process.env.COST_BASIS_METHOD || 'FIFO').toUpperCase()==='AVERAGE' ? 'AVERAGE' : 'FIFO';
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS ?? 5);
const MAX_IMPACT_BPS = Number(process.env.MAX_IMPACT_BPS ?? 50);
const AUTO_NEWS = String(process.env.AUTO_NEWS ?? 'true').toLowerCase() !== 'false';
const AUTO_NEWS_MIN_PCT = Number(process.env.AUTO_NEWS_MIN_PCT ?? 2);
const AUTO_NEWS_MAX_PCT = Number(process.env.AUTO_NEWS_MAX_PCT ?? 9);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "stockwars.db");
const DB_DIR = path.dirname(DB_PATH);
fs.mkdirSync(DB_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','player')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  price REAL NOT NULL,
  base_price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  news_title TEXT DEFAULT '',
  news_body TEXT DEFAULT '',
  news_impact_note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT,
  locked_at TEXT,
  applied_at TEXT
);

CREATE TABLE IF NOT EXISTS market_news_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL UNIQUE,
  category TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  scope TEXT NOT NULL,
  target_sector TEXT,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  impact_pct REAL NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(round_id) REFERENCES rounds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS round_price_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL,
  stock_id INTEGER NOT NULL,
  old_price REAL NOT NULL,
  new_price REAL NOT NULL,
  impact_pct REAL NOT NULL,
  news_event_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE,
  FOREIGN KEY(news_event_id) REFERENCES market_news_events(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS round_impacts (
  round_id INTEGER NOT NULL,
  stock_id INTEGER NOT NULL,
  impact_pct REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(round_id, stock_id),
  FOREIGN KEY(round_id) REFERENCES rounds(id) ON DELETE CASCADE,
  FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounts (
  user_id INTEGER PRIMARY KEY,
  cash REAL NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS holdings (
  user_id INTEGER NOT NULL,
  stock_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  avg_price REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, stock_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  stock_id INTEGER NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  total REAL NOT NULL,
  round_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(stock_id) REFERENCES stocks(id),
  FOREIGN KEY(round_id) REFERENCES rounds(id)
);

CREATE TABLE IF NOT EXISTS holding_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  stock_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  remaining_quantity INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  created_trade_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  current_round INTEGER NOT NULL DEFAULT 0,
  event_status TEXT NOT NULL DEFAULT 'registration',
  phase TEXT NOT NULL DEFAULT 'idle',
  phase_started_at INTEGER,
  phase_ends_at INTEGER,
  paused_remaining INTEGER,
  market_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, role TEXT, action TEXT NOT NULL, meta TEXT DEFAULT '',
  ip TEXT DEFAULT '', user_agent TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, stock_id INTEGER NOT NULL, round_id INTEGER,
  price REAL NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(stock_id) REFERENCES stocks(id), FOREIGN KEY(round_id) REFERENCES rounds(id)
);

CREATE TABLE IF NOT EXISTS trade_nonces (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, nonce TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, nonce),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS event_announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS round_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  round_id INTEGER NOT NULL,
  total REAL NOT NULL,
  cash REAL NOT NULL,
  market_value REAL NOT NULL,
  profit REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, round_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(round_id) REFERENCES rounds(id) ON DELETE CASCADE
);
`);

// Migration: early autonomous-news builds accidentally made round_id UNIQUE in
// market_news_events. That allowed only one story per round, so story #2 caused
// the Start Round request to fail. Rebuild the table once on existing databases.
(function migrateNewsEventsTable(){
  const indexes = db.prepare(`PRAGMA index_list(market_news_events)`).all();
  const hasUniqueRoundIndex = indexes.some(ix => {
    if (!ix.unique) return false;
    const cols = db.prepare(`PRAGMA index_info(${JSON.stringify(ix.name)})`).all();
    return cols.length === 1 && cols[0].name === 'round_id';
  });
  if (!hasUniqueRoundIndex) return;
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE market_news_events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        sentiment TEXT NOT NULL,
        scope TEXT NOT NULL,
        target_sector TEXT,
        headline TEXT NOT NULL,
        body TEXT NOT NULL,
        impact_pct REAL NOT NULL DEFAULT 0,
        generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(round_id) REFERENCES rounds(id) ON DELETE CASCADE
      );`);
      db.exec(`INSERT INTO market_news_events_new (id,round_id,category,sentiment,scope,target_sector,headline,body,impact_pct,generated_at)
               SELECT id,round_id,category,sentiment,scope,target_sector,headline,body,impact_pct,generated_at
               FROM market_news_events ORDER BY id;`);
      db.exec(`DROP TABLE market_news_events;`);
      db.exec(`ALTER TABLE market_news_events_new RENAME TO market_news_events;`);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
})();

// Lightweight migrations for databases created by earlier Stock Wars versions.
const eventColumns = db.prepare(`PRAGMA table_info(event_state)`).all().map(x=>x.name);
for (const [name, type] of [["phase","TEXT NOT NULL DEFAULT 'idle'"],["phase_started_at","INTEGER"],["phase_ends_at","INTEGER"],["paused_remaining","INTEGER"]]) {
  if (!eventColumns.includes(name)) db.exec(`ALTER TABLE event_state ADD COLUMN ${name} ${type}`);
}
const tradeColumns = db.prepare(`PRAGMA table_info(trades)`).all().map(x=>x.name);
for (const [name, type] of [
  ["order_type","TEXT NOT NULL DEFAULT 'MARKET'"],
  ["limit_price","REAL"],
  ["fee","REAL NOT NULL DEFAULT 0"],
  ["net_total","REAL"],
  ["realized_pnl","REAL NOT NULL DEFAULT 0"]
]) {
  if (!tradeColumns.includes(name)) db.exec(`ALTER TABLE trades ADD COLUMN ${name} ${type}`);
}
const stateColumns2 = db.prepare(`PRAGMA table_info(event_state)`).all().map(x=>x.name);
if (!stateColumns2.includes('cost_basis_method')) db.exec(`ALTER TABLE event_state ADD COLUMN cost_basis_method TEXT NOT NULL DEFAULT 'FIFO'`);
if (!stateColumns2.includes('registration_open')) db.exec(`ALTER TABLE event_state ADD COLUMN registration_open INTEGER NOT NULL DEFAULT 1`);
if (!stateColumns2.includes('presentation_mode')) db.exec(`ALTER TABLE event_state ADD COLUMN presentation_mode INTEGER NOT NULL DEFAULT 0`);
const stockColumns = db.prepare(`PRAGMA table_info(stocks)`).all().map(x=>x.name);
if (!stockColumns.includes('shares_outstanding')) db.exec(`ALTER TABLE stocks ADD COLUMN shares_outstanding INTEGER NOT NULL DEFAULT 1000000`);
if (!stockColumns.includes('volume')) db.exec(`ALTER TABLE stocks ADD COLUMN volume INTEGER NOT NULL DEFAULT 100000`);



db.exec(`CREATE INDEX IF NOT EXISTS idx_lots_user_stock ON holding_lots(user_id,stock_id,created_at,id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_trades_user_created ON trades(user_id,created_at,id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_trades_stock_created ON trades(stock_id,created_at,id)`);

function rebuildMissingLots(){
  const users=db.prepare(`SELECT DISTINCT user_id FROM holdings WHERE quantity>0`).all();
  const insertLot=db.prepare(`INSERT INTO holding_lots(user_id,stock_id,quantity,remaining_quantity,unit_cost,created_trade_id) VALUES(?,?,?,?,?,?)`);
  const updateLot=db.prepare(`UPDATE holding_lots SET remaining_quantity=? WHERE id=?`);
  for(const u of users){
    const holdings=db.prepare(`SELECT * FROM holdings WHERE user_id=? AND quantity>0`).all(u.user_id);
    for(const h of holdings){
      const existing=db.prepare(`SELECT COUNT(*) c FROM holding_lots WHERE user_id=? AND stock_id=? AND remaining_quantity>0`).get(u.user_id,h.stock_id).c;
      if(existing) continue;
      const trades=db.prepare(`SELECT * FROM trades WHERE user_id=? AND stock_id=? ORDER BY id`).all(u.user_id,h.stock_id);
      let remaining=h.quantity;
      for(const t of trades){
        if(t.side==='BUY'){
          const qty=Math.max(0,Number(t.quantity));
          insertLot.run(u.user_id,h.stock_id,qty,qty,Number(t.price)||Number(h.avg_price)||0,t.id);
        }else{
          let sellQty=Number(t.quantity)||0;
          const lots=db.prepare(`SELECT * FROM holding_lots WHERE user_id=? AND stock_id=? AND remaining_quantity>0 ORDER BY id`).all(u.user_id,h.stock_id);
          for(const lot of lots){
            if(sellQty<=0) break;
            const take=Math.min(sellQty,lot.remaining_quantity);
            updateLot.run(lot.remaining_quantity-take,lot.id);
            sellQty-=take;
          }
        }
      }
      const lotQty=db.prepare(`SELECT COALESCE(SUM(remaining_quantity),0) q FROM holding_lots WHERE user_id=? AND stock_id=?`).get(u.user_id,h.stock_id).q;
      if(lotQty<remaining){
        const gap=remaining-lotQty;
        insertLot.run(u.user_id,h.stock_id,gap,gap,Number(h.avg_price)||0,null);
      }
    }
  }
}
rebuildMissingLots();

const stocks = [
  ["RELIANCE","Reliance Industries","Energy & Conglomerates",2850],
  ["TCS","Tata Consultancy Services","IT",3950],
  ["INFY","Infosys","IT",1850],
  ["HDFCBANK","HDFC Bank","Banking",1720],
  ["ICICIBANK","ICICI Bank","Banking",1380],
  ["SBIN","State Bank of India","Banking",820],
  ["AXISBANK","Axis Bank","Banking",1180],
  ["KOTAKBANK","Kotak Mahindra Bank","Banking",1980],
  ["ITC","ITC","FMCG",520],
  ["HINDUNILVR","Hindustan Unilever","FMCG",2650],
  ["NESTLEIND","Nestle India","FMCG",2450],
  ["MARUTI","Maruti Suzuki","Automobile",12500],
  ["TATAMOTORS","Tata Motors","Automobile",760],
  ["M&M","Mahindra & Mahindra","Automobile",3150],
  ["EICHERMOT","Eicher Motors","Automobile",5800],
  ["HEROMOTOCO","Hero MotoCorp","Automobile",5200],
  ["SUNPHARMA","Sun Pharma","Pharma",1720],
  ["CIPLA","Cipla","Pharma",1650],
  ["DRREDDY","Dr. Reddy's Laboratories","Pharma",1320],
  ["DIVISLAB","Divi's Laboratories","Pharma",6100],
  ["BHARTIARTL","Bharti Airtel","Telecom",1880],
  ["ADANIENT","Adani Enterprises","Infrastructure",2500],
  ["ADANIPORTS","Adani Ports","Infrastructure",1450],
  ["LT","Larsen & Toubro","Infrastructure",3850],
  ["ULTRACEMCO","UltraTech Cement","Cement",11800],
  ["ASIANPAINT","Asian Paints","Consumer",3050],
  ["TITAN","Titan Company","Consumer",3750],
  ["TRENT","Trent","Retail",4850],
  ["DMART","Avenue Supermarts","Retail",5200],
  ["BEL","Bharat Electronics","Defence",410],
  ["HAL","Hindustan Aeronautics","Defence",5150],
  ["BHEL","Bharat Heavy Electricals","Industrials",310],
  ["SIEMENS","Siemens India","Industrials",7600],
  ["POWERGRID","Power Grid Corporation","Power",360],
  ["NTPC","NTPC","Power",420],
  ["TATASTEEL","Tata Steel","Metals",185],
  ["JSWSTEEL","JSW Steel","Metals",1050],
  ["HINDALCO","Hindalco Industries","Metals",720],
  ["COALINDIA","Coal India","Mining",480],
  ["ONGC","ONGC","Energy",340],
  ["IOC","Indian Oil Corporation","Energy",165],
  ["BPCL","Bharat Petroleum","Energy",360],
  ["WIPRO","Wipro","IT",570],
  ["TECHM","Tech Mahindra","IT",1680],
  ["HCLTECH","HCLTech","IT",1750],
  ["LTIM","LTIMindtree","IT",6100],
  ["APOLLOHOSP","Apollo Hospitals","Healthcare",7600],
  ["MAXHEALTH","Max Healthcare","Healthcare",1050],
  ["INDIGO","InterGlobe Aviation","Aviation",5700],
  ["ZOMATO","Eternal (formerly Zomato)","Consumer Tech",300]
];

const seedImpacts = [
  [1, {IT:6, Banking:4, "Energy & Conglomerates":2, Pharma:-2, Telecom:3}],
  [2, {Banking:-7, FMCG:3, IT:2, Retail:4, Consumer:2}],
  [3, {Energy:9, Metals:7, Mining:6, Power:5, Aviation:-3}],
  [4, {Pharma:8, Healthcare:7, FMCG:3, IT:-2, Consumer:-2}],
  [5, {Automobile:8, Defence:10, Infrastructure:5, Industrials:4, Retail:-4}],
  [6, {IT:7, Telecom:5, "Consumer Tech":9, Banking:3, Energy:-3, Metals:-2}]
];

function seed() {
  const insertStock = db.prepare(`INSERT OR IGNORE INTO stocks(symbol,name,sector,price,base_price) VALUES(?,?,?,?,?)`);
  const tx = db.transaction(() => {
    for (const s of stocks) insertStock.run(...s, s[3]);
    for (let i=1;i<=6;i++) db.prepare(`INSERT OR IGNORE INTO rounds(id,status) VALUES(?, 'pending')`).run(i);
    db.prepare(`INSERT OR IGNORE INTO event_state(id,current_round,event_status) VALUES(1,0,'registration')`).run();
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;

if (adminPassword) {
  const adminHash = bcrypt.hashSync(adminPassword, 10);

  db.prepare(`
    INSERT INTO users(username,password_hash,role,name)
    VALUES(?,?, 'admin',?)
    ON CONFLICT(username) DO UPDATE SET
      password_hash=excluded.password_hash,
      role='admin',
      name=excluded.name
  `).run(
    adminUsername.trim().toLowerCase(),
    adminHash,
    "Administrator"
  );
}
    const all = db.prepare(`SELECT id,sector,base_price FROM stocks`).all();
    const hist = db.prepare(`INSERT INTO price_history(stock_id,round_id,price,reason) SELECT ?,NULL,?,'BASE' WHERE NOT EXISTS (SELECT 1 FROM price_history WHERE stock_id=? AND round_id IS NULL AND reason='BASE')`);
    for (const st of all) hist.run(st.id, st.base_price, st.id);
    const impactStmt = db.prepare(`INSERT OR IGNORE INTO round_impacts(round_id,stock_id,impact_pct) VALUES(?,?,?)`);
    for (const [roundId, map] of seedImpacts) {
      for (const s of all) {
        let impact = map[s.sector] ?? 0;
        if (impact === 0) {
          const deterministic = ((s.id * 13 + roundId * 7) % 9) - 4;
          impact = deterministic;
        }
        impactStmt.run(roundId, s.id, impact);
      }
    }
  });
  tx();
}
seed();
db.prepare(`UPDATE stocks SET shares_outstanding=CASE WHEN shares_outstanding IS NULL OR shares_outstanding<=0 THEN 1000000+id*125000 ELSE shares_outstanding END,
  volume=CASE WHEN volume IS NULL OR volume<=0 THEN 50000+id*7500 ELSE volume END`).run();


app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || "stock-wars-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000*60*60*12, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }
}));
app.use(express.static(path.join(__dirname,"public"), {
  setHeaders: (res, filePath) => {
    // Frontend code changes must reach players immediately during live-event deployment.
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

function user(req) { return req.session.user || null; }
function requireLogin(req,res,next) {
  if (!user(req)) return res.status(401).json({error:"Login required"});
  next();
}
function requireAdmin(req,res,next) {
  if (!user(req) || user(req).role !== "admin") return res.status(403).json({error:"Admin access required"});
  next();
}
function ensureColumn(table,column,definition){const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);if(!cols.includes(column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);}
ensureColumn('event_state','presentation_mode',"INTEGER NOT NULL DEFAULT 0");
ensureColumn('event_state','market_version',"INTEGER NOT NULL DEFAULT 0");
ensureColumn('event_state','registration_open',"INTEGER NOT NULL DEFAULT 1");
ensureColumn('users','status',"TEXT NOT NULL DEFAULT 'active'");
ensureColumn('users','last_seen_at',"INTEGER");
ensureColumn('users','last_visibility',"TEXT NOT NULL DEFAULT 'visible'");
ensureColumn('users','visibility_events',"INTEGER NOT NULL DEFAULT 0");

function state() { return db.prepare(`SELECT * FROM event_state WHERE id=1`).get(); }
function nowMs(){ return Date.now(); }
function latestAnnouncement(){
  return db.prepare(`SELECT id,message,severity,created_at FROM event_announcements WHERE active=1 ORDER BY id DESC LIMIT 1`).get() || null;
}
function publicState(){
  return {...state(),serverNow:nowMs(),newsSeconds:NEWS_SECONDS,tradeSeconds:TRADE_SECONDS,announcement:latestAnnouncement()};
}
function touchPresence(req, hidden=null){
  const u=user(req); if(!u) return;
  if(u.role==='player'){
    const vis=hidden===null ? undefined : (hidden ? 'hidden':'visible');
    if(vis!==undefined){
      db.prepare(`UPDATE users SET last_seen_at=?,last_visibility=?,visibility_events=visibility_events+1 WHERE id=?`).run(nowMs(),vis,u.id);
    }else{
      db.prepare(`UPDATE users SET last_seen_at=? WHERE id=?`).run(nowMs(),u.id);
    }
  }
}
function emitState(){ const st=publicState(); for(const res of sseClients){ try{res.write(`event: state\ndata: ${JSON.stringify(st)}\n\n`);}catch(e){} } }
const sseClients=new Set();
const tradeRate = new Map();
function audit(req, action, meta={}) {
  const u=user(req);
  db.prepare(`INSERT INTO audit_logs(user_id,role,action,meta,ip,user_agent) VALUES(?,?,?,?,?,?)`)
    .run(u?.id||null,u?.role||null,action,JSON.stringify(meta),req.ip||'',req.get('user-agent')||'');
}
function allowTradeRequest(userId){
  const now=Date.now(); const windowMs=60000; const max=30;
  const arr=(tradeRate.get(userId)||[]).filter(t=>now-t<windowMs);
  if(arr.length>=max){tradeRate.set(userId,arr);return false;}
  arr.push(now);tradeRate.set(userId,arr);return true;
}
function backupDatabase(label){
  try {
    const dir=path.join(DB_DIR,'backups'); fs.mkdirSync(dir,{recursive:true});
    const safe=String(label).replace(/[^a-z0-9_-]/gi,'_');
    const dest=path.join(dir,`stockwars-${safe}-${Date.now()}.db`);
    db.backup(dest);
    const files=fs.readdirSync(dir).filter(x=>x.endsWith('.db')).sort();
    while(files.length>10){fs.unlinkSync(path.join(dir,files.shift()));}
  } catch(e){ console.error('Backup failed:',e.message); }
}
function setEvent(values){ const keys=Object.keys(values); const sql=`UPDATE event_state SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=1`; db.prepare(sql).run(...keys.map(k=>values[k])); emitState(); }
function snapshotRound(roundId){
  const players=db.prepare(`SELECT id FROM users WHERE role='player'`).all();
  const ins=db.prepare(`INSERT INTO round_snapshots(user_id,round_id,total,cash,market_value,profit) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,round_id) DO UPDATE SET total=excluded.total,cash=excluded.cash,market_value=excluded.market_value,profit=excluded.profit`);
  for(const p of players){
    const pf=portfolio(p.id);
    ins.run(p.id,roundId,pf.total,pf.cash,pf.marketValue,pf.profit);
  }
}
const NEWS_LIBRARY = [
  {category:'Earnings Surprise', sentiment:'positive', weight:18, templates:[
    ['{{company}} beats earnings estimates as demand strengthens','{{company}} reported stronger-than-expected quarterly performance, with management pointing to resilient demand and improving operating efficiency.'],
    ['{{company}} raises outlook after strong quarter','{{company}} upgraded its near-term outlook after a stronger quarter, citing better volumes and improved margins.']
  ]},
  {category:'Earnings Miss', sentiment:'negative', weight:14, templates:[
    ['{{company}} misses expectations as costs rise','{{company}} reported weaker-than-expected performance as input costs and margin pressure weighed on the quarter.'],
    ['{{company}} cuts outlook amid softer demand','{{company}} lowered its near-term outlook after signs of softer demand and cautious customer spending.']
  ]},
  {category:'Regulatory Shift', sentiment:'negative', weight:10, templates:[
    ['{{company}} faces tighter regulatory scrutiny','New compliance requirements are expected to increase costs and slow near-term expansion, with {{company}} among the companies most exposed.']
  ]},
  {category:'Policy Support', sentiment:'positive', weight:10, templates:[
    ['Policy support gives {{company}} a boost','A new policy package is expected to support investment and demand across {{sector}}, with {{company}} positioned to benefit.']
  ]},
  {category:'Commodity Shock', sentiment:'negative', weight:9, templates:[
    ['Input costs rise, pressuring {{company}} margins','A sharp move in key input costs is expected to pressure margins across {{sector}}, with {{company}} among the more exposed names.']
  ]},
  {category:'Demand Surge', sentiment:'positive', weight:9, templates:[
    ['Demand surge lifts {{company}} outlook','Industry data points to a stronger demand cycle across {{sector}}, improving volume expectations for {{company}} and peers.']
  ]},
  {category:'Major Contract', sentiment:'positive', weight:8, templates:[
    ['{{company}} wins a major new contract','The contract is expected to improve revenue visibility and sentiment for {{company}}, with positive spillovers across {{sector}}.']
  ]},
  {category:'Supply Disruption', sentiment:'negative', weight:7, templates:[
    ['Supply disruption hits {{company}}','Logistics and supply constraints are expected to create near-term production and delivery pressure for {{company}} and parts of {{sector}}.']
  ]},
  {category:'Market Risk', sentiment:'negative', weight:8, templates:[
    ['Global risk-off mood weighs on Indian equities','Rising global uncertainty is pushing investors toward safer assets, creating broad pressure across Indian equities.']
  ]},
  {category:'Market Rally', sentiment:'positive', weight:7, templates:[
    ['Global risk appetite lifts Indian equities','Improved global risk appetite and stronger flows are supporting broad-based buying across Indian equities.']
  ]}
];
const NEWS_SECTOR_WEIGHTS = [
  ['Banking',12],['IT',10],['Energy & Conglomerates',9],['Pharma',8],['Automobile',8],['Consumer Tech',7],['FMCG',7],['Industrials',7],['Infrastructure',6],['Telecom',5],['Metals',5],['Healthcare',5],['Retail',4],['Aviation',3],['Mining',3]
];
function weightedPick(items){
  const total=items.reduce((a,x)=>a+Number(x.weight||0),0); let r=Math.random()*total;
  for(const x of items){r-=Number(x.weight||0);if(r<=0)return x;} return items[items.length-1];
}
function weightedSector(){return weightedPick(NEWS_SECTOR_WEIGHTS.map(([sector,weight])=>({sector,weight}))).sector;}
function randomBetween(min,max){return min+Math.random()*(max-min);}
function chooseTemplate(entry){return entry.templates[Math.floor(Math.random()*entry.templates.length)];}
function newsImpact(entry){
  const magnitude=randomBetween(AUTO_NEWS_MIN_PCT,AUTO_NEWS_MAX_PCT);
  return money((entry.sentiment==='positive'?1:-1)*magnitude);
}
function buildNewsBody(entry, company, sector, sentiment, impact, marketWide){
  const direction=sentiment==='positive'?'positive':'negative';
  const pct=(Math.abs(Number(impact))||0).toFixed(1);
  const subject=marketWide?'Indian equities':company;
  const sectorText=marketWide?'the broader market':sector;
  const lines={
    'Earnings Surprise':[
      `${company} reported a stronger-than-expected quarter, supported by resilient demand and improved operating execution.`,
      `Management highlighted healthy order flow and better visibility for the coming period.`,
      `Analysts expect the result to improve sentiment around ${company} and the wider ${sector} space.`,
      `The market is watching whether the stronger performance can be sustained in the next quarter.`
    ],
    'Earnings Miss':[
      `${company} reported weaker-than-expected results as demand and margins came under pressure.`,
      `Management pointed to cautious customer spending and higher operating costs as key concerns.`,
      `The weaker update is putting pressure on sentiment across the ${sector} sector.`,
      `Investors will watch upcoming guidance for signs of stabilization or further deterioration.`
    ],
    'Regulatory Shift':[
      `Regulators have introduced tighter requirements that could affect ${company}'s near-term operations.`,
      `The changes are expected to increase compliance costs and may slow planned expansion.`,
      `${company} is among the more exposed names in the ${sector} sector.`,
      `Investors are assessing how quickly the company can adapt without affecting profitability.`
    ],
    'Policy Support':[
      `A new policy package is expected to support investment and demand across the ${sector} sector.`,
      `${company} is positioned to benefit from the proposed incentives and higher activity.`,
      `Industry participants expect the measures to improve order visibility over the coming quarters.`,
      `The market is now assessing how quickly the policy support can translate into earnings.`
    ],
    'Commodity Shock':[
      `A sharp move in key input prices is changing the cost outlook for ${company}.`,
      `Higher input costs could pressure margins if the increase cannot be passed on to customers.`,
      `Other companies across ${sector} may face similar cost pressure.`,
      `Investors are watching commodity prices closely for signs of further escalation or relief.`
    ],
    'Demand Surge':[
      `Fresh industry data points to stronger demand across ${sector}, improving volume expectations.`,
      `${company} is among the companies positioned to capture the increase in customer activity.`,
      `Higher utilization and stronger volumes could support revenue growth in the coming periods.`,
      `The key question for investors is whether the demand improvement will persist.`
    ],
    'Major Contract':[
      `${company} has secured a major new contract that improves its revenue visibility.`,
      `The project is expected to contribute to future order execution and cash flows.`,
      `The announcement also improves sentiment toward selected companies in ${sector}.`,
      `Investors will track execution milestones and the contract's contribution to earnings.`
    ],
    'Supply Disruption':[
      `A supply-chain disruption is creating near-term production and delivery pressure for ${company}.`,
      `Logistics constraints could delay shipments and increase operating costs.`,
      `Parts of the ${sector} sector may also experience knock-on effects if the disruption persists.`,
      `Investors are watching inventory levels and recovery timelines for further clues.`
    ],
    'Market Risk':[
      `Rising global uncertainty is pushing investors toward safer assets and reducing risk appetite.`,
      `Indian equities are facing broader selling pressure as investors reassess growth expectations.`,
      `High-beta sectors and stocks may see larger moves as volatility increases.`,
      `Market participants are watching global cues and institutional flows for signs of stabilization.`
    ],
    'Market Rally':[
      `Improved global risk appetite is supporting broader buying across Indian equities.`,
      `Stronger overseas flows and easing uncertainty are improving market sentiment.`,
      `Cyclical and growth-oriented sectors are seeing increased investor interest.`,
      `The market will watch whether the positive momentum can continue through the session.`
    ]
  };
  const chosen=lines[entry.category]||[
    `${subject} is seeing a ${direction} development that is attracting investor attention.`,
    `The development is expected to influence sentiment across ${sectorText}.`,
    `Market participants are reassessing near-term earnings and growth expectations.`,
    `Investors will watch subsequent updates to determine whether the move is sustained.`
  ];
  return chosen.join('\n');
}
function generateRoundNews(roundId){
  if(!AUTO_NEWS) return null;
  // Eight distinct stories: normally six different sectors + two company/market
  // stories. Each story names a real stock where possible, while its impact also
  // propagates to peers in the same sector. Prices are not changed until trading closes.
  const storyCount=8;
  const tx=db.transaction(()=>{
    db.prepare(`DELETE FROM market_news_events WHERE round_id=?`).run(roundId);
    db.prepare(`DELETE FROM round_impacts WHERE round_id=?`).run(roundId);
    const all=db.prepare(`SELECT id,name,symbol,sector FROM stocks`).all();
    const upsert=db.prepare(`INSERT INTO round_impacts(round_id,stock_id,impact_pct) VALUES(?,?,?) ON CONFLICT(round_id,stock_id) DO UPDATE SET impact_pct=impact_pct+excluded.impact_pct`);
    const insertNews=db.prepare(`INSERT INTO market_news_events(round_id,category,sentiment,scope,target_sector,headline,body,impact_pct) VALUES(?,?,?,?,?,?,?,?)`);
    const stories=[]; const usedCategories=new Set(); const usedSectors=new Set();
    const sectorPool=NEWS_SECTOR_WEIGHTS.map(([sector])=>sector).sort(()=>Math.random()-0.5);
    const pickFreshSector=()=>{
      const available=sectorPool.filter(x=>!usedSectors.has(x));
      const sector=available.length?available[0]:weightedSector();
      usedSectors.add(sector); return sector;
    };
    for(let i=0;i<storyCount;i++){
      const candidates=NEWS_LIBRARY.filter(x=>!usedCategories.has(x.category));
      const entry=weightedPick(candidates.length?candidates:NEWS_LIBRARY);
      usedCategories.add(entry.category);
      const marketWide=(entry.category==='Market Risk'||entry.category==='Market Rally') && i>=6;
      const targetSector=marketWide?null:pickFreshSector();
      const sectorStocks=targetSector?all.filter(st=>st.sector===targetSector):[];
      const companyRow=sectorStocks.length?sectorStocks[Math.floor(Math.random()*sectorStocks.length)]:null;
      const company=companyRow?.name||targetSector||'Indian equities';
      const symbol=companyRow?.symbol||'';
      const [rawTitle,rawBody]=chooseTemplate(entry);
      const title=rawTitle.replaceAll('{{company}}',company).replaceAll('{{symbol}}',symbol).replaceAll('{{sector}}',targetSector||'the market');
      const magnitude=randomBetween(AUTO_NEWS_MIN_PCT/2.2,AUTO_NEWS_MAX_PCT/2.2);
      const impact=money((entry.sentiment==='positive'?1:-1)*magnitude);
      const body=buildNewsBody(entry,company,targetSector||'Indian equities',entry.sentiment,impact,marketWide);
      const scope=marketWide?'MARKET':'STOCK+SECTOR';
      const info=insertNews.run(roundId,entry.category,entry.sentiment,scope,targetSector,title,body,impact);
      stories.push({id:Number(info.lastInsertRowid),category:entry.category,sentiment:entry.sentiment,scope,targetSector,title,body,impactPct:impact,stock:company,symbol});
      for(const st of all){
        let pct;
        if(marketWide) pct=impact*randomBetween(0.35,0.75)+randomBetween(-0.25,0.25);
        else if(st.id===companyRow?.id) pct=impact*randomBetween(0.95,1.25);
        else if(st.sector===targetSector) pct=impact*randomBetween(0.55,0.95);
        else { pct=impact*randomBetween(0.005,0.045); if(Math.random()<0.40)pct=-pct; }
        upsert.run(roundId,st.id,money(Math.max(-4,Math.min(4,pct))));
      }
    }
    const cap=Math.max(AUTO_NEWS_MAX_PCT*1.35,8);
    const impacts=db.prepare(`SELECT stock_id,impact_pct FROM round_impacts WHERE round_id=?`).all(roundId);
    const normalize=db.prepare(`UPDATE round_impacts SET impact_pct=? WHERE round_id=? AND stock_id=?`);
    for(const x of impacts) normalize.run(money(Math.max(-cap,Math.min(cap,Number(x.impact_pct)))),roundId,x.stock_id);
    const lead=stories[0];
    const roundTitle=`Round ${roundId} · ${stories.length} market stories`;
    const roundSummary=stories.slice(0,3).map((x,i)=>`${i+1}. ${x.title}`).join('\n');
    db.prepare(`UPDATE rounds SET news_title=?,news_body=?,news_impact_note=? WHERE id=?`).run(
      roundTitle,
      `${stories.length} independent stock and sector stories are live.\n${roundSummary}`,
      `${stories.length} stories · each story has its own stock/sector impact · prices update after trading`,
      roundId
    );
    return stories;
  });
  return tx();
}
function applyRoundPrices(roundId){
  backupDatabase(`before-round-${roundId}`);
  const tx=db.transaction(()=>{
    const news=db.prepare(`SELECT id FROM market_news_events WHERE round_id=?`).get(roundId);
    const impacts=db.prepare(`SELECT stock_id,impact_pct FROM round_impacts WHERE round_id=?`).all(roundId);
    const priceEvent=db.prepare(`INSERT INTO round_price_events(round_id,stock_id,old_price,new_price,impact_pct,news_event_id) VALUES(?,?,?,?,?,?)`);
    for(const x of impacts){
      const before=Number(db.prepare(`SELECT price FROM stocks WHERE id=?`).get(x.stock_id).price);
      const after=money(Math.max(0.01,before*(1+Number(x.impact_pct)/100)));
      db.prepare(`UPDATE stocks SET price=? WHERE id=?`).run(after,x.stock_id);
      db.prepare(`INSERT INTO price_history(stock_id,round_id,price,reason) VALUES(?,?,?,'NEWS_IMPACT')`).run(x.stock_id,roundId,after);
      priceEvent.run(roundId,x.stock_id,before,after,Number(x.impact_pct),news?.id||null);
    }
    db.prepare(`UPDATE rounds SET status='applied',applied_at=CURRENT_TIMESTAMP,locked_at=COALESCE(locked_at,CURRENT_TIMESTAMP) WHERE id=?`).run(roundId);
    snapshotRound(roundId);
    db.prepare(`UPDATE event_state SET market_version=market_version+1,event_status=?,phase='idle',phase_started_at=NULL,phase_ends_at=NULL,paused_remaining=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=1`).run(roundId===6?'finished':'between_rounds');
  });
  tx();
  emitState();
}
function transitionTimer(){
  const st=state(); if(!st || st.event_status==='paused' || !st.phase_ends_at) return;
  const now=nowMs(); if(now<st.phase_ends_at) return;
  if(st.phase==='news'){
    const tradeStart=Number(st.phase_ends_at);
    const tradeEnd=tradeStart+TRADE_SECONDS*1000;
    const tx=db.transaction(()=>{
      const live=state();
      if(live.event_status!=='live'||live.phase!=='news'||live.current_round!==st.current_round) return false;
      db.prepare(`UPDATE rounds SET status='trading' WHERE id=? AND status='news'`).run(st.current_round);
      db.prepare(`UPDATE event_state SET phase='trading',phase_started_at=?,phase_ends_at=?,paused_remaining=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=1`).run(tradeStart,tradeEnd);
      return true;
    });
    const moved=tx();
    if(!moved)return;
    if(now>=tradeEnd){ applyRoundPrices(st.current_round); return; }
    emitState();
    return;
  }
  if(st.phase==='trading'){
    // Price application is a single SQLite transaction. Once this commits, no trade can be accepted for the old phase.
    applyRoundPrices(st.current_round);
  }
}
setInterval(transitionTimer,250);
// Recover any phase that elapsed while the Node process was offline.
setImmediate(()=>{try{transitionTimer();}catch(e){console.error('Startup recovery failed:',e.message);}});
function currentRound() {
  const s = state();
  return s.current_round;
}
function roundOpen() {
  const r = currentRound();
  const st = state();
  return r > 0 && st.event_status === "live" && st.phase === 'trading' && db.prepare(`SELECT status FROM rounds WHERE id=?`).get(r)?.status === "trading";
}
function money(n) { return Math.round(Number(n)*100)/100; }

function portfolio(userId) {
  const account = db.prepare(`SELECT cash FROM accounts WHERE user_id=?`).get(userId);
  const rows = db.prepare(`
    SELECT h.stock_id,h.quantity,h.avg_price,s.symbol,s.name,s.sector,s.price,
           COALESCE((SELECT SUM(t.quantity) FROM trades t WHERE t.user_id=h.user_id AND t.stock_id=h.stock_id AND t.side='BUY'),0) AS total_purchased,
           COALESCE((SELECT SUM(t.quantity) FROM trades t WHERE t.user_id=h.user_id AND t.stock_id=h.stock_id AND t.side='SELL'),0) AS total_sold,
           (h.quantity*s.price) AS market_value,
           (h.quantity*h.avg_price) AS cost_basis
    FROM holdings h JOIN stocks s ON s.id=h.stock_id
    WHERE h.user_id=? AND h.quantity>0 ORDER BY market_value DESC
  `).all(userId);
  let marketValue=0,cost=0,unrealizedPnl=0;
  const holdings=rows.map(h=>{
    const mv=money(h.quantity*h.price), cb=money(h.quantity*h.avg_price), up=money(mv-cb);
    marketValue+=mv; cost+=cb; unrealizedPnl+=up;
    return {...h,market_value:mv,cost_basis:cb,unrealized_pnl:up,day_change_pct:money(((h.price-h.avg_price)/(h.avg_price||1))*100)};
  });
  const realizedRow=db.prepare(`SELECT COALESCE(SUM(realized_pnl),0) v FROM trades WHERE user_id=? AND side='SELL'`).get(userId);
  const realizedPnl=money(realizedRow.v||0);
  const cash=money(account?.cash||0), total=money(cash+marketValue);
  return {cash,marketValue:money(marketValue),cost:money(cost),total,profit:money(total-STARTING_CAPITAL),unrealizedPnl:money(unrealizedPnl),realizedPnl,holdings};
}
function tradeQuote({stock,side,quantity,orderType='MARKET',limitPrice=null}){
  const qty=Number(quantity), lp=limitPrice===null||limitPrice===''?null:Number(limitPrice);
  if(!stock) throw new Error('Stock not found.');
  if(!['BUY','SELL'].includes(side)) throw new Error('Invalid order side.');
  if(!Number.isInteger(qty)||qty<=0) throw new Error('Quantity must be a positive whole number.');
  const type=String(orderType||'MARKET').toUpperCase();
  if(!['MARKET','LIMIT'].includes(type)) throw new Error('Order type must be MARKET or LIMIT.');
  if(type==='LIMIT' && (!Number.isFinite(lp)||lp<=0)) throw new Error('Limit price must be greater than zero.');

  const marketPrice=Number(stock.price);
  const volume=Math.max(1,Number(stock.volume)||100000);
  const impactBps=Math.min(MAX_IMPACT_BPS, Math.max(0, (qty/volume)*1000));
  const slippageBps=type==='MARKET'?Math.max(0,SLIPPAGE_BPS):0;
  const totalAdjustmentBps=slippageBps+impactBps;
  let executionPrice=type==='LIMIT'?lp:marketPrice*(1+(side==='BUY'?1:-1)*totalAdjustmentBps/10000);

  if(type==='LIMIT'){
    const executable=side==='BUY'?marketPrice<=lp:marketPrice>=lp;
    if(!executable) throw new Error(`Limit order not executable at the current market price of ${money(marketPrice)}.`);
  }
  executionPrice=money(Math.max(0.01,executionPrice));
  const gross=money(executionPrice*qty), fee=0;
  const net=gross;
  return {
    quantity:qty,orderType:type,limitPrice:lp,marketPrice,
    executionPrice,gross,fee,net,
    slippageBps:money(slippageBps),impactBps:money(impactBps),totalAdjustmentBps:money(totalAdjustmentBps),
    estimated:true
  };
}
function fifoSellCost(userId,stockId,qty){
  let remaining=qty,totalCost=0;
  const lots=db.prepare(`SELECT * FROM holding_lots WHERE user_id=? AND stock_id=? AND remaining_quantity>0 ORDER BY id`).all(userId,stockId);
  for(const lot of lots){
    if(remaining<=0) break;
    const take=Math.min(remaining,lot.remaining_quantity);
    totalCost+=take*Number(lot.unit_cost);
    remaining-=take;
  }
  if(remaining>0) throw new Error('Cost-basis lots are inconsistent with the holding quantity.');
  return money(totalCost);
}
function consumeLotsFIFO(userId,stockId,qty){
  let remaining=qty;
  const lots=db.prepare(`SELECT * FROM holding_lots WHERE user_id=? AND stock_id=? AND remaining_quantity>0 ORDER BY id`).all(userId,stockId);
  for(const lot of lots){
    if(remaining<=0) break;
    const take=Math.min(remaining,lot.remaining_quantity);
    const next=lot.remaining_quantity-take;
    db.prepare(`UPDATE holding_lots SET remaining_quantity=? WHERE id=?`).run(next,lot.id);
    remaining-=take;
  }
  if(remaining>0) throw new Error('Cost-basis lots are inconsistent with the holding quantity.');
}
function remainingLotAverage(userId,stockId){
  const r=db.prepare(`SELECT COALESCE(SUM(remaining_quantity),0) qty,COALESCE(SUM(remaining_quantity*unit_cost),0) cost FROM holding_lots WHERE user_id=? AND stock_id=? AND remaining_quantity>0`).get(userId,stockId);
  return r.qty?money(r.cost/r.qty):0;
}


app.post("/api/auth/register", (req,res) => {
  const {name,username,password} = req.body;
  const st=state();
  if(!Number(st.registration_open) || st.current_round>0 || st.event_status!=='registration') return res.status(403).json({error:"Player registration is closed. Please contact the host."});
  if (!name || !username || !password || password.length < 4) return res.status(400).json({error:"Name, username and password (4+ chars) are required."});
  try {
    const hash = bcrypt.hashSync(password,10);
    const info = db.prepare(`INSERT INTO users(username,password_hash,role,name) VALUES(?,?, 'player',?)`).run(username.trim().toLowerCase(),hash,name.trim());
    db.prepare(`INSERT INTO accounts(user_id,cash) VALUES(?,?)`).run(info.lastInsertRowid,STARTING_CAPITAL);
    req.session.user = {id:info.lastInsertRowid,username:username.trim().toLowerCase(),role:"player",name:name.trim()};
    audit(req,'PLAYER_REGISTER',{username:req.session.user.username});
    res.json({ok:true,user:req.session.user});
  } catch(e) {
    res.status(400).json({error:"Username already exists."});
  }
});

app.post("/api/auth/player-login", (req,res) => {
  const {username,password} = req.body;
  const normalized=(username||"").trim().toLowerCase();
  const u = db.prepare(`SELECT * FROM users WHERE username=?`).get(normalized);
  if (!u || !bcrypt.compareSync(password||"",u.password_hash)) return res.status(401).json({error:"Invalid player username or password."});
  if (u.role !== 'player') {
    audit(req,'PLAYER_LOGIN_REJECTED',{username:normalized,role:u.role});
    return res.status(403).json({error:"Host credentials cannot be used in the Player Login. Please use Host / Admin Login."});
  }
  if ((u.status||'active') === 'suspended') return res.status(403).json({error:"This player account is suspended by the host."});
  req.session.user = {id:u.id,username:u.username,role:'player',name:u.name,status:u.status||'active'};
  touchPresence(req);
  audit(req,'PLAYER_LOGIN',{role:'player'});
  res.json({ok:true,user:req.session.user});
});

app.post("/api/auth/admin-login", (req,res) => {
  const {username,password} = req.body;
  const u = db.prepare(`SELECT * FROM users WHERE username=? AND role='admin'`).get((username||"").trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password||"",u.password_hash)) return res.status(401).json({error:"Invalid host username or password."});
  req.session.user = {id:u.id,username:u.username,role:'admin',name:u.name,status:u.status||'active'};
  audit(req,'ADMIN_LOGIN',{username:u.username});
  res.json({ok:true,user:req.session.user});
});

app.post("/api/auth/logout",(req,res)=>{audit(req,'LOGOUT',{});req.session.destroy(()=>res.json({ok:true}));});
app.get("/api/me",(req,res)=>{
  const u=user(req);
  if(u){
    const fresh=db.prepare(`SELECT id,username,role,name,status FROM users WHERE id=?`).get(u.id);
    if(fresh) req.session.user={...u,...fresh};
    touchPresence(req);
  }
  res.json({user:user(req),state:publicState()});
});

app.get('/api/events', requireLogin, (req,res)=>{ touchPresence(req); res.setHeader('Content-Type','text/event-stream'); res.setHeader('Cache-Control','no-cache'); res.setHeader('Connection','keep-alive'); res.flushHeaders?.(); res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`); sseClients.add(res); const keep=setInterval(()=>{try{res.write(': ping\n\n')}catch(e){}},15000); req.on('close',()=>{clearInterval(keep);sseClients.delete(res);}); });
app.post('/api/player/visibility', requireLogin, (req,res)=>{
  if(user(req).role==='player'){
    const hidden=Boolean(req.body?.hidden);
    touchPresence(req,hidden);
    audit(req,'TAB_VISIBILITY',{hidden});
  }
  res.json({ok:true});
});
app.post('/api/player/heartbeat', requireLogin, (req,res)=>{touchPresence(req);res.json({ok:true,serverNow:nowMs()});});

app.get("/api/stocks", requireLogin, (req,res)=>{
  const stocks = db.prepare(`SELECT id,symbol,name,sector,price,base_price,shares_outstanding,volume FROM stocks ORDER BY sector,symbol`).all();
  res.json(stocks.map(s=>({...s,
    market_cap:Math.round(Number(s.price)*Number(s.shares_outstanding)),
    change_pct:money(((Number(s.price)-Number(s.base_price))/(Number(s.base_price)||1))*100),
    trading_volume:Number(s.volume)||0
  })));
});
app.get("/api/sectors", requireLogin, (req,res)=>{
  const rows=db.prepare(`SELECT sector,COUNT(*) AS stock_count FROM stocks GROUP BY sector ORDER BY sector COLLATE NOCASE`).all();
  const sectors=rows.map(x=>({...x,slug:String(x.sector).toLowerCase().replace(/[^a-z0-9]+/g,'-')}));
  res.json({sectors});
});
app.get("/api/sectors/:sector", requireLogin, (req,res)=>{
  const sector=String(req.params.sector||'');
  const rows=db.prepare(`SELECT id,symbol,name,sector,price,base_price,shares_outstanding,volume FROM stocks WHERE sector=? ORDER BY symbol`).all(sector);
  if(!rows.length) return res.status(404).json({error:'Sector not found.'});
  res.json({sector,stocks:rows.map(s=>({...s,
    market_cap:Math.round(Number(s.price)*Number(s.shares_outstanding)),
    change_pct:money(((Number(s.price)-Number(s.base_price))/(Number(s.base_price)||1))*100),
    trading_volume:Number(s.volume)||0
  }))});
});

app.get("/api/admin/stocks", requireAdmin, (req,res)=>{
  const r=currentRound();
  const stocks = db.prepare(`
    SELECT s.*, COALESCE(ri.impact_pct,0) AS current_impact
    FROM stocks s LEFT JOIN round_impacts ri ON ri.stock_id=s.id AND ri.round_id=?
    ORDER BY s.sector,s.symbol
  `).all(r || 1);
  res.json(stocks);
});

app.get("/api/rounds", requireLogin, (req,res)=>{
  const rounds = db.prepare(`SELECT id,status,news_title,news_body,news_impact_note,released_at,locked_at,applied_at FROM rounds ORDER BY id`).all();
  res.json({rounds,state:state()});
});

app.get("/api/player/dashboard", requireLogin, (req,res)=>{
  if (user(req).role !== "player") return res.status(403).json({error:"Player access required"});
  const p=portfolio(user(req).id);
  const trades=db.prepare(`
    SELECT t.*,s.symbol,s.name FROM trades t JOIN stocks s ON s.id=t.stock_id
    WHERE t.user_id=? ORDER BY t.id DESC LIMIT 100
  `).all(user(req).id);
  const r=currentRound();
  const news=r ? db.prepare(`SELECT id,status,news_title,news_body,news_impact_note FROM rounds WHERE id=?`).get(r) : null;
  const newsEventsRaw=r ? db.prepare(`SELECT id,category,sentiment,scope,target_sector,headline,body,impact_pct,generated_at FROM market_news_events WHERE round_id=? ORDER BY id`).all(r) : [];
  // Normalize older rounds created before the newline fix. Some stored bodies
  // contain the two literal characters \\n instead of a real line break.
  // Keeping this normalization server-side guarantees every player receives
  // readable article text even when an existing database is reused.
  const newsEvents=newsEventsRaw.map(n=>({...n,body:String(n.body||'').replace(/\\n/g,'\n')}));
  const me=db.prepare(`SELECT status,last_seen_at,last_visibility,visibility_events FROM users WHERE id=?`).get(user(req).id);
  const history=db.prepare(`SELECT round_id,total,cash,market_value,profit,created_at FROM round_snapshots WHERE user_id=? ORDER BY round_id`).all(user(req).id);
  res.json({portfolio:p,trades,round:news,newsEvents,state:state(),player:{status:me?.status||'active',lastSeenAt:me?.last_seen_at,lastVisibility:me?.last_visibility,visibilityEvents:me?.visibility_events||0},roundHistory:history});
});

app.post("/api/player/trade", requireLogin, (req,res)=>{
  if (user(req).role !== "player") return res.status(403).json({error:"Player access required"});
  const accountUser=db.prepare(`SELECT status FROM users WHERE id=?`).get(user(req).id);
  if(accountUser?.status==='suspended') return res.status(403).json({error:"Your trading account has been suspended by the host."});
  touchPresence(req);
  if (!roundOpen()) return res.status(400).json({error:"Trading is currently closed."});
  const {stockId,side,quantity,clientNonce,orderType,limitPrice}=req.body;
  if(!clientNonce || !/^[A-Za-z0-9_-]{16,80}$/.test(String(clientNonce))) return res.status(400).json({error:'Invalid order nonce.'});
  if(!allowTradeRequest(user(req).id)) return res.status(429).json({error:'Too many order attempts. Please wait a moment.'});
  const r=currentRound();
  let result=null, q=null, stock=null;
  const tx=db.transaction(()=>{
    const live=state();
    if(live.event_status!=='live' || live.phase!=='trading' || live.current_round!==r || db.prepare(`SELECT status FROM rounds WHERE id=?`).get(r)?.status !== 'trading') throw new Error('Trading window is closed.');
    // IMPORTANT: read the stock price and calculate the quote INSIDE the same transaction that commits the trade.
    // This removes the stale-price race at a round boundary.
    stock=db.prepare(`SELECT * FROM stocks WHERE id=?`).get(Number(stockId));
    if(!stock) throw new Error('Stock not found.');
    q=tradeQuote({stock,side,quantity,orderType,limitPrice});
    const account=db.prepare(`SELECT * FROM accounts WHERE user_id=?`).get(user(req).id);
    const holding=db.prepare(`SELECT * FROM holdings WHERE user_id=? AND stock_id=?`).get(user(req).id,stock.id);
    const existing=db.prepare(`SELECT id FROM trade_nonces WHERE user_id=? AND nonce=?`).get(user(req).id,String(clientNonce));
    if(existing) throw new Error('Duplicate order ignored.');
    db.prepare(`INSERT INTO trade_nonces(user_id,nonce) VALUES(?,?)`).run(user(req).id,String(clientNonce));
    let realized=0;
    if(side==="BUY"){
      if(account.cash < q.net) throw new Error(`Insufficient cash. Required ${money(q.net)}.`);
      const oldQty=holding?.quantity||0, oldAvg=holding?.avg_price||0, newQty=oldQty+q.quantity;
      const newAvg=money(((oldQty*oldAvg)+(q.quantity*q.executionPrice))/newQty);
      db.prepare(`UPDATE accounts SET cash=cash-? WHERE user_id=?`).run(q.net,user(req).id);
      db.prepare(`INSERT INTO holdings(user_id,stock_id,quantity,avg_price) VALUES(?,?,?,?) ON CONFLICT(user_id,stock_id) DO UPDATE SET quantity=excluded.quantity,avg_price=excluded.avg_price`).run(user(req).id,stock.id,newQty,newAvg);
    } else {
      if(!holding || holding.quantity<q.quantity) throw new Error(`Not enough shares. You hold ${holding?.quantity||0}.`);
      const method=state().cost_basis_method||DEFAULT_COST_BASIS;
      const costBasis=method==='AVERAGE'?money(q.quantity*holding.avg_price):fifoSellCost(user(req).id,stock.id,q.quantity);
      realized=money((q.net)-costBasis);
      db.prepare(`UPDATE accounts SET cash=cash+? WHERE user_id=?`).run(q.net,user(req).id);
      const remaining=holding.quantity-q.quantity;
      if(method==='FIFO') consumeLotsFIFO(user(req).id,stock.id,q.quantity);
      if(remaining===0){
        db.prepare(`DELETE FROM holdings WHERE user_id=? AND stock_id=?`).run(user(req).id,stock.id);
        db.prepare(`DELETE FROM holding_lots WHERE user_id=? AND stock_id=?`).run(user(req).id,stock.id);
      } else {
        const nextAvg=method==='FIFO'?remainingLotAverage(user(req).id,stock.id):holding.avg_price;
        db.prepare(`UPDATE holdings SET quantity=?,avg_price=? WHERE user_id=? AND stock_id=?`).run(remaining,nextAvg,user(req).id,stock.id);
      }
    }
    const info=db.prepare(`INSERT INTO trades(user_id,stock_id,side,quantity,price,total,round_id,order_type,limit_price,fee,net_total,realized_pnl) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(user(req).id,stock.id,side,q.quantity,q.executionPrice,q.gross,r,q.orderType,q.limitPrice,q.fee,q.net,realized);
    if(side==='BUY'){
      db.prepare(`INSERT INTO holding_lots(user_id,stock_id,quantity,remaining_quantity,unit_cost,created_trade_id) VALUES(?,?,?,?,?,?)`)
        .run(user(req).id,stock.id,q.quantity,q.quantity,money(q.executionPrice),info.lastInsertRowid);
    }
    result={tradeId:info.lastInsertRowid,realizedPnl:realized,...q};
  });
  try { tx(); audit(req,'TRADE',{stockId:Number(stockId),side,quantity:q.quantity,round:r,orderType:q.orderType,limitPrice:q.limitPrice,fee:q.fee,realizedPnl:result.realizedPnl}); res.json({ok:true,trade:result,portfolio:portfolio(user(req).id)}); }
  catch(e){res.status(400).json({error:e.message});}
});

app.get("/api/player/quote", requireLogin, (req,res)=>{
  if(user(req).role!=='player') return res.status(403).json({error:'Player access required'});
  try{
    const stock=db.prepare(`SELECT * FROM stocks WHERE id=?`).get(Number(req.query.stockId));
    const side=String(req.query.side||'BUY').toUpperCase();
    const q=tradeQuote({stock,side,quantity:Number(req.query.quantity||1),orderType:req.query.orderType,limitPrice:req.query.limitPrice});
    const h=db.prepare(`SELECT quantity,avg_price FROM holdings WHERE user_id=? AND stock_id=?`).get(user(req).id,stock?.id);
    const account=db.prepare(`SELECT cash FROM accounts WHERE user_id=?`).get(user(req).id);
    if(q.orderType==='MARKET' || q.executionPrice>0) res.json({...q,stockSymbol:stock.symbol,stockName:stock.name,stockPrice:stock.price,availableQuantity:h?.quantity||0,currentBalance:money(account?.cash||0),balanceAfter:side==='BUY'?money((account?.cash||0)-q.net):money((account?.cash||0)+q.net),costBasisMethod:state().cost_basis_method||DEFAULT_COST_BASIS});
  }catch(e){res.status(400).json({error:e.message});}
});

app.get("/api/player/transactions", requireLogin, (req,res)=>{
  if(user(req).role!=='player') return res.status(403).json({error:'Player access required'});
  const rows=db.prepare(`SELECT t.id,t.created_at,t.side,t.quantity,t.price,t.total,t.order_type,t.limit_price,t.fee,t.net_total,t.realized_pnl,t.round_id,s.symbol,s.name
    FROM trades t JOIN stocks s ON s.id=t.stock_id WHERE t.user_id=? ORDER BY t.id DESC LIMIT 500`).all(user(req).id);
  res.json({transactions:rows,costBasisMethod:state().cost_basis_method||DEFAULT_COST_BASIS});
});
app.get("/api/player/export-transactions", requireLogin, (req,res)=>{
  if(user(req).role!=='player') return res.status(403).json({error:'Player access required'});
  // Final player export intentionally contains only the four requested fields.
  // The execution price is the actual price recorded for that transaction.
  const rows=db.prepare(`SELECT t.round_id,s.name,t.price,t.quantity
    FROM trades t JOIN stocks s ON s.id=t.stock_id WHERE t.user_id=? ORDER BY t.id`).all(user(req).id);
  const csvEscape=v=>{const text=String(v??'');return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text};
  const headers=['Round','Stock Name','Price','Qty'];
  const csv=['\uFEFF'+headers.join(','),...rows.map(r=>[r.round_id,r.name,Number(r.price).toFixed(2),r.quantity].map(csvEscape).join(','))].join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="stock-wars-transaction-history.csv"');
  res.send(csv);
});


function finalRankings(){
  const players=db.prepare(`SELECT id,name,username,created_at FROM users WHERE role='player'`).all();
  return players.map(p=>{const pf=portfolio(p.id);const trades=db.prepare(`SELECT COUNT(*) c FROM trades WHERE user_id=?`).get(p.id).c;const first=db.prepare(`SELECT MIN(id) id FROM trades WHERE user_id=?`).get(p.id).id||Number.MAX_SAFE_INTEGER;return {...p,...pf,tradeCount:trades,firstTradeId:first,playerId:`STW-${String(p.id).padStart(3,'0')}`};})
    .sort((a,b)=>b.total-a.total||b.cash-a.cash||a.tradeCount-b.tradeCount||String(a.created_at).localeCompare(String(b.created_at)))
    .map((p,i)=>({...p,rank:i+1}));
}
app.get("/api/leaderboard", requireLogin, (req,res)=>{
  res.json(finalRankings().map(p=>({id:p.id,playerId:p.playerId,name:p.name,username:p.username,cash:p.cash,marketValue:p.marketValue,total:p.total,profit:p.profit,tradeCount:p.tradeCount,rank:p.rank})));
});

app.get("/api/admin/players", requireAdmin, (req,res)=>{
  const players=db.prepare(`SELECT id,name,username,created_at,status,last_seen_at,last_visibility,visibility_events FROM users WHERE role='player' ORDER BY id DESC`).all();
  const now=nowMs();
  res.json(players.map(p=>({...p,...portfolio(p.id),playerId:`STW-${String(p.id).padStart(3,'0')}`,online:Boolean(p.last_seen_at&&now-p.last_seen_at<30000),status:p.status||'active',lastSeenAt:p.last_seen_at,lastVisibility:p.last_visibility,visibilityEvents:p.visibility_events||0})));
});

app.get("/api/admin/player/:id", requireAdmin, (req,res)=>{
  const p=db.prepare(`SELECT id,name,username,created_at FROM users WHERE id=? AND role='player'`).get(Number(req.params.id));
  if(!p) return res.status(404).json({error:"Player not found"});
  res.json({...p,...portfolio(p.id),trades:db.prepare(`SELECT t.*,s.symbol,s.name FROM trades t JOIN stocks s ON s.id=t.stock_id WHERE t.user_id=? ORDER BY t.id DESC`).all(p.id)});
});

app.get("/api/admin/impacts", requireAdmin, (req,res)=>{
  const rows=db.prepare(`SELECT ri.round_id,ri.stock_id,ri.impact_pct,s.symbol FROM round_impacts ri JOIN stocks s ON s.id=ri.stock_id ORDER BY ri.round_id,s.symbol`).all();
  res.json(rows);
});

app.post("/api/admin/impact", requireAdmin, (req,res)=>{
  const roundId=Number(req.body.roundId), stockId=Number(req.body.stockId), impact=Number(req.body.impactPct);
  if(roundId<1||roundId>6||!Number.isFinite(impact)||impact<-100||impact>100) return res.status(400).json({error:"Invalid impact."});
  db.prepare(`INSERT INTO round_impacts(round_id,stock_id,impact_pct) VALUES(?,?,?) ON CONFLICT(round_id,stock_id) DO UPDATE SET impact_pct=excluded.impact_pct`).run(roundId,stockId,impact);
  res.json({ok:true});
});

app.post("/api/admin/news", requireAdmin, (req,res)=>{
  const roundId=Number(req.body.roundId);
  const {title,body,note}=req.body;
  if(roundId<1||roundId>6) return res.status(400).json({error:"Invalid round."});
  db.prepare(`UPDATE rounds SET news_title=?,news_body=?,news_impact_note=? WHERE id=?`).run(title||"",body||"",note||"",roundId);
  res.json({ok:true});
});

app.post("/api/admin/start-round", requireAdmin, (req,res)=>{
  const roundId=Number(req.body.roundId);
  if(roundId<1||roundId>6) return res.status(400).json({error:"Invalid round."});
  const st=state();
  if(roundId!==st.current_round+1 && !(st.current_round===0 && roundId===1)) return res.status(400).json({error:"Rounds must be started in order."});
  if(st.current_round>0){ const previous=db.prepare(`SELECT status FROM rounds WHERE id=?`).get(st.current_round); if(!previous || previous.status!=="applied") return res.status(400).json({error:"Previous round is not finished yet."}); }
  const start=nowMs(), end=start+NEWS_SECONDS*1000;
  // Generate the scenario before opening the round so players can never observe a live round without its news/impact map.
  let generated;
  try {
    generated=generateRoundNews(roundId);
    db.transaction(()=>{
      const latest=state();
      if(latest.current_round!==st.current_round || latest.event_status==='live' || latest.event_status==='paused') throw new Error('Event state changed. Please retry.');
      db.prepare(`UPDATE rounds SET status='news',released_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`).run(roundId);
      db.prepare(`UPDATE event_state SET current_round=?,event_status='live',phase='news',phase_started_at=?,phase_ends_at=?,paused_remaining=NULL,registration_open=0,updated_at=CURRENT_TIMESTAMP WHERE id=1`).run(roundId,start,end);
    })();
  } catch (err) {
    console.error('START_ROUND failed:', err);
    return res.status(500).json({error:`Unable to start Round ${roundId}: ${err.message}`});
  }
  if(generated?.length) audit(req,'AUTO_NEWS_GENERATED',{roundId,storyCount:generated.length,categories:generated.map(x=>x.category),sentiments:generated.map(x=>x.sentiment)});
  audit(req,'START_ROUND',{roundId});
  emitState(); res.json({ok:true,state:state()});
});

app.post("/api/admin/lock-round", requireAdmin, (req,res)=>{
  const st=state();
  if(!st.current_round || st.phase!=='trading') return res.status(400).json({error:"Trading is not currently open."});
  applyRoundPrices(st.current_round);
  audit(req,'EMERGENCY_LOCK',{roundId:st.current_round});
  res.json({ok:true,state:state()});
});

app.post("/api/admin/apply-round", requireAdmin, (req,res)=>{
  const st=state();
  if(!st.current_round || !['news','trading'].includes(st.phase)) return res.status(400).json({error:"No active round to apply."});
  applyRoundPrices(st.current_round);
  audit(req,'APPLY_ROUND',{roundId:st.current_round});
  res.json({ok:true,state:state()});
});

app.post("/api/admin/pause", requireAdmin, (req,res)=>{
  const st=state();
  if(!st.current_round || st.phase==='idle') return res.status(400).json({error:"Nothing is running."});
  if(st.event_status==='paused'){
    const remaining=Math.max(0,Number(st.paused_remaining||0));
    const end=nowMs()+remaining;
    setEvent({event_status:'live',phase_ends_at:end,paused_remaining:null});
  } else {
    const remaining=Math.max(0,Number(st.phase_ends_at||0)-nowMs());
    setEvent({event_status:'paused',paused_remaining:remaining,phase_ends_at:null});
  }
  audit(req, st.event_status==='paused'?'RESUME':'PAUSE',{roundId:st.current_round,phase:st.phase});
  res.json({ok:true,state:state()});
});

app.post("/api/admin/reset", requireAdmin, (req,res)=>{
  backupDatabase('before-reset');
  db.transaction(()=>{
    db.prepare(`DELETE FROM trades`).run();
    db.prepare(`DELETE FROM holdings`).run();
    db.prepare(`DELETE FROM holding_lots`).run();
    db.prepare(`DELETE FROM accounts`).run();
    db.prepare(`DELETE FROM trade_nonces`).run();
    db.prepare(`DELETE FROM round_snapshots`).run();
    db.prepare(`DELETE FROM round_price_events`).run();
    db.prepare(`DELETE FROM market_news_events`).run();
    db.prepare(`DELETE FROM event_announcements`).run();
    db.prepare(`DELETE FROM audit_logs`).run();
    db.prepare(`DELETE FROM users WHERE role='player'`).run();
    db.prepare(`UPDATE stocks SET price=base_price`).run();
    db.prepare(`UPDATE event_state SET market_version=0`).run();
    db.prepare(`DELETE FROM price_history`).run();
    for(const st of db.prepare(`SELECT id,base_price FROM stocks`).all()) db.prepare(`INSERT INTO price_history(stock_id,round_id,price,reason) VALUES(?,?,?,'BASE')`).run(st.id,null,st.base_price);
    db.prepare(`UPDATE rounds SET status='pending',news_title='',news_body='',news_impact_note='',released_at=NULL,locked_at=NULL,applied_at=NULL`).run();
    db.prepare(`UPDATE event_state SET current_round=0,event_status='registration',phase='idle',phase_started_at=NULL,phase_ends_at=NULL,paused_remaining=NULL,registration_open=1,presentation_mode=0,cost_basis_method='FIFO',updated_at=CURRENT_TIMESTAMP WHERE id=1`).run();
  })();
  audit(req,'RESET_EVENT',{});
  res.json({ok:true});
});

app.get("/api/admin/audit", requireAdmin, (req,res)=>{
  res.json(db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500`).all());
});

app.get("/api/stock/:id/history", requireLogin, (req,res)=>{
  const id=Number(req.params.id); const s=db.prepare(`SELECT id,symbol,name,sector,price,base_price FROM stocks WHERE id=?`).get(id);
  if(!s) return res.status(404).json({error:'Stock not found'});
  const points=db.prepare(`SELECT round_id,price,reason,created_at FROM price_history WHERE stock_id=? ORDER BY id`).all(id);
  res.json({stock:s,points:points.map(x=>({label:x.round_id?`R${x.round_id}`:'Base',price:x.price,reason:x.reason,created_at:x.created_at}))});
});


app.post("/api/admin/cost-basis", requireAdmin, (req,res)=>{
  const method=String(req.body?.method||'FIFO').toUpperCase();
  if(!['FIFO','AVERAGE'].includes(method)) return res.status(400).json({error:'Cost basis must be FIFO or AVERAGE.'});
  const tradesStarted=db.prepare(`SELECT COUNT(*) c FROM trades`).get().c;
  if(tradesStarted>0) return res.status(400).json({error:'Cost basis can only be changed before the first trade.'});
  db.prepare(`UPDATE event_state SET cost_basis_method=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`).run(method);
  audit(req,'COST_BASIS_CHANGED',{method});emitState();res.json({ok:true,state:state()});
});

app.get("/api/admin/operations", requireAdmin, (req,res)=>{
  const st=state();
  const now=nowMs();
  const onlinePlayers=db.prepare(`SELECT id,name,username,status,last_seen_at,last_visibility,visibility_events,created_at FROM users WHERE role='player' ORDER BY name`).all()
    .map(p=>({...p,playerId:`STW-${String(p.id).padStart(3,'0')}`,online:Boolean(p.last_seen_at && now-p.last_seen_at<30000),secondsSinceSeen:p.last_seen_at?Math.max(0,Math.floor((now-p.last_seen_at)/1000)):null}));
  const activePlayers=onlinePlayers.filter(x=>x.online).length;
  const suspended=onlinePlayers.filter(x=>x.status==='suspended').length;
  const snapshots=db.prepare(`SELECT COUNT(*) c FROM round_snapshots`).get().c;
  res.json({state:st,registrationOpen:Boolean(st.registration_open),players:onlinePlayers,onlinePlayers:activePlayers,suspendedPlayers:suspended,snapshotCount:snapshots,announcement:latestAnnouncement(),costBasisMethod:st.cost_basis_method||DEFAULT_COST_BASIS});
});

app.post("/api/admin/registration", requireAdmin, (req,res)=>{
  const enabled=Boolean(req.body?.enabled);
  const st=state();
  if(enabled && (st.current_round>0 || st.event_status!=='registration')) return res.status(400).json({error:"Registration can only be reopened before the event starts."});
  db.prepare(`UPDATE event_state SET registration_open=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`).run(enabled?1:0);
  audit(req,enabled?'REGISTRATION_OPENED':'REGISTRATION_CLOSED',{});
  emitState();res.json({ok:true,state:state()});
});

app.post("/api/admin/announcement", requireAdmin, (req,res)=>{
  const message=String(req.body?.message||'').trim().slice(0,300);
  const severity=['info','warning','critical','success'].includes(req.body?.severity)?req.body.severity:'info';
  if(!message)return res.status(400).json({error:"Announcement cannot be empty."});
  db.prepare(`UPDATE event_announcements SET active=0 WHERE active=1`).run();
  const info=db.prepare(`INSERT INTO event_announcements(message,severity,created_by) VALUES(?,?,?)`).run(message,severity,user(req).id);
  audit(req,'BROADCAST',{announcementId:Number(info.lastInsertRowid),severity,message});
  emitState();res.json({ok:true,announcement:latestAnnouncement()});
});
app.post("/api/admin/announcement/clear", requireAdmin, (req,res)=>{
  db.prepare(`UPDATE event_announcements SET active=0 WHERE active=1`).run();
  audit(req,'BROADCAST_CLEARED',{});
  emitState();res.json({ok:true});
});

app.post("/api/admin/player/:id/status", requireAdmin, (req,res)=>{
  const id=Number(req.params.id), status=req.body?.status==='suspended'?'suspended':'active';
  const p=db.prepare(`SELECT id,name,status FROM users WHERE id=? AND role='player'`).get(id);
  if(!p)return res.status(404).json({error:"Player not found"});
  db.prepare(`UPDATE users SET status=? WHERE id=?`).run(status,id);
  audit(req,status==='suspended'?'PLAYER_SUSPENDED':'PLAYER_REACTIVATED',{userId:id});
  res.json({ok:true,status});
});

app.get("/api/admin/player/:id/history", requireAdmin, (req,res)=>{
  const id=Number(req.params.id);
  const p=db.prepare(`SELECT id,name,username,status FROM users WHERE id=? AND role='player'`).get(id);
  if(!p)return res.status(404).json({error:"Player not found"});
  const history=db.prepare(`SELECT round_id,total,cash,market_value,profit,created_at FROM round_snapshots WHERE user_id=? ORDER BY round_id`).all(id);
  res.json({player:{...p,playerId:`STW-${String(p.id).padStart(3,'0')}`},history});
});

app.get("/api/admin/export-event", requireAdmin, (req,res)=>{
  const payload={
    exportedAt:new Date().toISOString(),
    state:state(),
    rounds:db.prepare(`SELECT * FROM rounds ORDER BY id`).all(),
    stocks:db.prepare(`SELECT * FROM stocks ORDER BY id`).all(),
    impacts:db.prepare(`SELECT * FROM round_impacts ORDER BY round_id,stock_id`).all(),
    players:finalRankings(),
    trades:db.prepare(`SELECT t.*,u.name,u.username,s.symbol,s.name stock_name FROM trades t JOIN users u ON u.id=t.user_id JOIN stocks s ON s.id=t.stock_id ORDER BY t.id`).all(),
    snapshots:db.prepare(`SELECT * FROM round_snapshots ORDER BY round_id,user_id`).all(),
    flags:db.prepare(`SELECT f.*,u.name,u.username FROM player_flags f JOIN users u ON u.id=f.user_id ORDER BY f.id`).all(),
    audit:db.prepare(`SELECT * FROM audit_logs ORDER BY id`).all(),
    announcements:db.prepare(`SELECT * FROM event_announcements ORDER BY id`).all()
  };
  res.setHeader('Content-Disposition',`attachment; filename="stock-wars-event-${Date.now()}.json"`);
  res.json(payload);
});

app.get("/api/admin/news-engine", requireAdmin, (req,res)=>{
  const rounds=db.prepare(`SELECT r.id,r.status,r.news_title,r.news_body,r.news_impact_note,r.released_at,r.applied_at,m.id news_event_id,m.category,m.sentiment,m.scope,m.target_sector,m.impact_pct,m.generated_at FROM rounds r LEFT JOIN market_news_events m ON m.round_id=r.id ORDER BY r.id`).all();
  const causal=db.prepare(`SELECT pe.round_id,s.symbol,s.name,s.sector,pe.old_price,pe.new_price,pe.impact_pct,pe.created_at FROM round_price_events pe JOIN stocks s ON s.id=pe.stock_id ORDER BY pe.id`).all();
  res.json({autoNews:AUTO_NEWS,rounds,causal});
});

app.get("/api/admin/overview", requireAdmin, (req,res)=>{
  const st=state();
  const playerCount=db.prepare(`SELECT COUNT(*) c FROM users WHERE role='player'`).get().c;
  const tradeCount=db.prepare(`SELECT COUNT(*) c FROM trades`).get().c;
  const r=st.current_round?db.prepare(`SELECT * FROM rounds WHERE id=?`).get(st.current_round):null;
  const newsEvents=st.current_round
    ? db.prepare(`SELECT id,category,sentiment,scope,target_sector,headline,body,impact_pct,generated_at FROM market_news_events WHERE round_id=? ORDER BY id`).all(st.current_round)
    : [];
  res.json({state:st,playerCount,tradeCount,round:r,newsEvents,timing:{newsSeconds:NEWS_SECONDS,tradeSeconds:TRADE_SECONDS}});
});


app.get("/api/admin/analytics", requireAdmin, (req,res)=>{
  const players=db.prepare(`SELECT id,name,username,created_at FROM users WHERE role='player'`).all();
  const ranked=players.map(p=>{
    const pf=portfolio(p.id);
    const tradeCount=db.prepare(`SELECT COUNT(*) c FROM trades WHERE user_id=?`).get(p.id).c;
    const buyValue=db.prepare(`SELECT COALESCE(SUM(total),0) v FROM trades WHERE user_id=? AND side='BUY'`).get(p.id).v;
    const sellValue=db.prepare(`SELECT COALESCE(SUM(total),0) v FROM trades WHERE user_id=? AND side='SELL'`).get(p.id).v;
    return {...p,...pf,tradeCount,buyValue,sellValue};
  }).sort((a,b)=>b.total-a.total||b.cash-a.cash||a.tradeCount-b.tradeCount||String(a.created_at).localeCompare(String(b.created_at)))
    .map((p,i)=>({...p,rank:i+1}));
  const sectors=db.prepare(`SELECT s.sector,COUNT(t.id) trades,COALESCE(SUM(t.quantity),0) volume,COALESCE(SUM(CASE WHEN t.side='BUY' THEN t.total ELSE 0 END),0) buy_value,COALESCE(SUM(CASE WHEN t.side='SELL' THEN t.total ELSE 0 END),0) sell_value FROM stocks s LEFT JOIN trades t ON t.stock_id=s.id GROUP BY s.sector ORDER BY trades DESC`).all();
  const stocks=db.prepare(`SELECT s.symbol,s.name,s.sector,s.price,COUNT(t.id) trades,COALESCE(SUM(t.quantity),0) volume,COALESCE(SUM(CASE WHEN t.side='BUY' THEN t.total ELSE 0 END),0) buy_value,COALESCE(SUM(CASE WHEN t.side='SELL' THEN t.total ELSE 0 END),0) sell_value FROM stocks s LEFT JOIN trades t ON t.stock_id=s.id GROUP BY s.id ORDER BY trades DESC,volume DESC`).all();
  const rounds=db.prepare(`SELECT r.id,r.status,COUNT(t.id) trades,COALESCE(SUM(t.total),0) turnover FROM rounds r LEFT JOIN trades t ON t.round_id=r.id GROUP BY r.id ORDER BY r.id`).all();
  const suspicious=db.prepare(`SELECT t.user_id,u.name,u.username,t.round_id,COUNT(*) burst_count FROM trades t JOIN users u ON u.id=t.user_id GROUP BY t.user_id,t.round_id HAVING COUNT(*)>=20 ORDER BY burst_count DESC`).all();
  res.json({state:publicState(),players:ranked,sectors,stocks,rounds,suspicious});
});
app.get("/api/admin/flags", requireAdmin, (req,res)=>{res.json(db.prepare(`SELECT f.*,u.name,u.username FROM player_flags f JOIN users u ON u.id=f.user_id WHERE f.status='open' ORDER BY f.id DESC`).all());});
app.post("/api/admin/flag-player", requireAdmin, (req,res)=>{const id=Number(req.body.userId),reason=String(req.body.reason||'Manual host review').slice(0,500),severity=['low','medium','high'].includes(req.body.severity)?req.body.severity:'medium';if(!db.prepare(`SELECT id FROM users WHERE id=? AND role='player'`).get(id))return res.status(404).json({error:'Player not found'});db.prepare(`INSERT INTO player_flags(user_id,severity,reason) VALUES(?,?,?)`).run(id,severity,reason);audit(req,'PLAYER_FLAGGED',{userId:id,severity,reason});res.json({ok:true});});
app.post("/api/admin/flags/:id/resolve", requireAdmin, (req,res)=>{db.prepare(`UPDATE player_flags SET status='resolved',resolved_at=CURRENT_TIMESTAMP WHERE id=?`).run(Number(req.params.id));audit(req,'FLAG_RESOLVED',{flagId:Number(req.params.id)});res.json({ok:true});});
app.get("/api/admin/export", requireAdmin, (req,res)=>{const type=req.query.type||'leaderboard';if(type==='trades')return res.json({type,rows:db.prepare(`SELECT t.id,u.name,u.username,s.symbol,t.side,t.quantity,t.price,t.total,t.round_id,t.created_at FROM trades t JOIN users u ON u.id=t.user_id JOIN stocks s ON s.id=t.stock_id ORDER BY t.id`).all()});const rows=db.prepare(`SELECT u.name,u.username,a.cash,COALESCE((SELECT SUM(h.quantity*s.price) FROM holdings h JOIN stocks s ON s.id=h.stock_id WHERE h.user_id=u.id),0) market_value,u.created_at FROM users u JOIN accounts a ON a.user_id=u.id WHERE u.role='player'`).all().map(x=>({...x,total:Number(x.cash)+Number(x.market_value),profit:Number(x.cash)+Number(x.market_value)-STARTING_CAPITAL})).sort((a,b)=>b.total-a.total).map((x,i)=>({...x,rank:i+1}));res.json({type:'leaderboard',rows});});
app.get("/healthz", (req,res)=>res.status(200).json({ok:true,service:"stock-wars",time:new Date().toISOString()}));

app.get("/api/admin/health", requireAdmin, (req,res)=>{res.json({ok:true,serverTime:new Date().toISOString(),state:publicState(),players:db.prepare(`SELECT COUNT(*) c FROM users WHERE role='player'`).get().c,trades:db.prepare(`SELECT COUNT(*) c FROM trades`).get().c});});


app.get("/api/final-results", requireLogin, (req,res)=>{
  const rankings=finalRankings(), st=publicState(), me=user(req);
  res.json({state:st,rankings:me?.role==='player'?rankings.slice(0,20):rankings,mine:me?.role==='player'?rankings.find(x=>x.id===me.id):null,finished:st.event_status==='finished'});
});
app.get("/api/admin/player/:id/card", requireAdmin, (req,res)=>{
  const p=finalRankings().find(x=>x.id===Number(req.params.id));
  if(!p)return res.status(404).json({error:"Player not found"});
  res.json({eventName:process.env.EVENT_NAME||"Stock Wars",player:p});
});
app.get("/api/admin/player/:id/qr", requireAdmin, async (req,res)=>{
  try{
    const p=db.prepare(`SELECT id,name,username FROM users WHERE id=? AND role='player'`).get(Number(req.params.id));
    if(!p)return res.status(404).json({error:"Player not found"});
    const QRCode=require('qrcode'), target=`${req.protocol}://${req.get('host')}/?player=${encodeURIComponent(p.username)}`;
    res.json({playerId:`STW-${String(p.id).padStart(3,'0')}`,name:p.name,username:p.username,loginUrl:target,dataUrl:await QRCode.toDataURL(target,{margin:1,width:360,errorCorrectionLevel:'M'})});
  }catch(e){res.status(500).json({error:"QR generation unavailable. Run npm install first."});}
});
app.post("/api/admin/presentation", requireAdmin, (req,res)=>{
  const enabled=Boolean(req.body?.enabled);
  db.prepare(`UPDATE event_state SET presentation_mode=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`).run(enabled?1:0);
  audit(req,enabled?'PRESENTATION_ON':'PRESENTATION_OFF',{});
  emitState();res.json({ok:true,state:publicState()});
});
app.get("/api/admin/phase4-analytics", requireAdmin, (req,res)=>{
  const rankings=finalRankings();
  const rounds=db.prepare(`SELECT id,status,news_title,applied_at FROM rounds ORDER BY id`).all();
  const sectorMovement=db.prepare(`SELECT sector,COUNT(*) stocks,ROUND(AVG((price-base_price)/base_price*100),2) movement_pct,ROUND(MIN((price-base_price)/base_price*100),2) min_pct,ROUND(MAX((price-base_price)/base_price*100),2) max_pct FROM stocks GROUP BY sector ORDER BY movement_pct DESC`).all();
  const roundTrades=db.prepare(`SELECT round_id,side,COUNT(*) trades,COALESCE(SUM(total),0) value,COALESCE(SUM(quantity),0) volume FROM trades GROUP BY round_id,side ORDER BY round_id,side`).all();
  res.json({rankings,rounds,sectorMovement,roundTrades,state:publicState()});
});

app.get("*",(req,res)=>{
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  res.sendFile(path.join(__dirname,"public","index.html"));
});

app.listen(PORT,()=>console.log(`Stock Wars running at http://localhost:${PORT}`));
