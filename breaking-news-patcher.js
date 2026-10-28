const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, 'server.js');
const APP = path.join(__dirname, 'public', 'app.js');

function patch(file, from, to, name) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Patch anchor not found: ${name}`);
  fs.writeFileSync(file, source.replace(from, to));
  console.log(`[breaking-news] ${name}`);
}

patch(SERVER,
  "ensureColumn('event_state','presentation_mode',\"INTEGER NOT NULL DEFAULT 0\");",
  "ensureColumn('event_state','presentation_mode',\"INTEGER NOT NULL DEFAULT 0\");\nensureColumn('event_state','breaking_active',\"INTEGER NOT NULL DEFAULT 0\");\nensureColumn('event_state','breaking_news_id',\"INTEGER\");",
  'state columns');

let serverSource = fs.readFileSync(SERVER, 'utf8');
if (!serverSource.includes('function generateBreakingNews(roundId)')) {
  const generator = String.raw`
function generateBreakingNews(roundId){
  const all=db.prepare("SELECT id,name,symbol,sector FROM stocks ORDER BY id").all();
  if(!all.length) throw Error('No stocks available.');
  const sectors=[...new Set(all.map(s=>s.sector).filter(Boolean))];
  const mode=Math.random()<0.5?'stock':'sector';
  const positive=Math.random()<0.5;
  const sign=positive?1:-1;
  let targetStock=null,targetSector=null,headline,body,impact;
  if(mode==='stock'){
    targetStock=all[Math.floor(Math.random()*all.length)]; targetSector=targetStock.sector;
    impact=Number((sign*(12+Math.random()*6)).toFixed(2));
    headline=positive?'BREAKING: '+targetStock.name+' catalyst improves its forward cash-flow profile':'BREAKING: '+targetStock.name+' faces a material earnings-risk repricing';
    body=(positive?[
      targetStock.name+' has reported a catalyst that shifts the balance of near-term earnings risks and improves the expected cash-flow distribution.',
      'Potential upside transmission runs through utilization, contribution margins, or capital efficiency; the durability of each channel remains unconfirmed.',
      'Investors are recalibrating forecast dispersion, working-capital requirements, and the valuation multiple justified by the revised outlook.',
      'Teams should assess whether the catalyst is transient or changes normalized returns on invested capital.'
    ]:[
      targetStock.name+' faces a downside catalyst that widens the distribution of near-term earnings and cash-flow outcomes.',
      'The shock may propagate through weaker pricing power, adverse fixed-cost absorption, or a longer cash-conversion cycle.',
      'Investors are reassessing forecast revisions, balance-sheet resilience, and the equity-risk premium required for the exposure.',
      'Teams should distinguish temporary volatility from a structural impairment to normalized returns on invested capital.'
    ]).join('\n');
  }else{
    targetSector=sectors[Math.floor(Math.random()*sectors.length)];
    impact=Number((sign*(8+Math.random()*4)).toFixed(2));
    headline=positive?'BREAKING: A common catalyst lifts an exposed issuer cohort':'BREAKING: A correlated shock pressures an exposed issuer cohort';
    body=(positive?[
      'A common operating catalyst improves the expected cash-flow profile for a cluster of issuers with correlated exposures.',
      'The repricing channel may run through order-book conversion, capacity utilization, or incremental return on invested capital rather than revenue growth alone.',
      'Investors must separate durable cash-flow accretion from multiple expansion and assess dispersion between direct beneficiaries and second-order peers.',
      'The valuation response depends on balance-sheet capacity and the ability to fund incremental working capital.'
    ]:[
      'A common shock weakens the cash-flow outlook for a cluster of issuers with correlated operating or funding exposures.',
      'Transmission may compound through lower fixed-cost absorption, weaker pass-through, and delayed working-capital conversion.',
      'Investors are revising earnings distributions, covenant headroom, and valuation multiples as downside scenarios gain probability.',
      'The eventual repricing depends on shock persistence and management’s capacity to protect returns on invested capital.'
    ]).join('\n');
  }
  const tx=db.transaction(()=>{
    const news=db.prepare("INSERT INTO market_news_events(round_id,category,sentiment,scope,target_sector,headline,body,impact_pct) VALUES(?,?,?,?,?,?,?,?)")
      .run(roundId,'Breaking News',positive?'positive':'negative',mode.toUpperCase(),targetSector,headline,body,impact);
    const up=db.prepare("INSERT INTO round_impacts(round_id,stock_id,impact_pct) VALUES(?,?,?) ON CONFLICT(round_id,stock_id) DO UPDATE SET impact_pct=impact_pct+excluded.impact_pct");
    for(const s of all){
      let p;
      if(mode==='stock'){
        if(s.id===targetStock.id) p=impact;
        else if(s.sector===targetSector) p=sign*(5+Math.random()*5);
        else p=sign*(0.5+Math.random()*2.5)*(Math.random()<0.75?1:-1);
      }else{
        if(s.sector===targetSector) p=sign*(7+Math.random()*5);
        else p=sign*(0.5+Math.random()*2.5)*(Math.random()<0.70?1:-1);
      }
      up.run(roundId,s.id,Number(Math.max(-18,Math.min(18,p)).toFixed(2)));
    }
    db.prepare("UPDATE event_state SET breaking_active=1,breaking_news_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=1")
      .run(news.lastInsertRowid);
    return {newsId:Number(news.lastInsertRowid),headline,body,impactPct:impact,sentiment:positive?'positive':'negative',targetType:mode,target:mode==='stock'?targetStock.symbol:targetSector};
  });
  return tx();
}
`;
  const current = fs.readFileSync(SERVER, 'utf8');
  const anchor = '\nfunction applyRoundPrices(roundId){';
  if (!current.includes(anchor)) throw new Error('Breaking News insertion anchor missing: applyRoundPrices');
  fs.writeFileSync(SERVER, current.replace(anchor, generator + anchor));
  console.log('[breaking-news] stock-or-sector generator');
}

patch(SERVER,
  'const tradeEnd=tradeStart+TRADE_SECONDS*1000;',
  'const tradeDuration=Number(st.breaking_active||0)===1?120:TRADE_SECONDS;\n    const tradeEnd=tradeStart+tradeDuration*1000;',
  'breaking trade duration');

patch(SERVER,
  "db.prepare(`UPDATE rounds SET status='applied',applied_at=CURRENT_TIMESTAMP,locked_at=COALESCE(locked_at,CURRENT_TIMESTAMP) WHERE id=?`).run(roundId);",
  "db.prepare(`UPDATE rounds SET status='applied',applied_at=CURRENT_TIMESTAMP,locked_at=COALESCE(locked_at,CURRENT_TIMESTAMP) WHERE id=?`).run(roundId);\n    db.prepare(`UPDATE event_state SET breaking_active=0,breaking_news_id=NULL WHERE id=1`).run();",
  'clear breaking state');

serverSource = fs.readFileSync(SERVER, 'utf8');
if (!serverSource.includes('/api/admin/breaking-news')) {
  const anchor='app.post("/api/admin/lock-round", requireAdmin, (req,res)=>{';
  const endpoint=`app.post("/api/admin/breaking-news", requireAdmin, (req,res)=>{
  const st=state();
  if(!st.current_round || st.phase!=='trading' || st.event_status!=='live') return res.status(400).json({error:'Breaking News is available only after trading has opened.'});
  const tradingElapsed=nowMs()-Number(st.phase_started_at||0);
  if(tradingElapsed<60000) return res.status(400).json({error:'Breaking News becomes available 1 minute after trading opens.'});
  if(Number(st.breaking_active||0)) return res.status(400).json({error:'Breaking News is already active for this round.'});
  try{
    const g=generateBreakingNews(st.current_round);
    const start=nowMs();
    db.prepare("UPDATE rounds SET status='news' WHERE id=?").run(st.current_round);
    db.prepare("UPDATE event_state SET event_status='live',phase='news',phase_started_at=?,phase_ends_at=?,paused_remaining=NULL,breaking_active=1,breaking_news_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=1")
      .run(start,start+60000,g.newsId);
    audit(req,'BREAKING_NEWS',{roundId:st.current_round,newsId:g.newsId,targetType:g.targetType,target:g.target,impactPct:g.impactPct,triggeredAfterTradingMs:tradingElapsed});
    emitState();
    res.json({ok:true,breakingNews:g,state:state()});
  }catch(e){
    console.error('BREAKING_NEWS failed:',e);
    res.status(500).json({error:'Unable to trigger Breaking News: '+e.message});
  }
});

