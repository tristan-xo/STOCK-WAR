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

patch(SERVER,"ensureColumn('event_state','presentation_mode',\"INTEGER NOT NULL DEFAULT 0\");","ensureColumn('event_state','presentation_mode',\"INTEGER NOT NULL DEFAULT 0\");\nensureColumn('event_state','breaking_active',\"INTEGER NOT NULL DEFAULT 0\");\nensureColumn('event_state','breaking_news_id',\"INTEGER\");",'state columns');

const source = fs.readFileSync(SERVER, 'utf8');
const generator = String.raw`function generateBreakingNews(roundId){
  const all=db.prepare("SELECT id,name,symbol,sector FROM stocks ORDER BY id").all();
  if(!all.length) throw Error('No stocks available.');
  const sectors=[...new Set(all.map(s=>s.sector).filter(Boolean))];
  const mode=Math.random()<0.5?'stock':'sector';
  const positive=Math.random()<0.5;
  const sign=positive?1:-1;
  let targetStock=null,targetSector=null,headline,body,representativeImpact;

  if(mode==='stock'){
    targetStock=all[Math.floor(Math.random()*all.length)];
    targetSector=targetStock.sector;
    representativeImpact=money(sign*(12+Math.random()*6));
    headline=(positive?'BREAKING: Strong development lifts ':'BREAKING: Major setback hits ')+targetStock.name;
    body=(positive?[
      targetStock.name+' has announced a major development that materially improves its near-term business outlook.',
      'The update is expected to strengthen revenue visibility and investor confidence across the '+targetStock.sector+' space.',
      'Analysts are reassessing earnings expectations as the development could accelerate growth and improve operating momentum.',
      'The stock is expected to see an unusually strong market reaction as participants digest the announcement.'
    ]:[
      targetStock.name+' has reported an unexpected development that materially weakens its near-term business outlook.',
      'The update raises concerns around earnings visibility and sentiment across the '+targetStock.sector+' space.',
      'Analysts are reassessing expectations as the development could pressure growth, margins or future cash flows.',
      'The stock is expected to see an unusually strong market reaction as participants digest the announcement.'
    ]).join('\\n');
  } else {
    targetSector=sectors[Math.floor(Math.random()*sectors.length)];
    representativeImpact=money(sign*(8+Math.random()*4));
    headline=(positive?'BREAKING: Strong developments lift ':'BREAKING: Major setback hits ')+targetSector+' sector';
    body=(positive?[
      'A major development has sharply changed the near-term outlook for companies across the '+targetSector+' sector.',
      'The news is expected to improve demand, earnings visibility and investor confidence across several companies in the space.',
      'Analysts are revising expectations as the development could accelerate growth and strengthen sector-wide operating momentum.',
      'Stocks across the sector are expected to experience a significant market reaction as investors digest the announcement.'
    ]:[
      'A major development has sharply weakened the near-term outlook for companies across the '+targetSector+' sector.',
      'The news raises concerns around demand, earnings visibility and investor confidence across several companies in the space.',
      'Analysts are revising expectations as the development could pressure growth, margins or future cash flows across the sector.',
      'Stocks across the sector are expected to experience a significant market reaction as investors digest the announcement.'
    ]).join('\\n');
  }

  const tx=db.transaction(()=>{
    const news=db.prepare("INSERT INTO market_news_events(round_id,category,sentiment,scope,target_sector,headline,body,impact_pct) VALUES(?,?,?,?,?,?,?,?)")
      .run(roundId,'Breaking News',positive?'positive':'negative',mode.toUpperCase(),targetSector,headline,body,representativeImpact);
    const up=db.prepare("INSERT INTO round_impacts(round_id,stock_id,impact_pct) VALUES(?,?,?) ON CONFLICT(round_id,stock_id) DO UPDATE SET impact_pct=impact_pct+excluded.impact_pct");
    for(const s of all){
      let p;
      if(mode==='stock'){
        if(s.id===targetStock.id) p=representativeImpact;
        else if(s.sector===targetSector) p=sign*(5+Math.random()*5);
        else p=sign*(0.5+Math.random()*2.5)*(Math.random()<0.75?1:-1);
      } else {
        if(s.sector===targetSector) p=sign*(7+Math.random()*5);
        else p=sign*(0.5+Math.random()*2.5)*(Math.random()<0.7?1:-1);
      }
      up.run(roundId,s.id,money(Math.max(-18,Math.min(18,p))));
    }
    db.prepare("UPDATE rounds SET news_title='BREAKING NEWS',news_body=?,news_impact_note=? WHERE id=?")
      .run(headline+'\\n'+body,'High-impact '+mode+' event - price applied after breaking-news trading window',roundId);
    db.prepare("UPDATE event_state SET breaking_active=1,breaking_news_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=1")
      .run(news.lastInsertRowid);
    return {newsId:Number(news.lastInsertRowid),headline,body,impactPct:representativeImpact,sentiment:positive?'positive':'negative',targetType:mode,target:mode==='stock'?targetStock.symbol:targetSector};
  });
  return tx();
}`;