`;
  if(!serverSource.includes(anchor)) throw new Error('Breaking News endpoint anchor missing: lock-round');
  fs.writeFileSync(SERVER,serverSource.replace(anchor,endpoint+anchor));
  console.log('[breaking-news] endpoint');
}

patch(SERVER,
  "presentation_mode=0,cost_basis_method='FIFO',updated_at=CURRENT_TIMESTAMP WHERE id=1",
  "presentation_mode=0,cost_basis_method='FIFO',breaking_active=0,breaking_news_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=1",
  'reset breaking state');

let appSource = fs.readFileSync(APP, 'utf8');
if (!appSource.includes('onclick="triggerBreakingNews()"')) {
  const old='<button class="btn secondary resetBtn" onclick="resetEvent()">Reset Event</button>';
  const neu='<button id="breakingNewsBtn" class="btn breakingBtn" onclick="triggerBreakingNews()" ${!STATE.current_round||STATE.phase!==\'trading\'||STATE.event_status!==\'live\'||STATE.breaking_active?\'disabled\':\'\'}>⚡ Breaking News</button>'+old;
  patch(APP,old,neu,'host button');
}
if (!fs.readFileSync(APP,'utf8').includes('async function triggerBreakingNews()')) {
  const fn="async function triggerBreakingNews(){if(!confirm('Trigger BREAKING NEWS now? It will be added to this round’s news log. Players get 1 minute to read and 2 minutes to trade. All accumulated round impacts are applied only at the end.'))return;try{await api('/api/admin/breaking-news',{method:'POST',body:JSON.stringify({})});toast('⚡ Breaking News published — 1 min read + 2 min trade');adminPage()}catch(e){toast(e.message)}}\n";
  patch(APP,'async function resetEvent(){',fn+'async function resetEvent(){','client action');
}

patch(APP,
  "const total=STATE?.phase==='news'?120000:180000;",
  "const total=STATE?.phase==='news'?(STATE?.breaking_active?60000:120000):STATE?.phase==='trading'?(STATE?.breaking_active?120000:180000):180000;",
  'timer duration');

if (!fs.readFileSync(APP,'utf8').includes('function syncBreakingNewsButton()')) {
  const fn="function syncBreakingNewsButton(){const b=document.getElementById('breakingNewsBtn');if(!b)return;const elapsed=Date.now()-Number(STATE?.phase_started_at||0);b.disabled=!(STATE?.current_round&&STATE?.phase==='trading'&&STATE?.event_status==='live'&&!STATE?.breaking_active&&elapsed>=60000)}\n";
  patch(APP,'function syncHostTimer(){',fn+'function syncHostTimer(){','breaking button timer');
}
patch(APP,
  "function syncHostTimer(){const el=document.getElementById('eventTimerHost');if(el){el.textContent=timerText();setTimeout(syncHostTimer,250)}}",
  "function syncHostTimer(){const el=document.getElementById('eventTimerHost');if(el){el.textContent=timerText();syncBreakingNewsButton();setTimeout(syncHostTimer,250)}}",
  'breaking button refresh');

console.log('[breaking-news] complete');