const current = fs.readFileSync(SERVER, 'utf8');
const start = current.indexOf('function generateBreakingNews(roundId){');
const end = current.indexOf('\nfunction applyRoundPrices(roundId){', start);
if(start === -1 || end === -1) throw new Error('Breaking News generator anchor missing.');
const currentGenerator = current.slice(start, end);
if(currentGenerator !== generator) {
  fs.writeFileSync(SERVER, current.slice(0, start) + generator + current.slice(end));
  console.log('[breaking-news] stock-or-sector generator');
}

patch(SERVER,"db.prepare(`UPDATE rounds SET status='applied',applied_at=CURRENT_TIMESTAMP,locked_at=COALESCE(locked_at,CURRENT_TIMESTAMP) WHERE id=?`).run(roundId);","db.prepare(`UPDATE rounds SET status='applied',applied_at=CURRENT_TIMESTAMP,locked_at=COALESCE(locked_at,CURRENT_TIMESTAMP) WHERE id=?`).run(roundId);\n    db.prepare(`UPDATE event_state SET breaking_active=0,breaking_news_id=NULL WHERE id=1`).run();",'clear breaking state');
patch(SERVER,'const tradeEnd=tradeStart+TRADE_SECONDS*1000;','const tradeDuration=Number(st.breaking_active||0)===1?120:TRADE_SECONDS;\n    const tradeEnd=tradeStart+tradeDuration*1000;','breaking trade duration');

if(!fs.readFileSync(SERVER,'utf8').includes('/api/admin/breaking-news')){
  const sourceServer=fs.readFileSync(SERVER,'utf8');
  const anchor='app.post("/api/admin/lock-round", requireAdmin, (req,res)=>{';
  const endpoint=`app.post("/api/admin/breaking-news",requireAdmin,(req,res)=>{const st=state();if(!st.current_round||!['news','trading'].includes(st.phase)||st.event_status!=='live')return res.status(400).json({error:'Breaking News can only be triggered during an active round.'});if(Number(st.breaking_active||0))return res.status(400).json({error:'Breaking News is already active for this round.'});try{const g=generateBreakingNews(st.current_round),start=nowMs();db.prepare("UPDATE rounds SET status='news',released_at=COALESCE(released_at,CURRENT_TIMESTAMP) WHERE id=?").run(st.current_round);db.prepare("UPDATE event_state SET event_status='live',phase='news',phase_started_at=?,phase_ends_at=?,paused_remaining=NULL,breaking_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=1").run(start,start+60000);audit(req,'BREAKING_NEWS',{roundId:st.current_round,newsId:g.newsId,targetType:g.targetType,target:g.target,impactPct:g.impactPct});emitState();res.json({ok:true,breakingNews:g,state:state()});}catch(e){res.status(500).json({error:'Unable to trigger Breaking News: '+e.message});}});\n`;
  if(!sourceServer.includes(anchor)) throw new Error('Breaking News endpoint anchor missing.');
  fs.writeFileSync(SERVER,sourceServer.replace(anchor,endpoint+anchor));
  console.log('[breaking-news] endpoint');
}

const old='<button class="btn" onclick="startNext()" ${STATE.event_status===\'live\'||STATE.event_status===\'paused\'?\'disabled\':\'\'}>Start Next Round</button><button class="btn warning" onclick="pauseEvent()" ${!STATE.current_round?\'disabled\':\'\'}>${STATE.event_status===\'paused\'?\'Resume\':\'Pause\'}</button><button class="btn danger" onclick="lockRound()" ${STATE.phase!==\'trading\'?\'disabled\':\'\'}>Force Lock</button>';
const neu=old+'<button class="btn breakingBtn" onclick="triggerBreakingNews()" ${!STATE.current_round||![\'news\',\'trading\'].includes(STATE.phase)||STATE.event_status!==\'live\'||STATE.breaking_active?\'disabled\':\'\'}>⚡ Breaking News</button>';
patch(APP,old,neu,'host button');

if(!fs.readFileSync(APP,'utf8').includes('async function triggerBreakingNews()')){
  const sourceApp=fs.readFileSync(APP,'utf8');
  const anchor='async function resetEvent(){';
  const fn="async function triggerBreakingNews(){if(!confirm('Trigger BREAKING NEWS now? Players get 1 minute to read and 2 minutes to trade.'))return;try{await api('/api/admin/breaking-news',{method:'POST',body:JSON.stringify({})});toast('⚡ Breaking News published — 1 min read + 2 min trade');adminPage()}catch(e){toast(e.message)}}\n";
  if(!sourceApp.includes(anchor)) throw new Error('Breaking News client anchor missing.');
  fs.writeFileSync(APP,sourceApp.replace(anchor,fn+anchor));
  console.log('[breaking-news] client action');
}

patch(APP,"const total=STATE?.phase==='news'?120000:180000;","const total=STATE?.phase==='news'?(STATE?.breaking_active?60000:120000):STATE?.phase==='trading'?(STATE?.breaking_active?120000:180000):180000;",'timer duration');
console.log('[breaking-news] complete');
