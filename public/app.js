const app=document.getElementById('app');let ME=null,STATE=null,adminTab='overview',poll=null,sync=null,clock=null,presenceClock=null,serverOffset=0,holdingSort={key:'market_value',dir:'desc'},marketExpanded=false,holdingsExpanded=false,playerRenderSeq=0;
const $=s=>document.querySelector(s);const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=(a,b)=>b?((a-b)/b*100):0;
async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Request failed');return d}
function toast(x){const d=document.createElement('div');d.className='toast';d.textContent=x;document.body.appendChild(d);setTimeout(()=>d.remove(),2400)}
function pill(s){let c=s==='live'?'live':s==='paused'?'paused':s==='finished'?'finished':s==='trading'?'live':'';return `<span class="pill ${c}">${esc(String(s||'').replaceAll('_',' '))}</span>`}
function pnl(n){return `<span class="${n>=0?'green':'red'}">${n>=0?'+':''}${money(n)}</span>`}
function icon(name){return ({search:'⌕',chart:'◒',buy:'↗',sell:'↘',close:'×',news:'◆',pause:'Ⅱ',play:'▶',lock:'▣'})[name]||''}
async function boot(){try{const d=await api('/api/me');ME=d.user;STATE=d.state;serverOffset=(d.serverNow||Date.now())-Date.now();if(!ME){if(sync)sync.close();loginPage();return}startRealtime();ME.role==='admin'?adminPage():(STATE.event_status==='finished'?finalResultsPage():playerPage())}catch(e){loginPage(e.message)}}
function startRealtime(){if(sync)sync.close();sync=new EventSource('/api/events');sync.addEventListener('state',e=>{try{const incoming=JSON.parse(e.data);serverOffset=(incoming.serverNow||Date.now())-Date.now();const changed=!STATE||incoming.current_round!==STATE.current_round||incoming.event_status!==STATE.event_status||incoming.phase!==STATE.phase||incoming.phase_ends_at!==STATE.phase_ends_at||incoming.paused_remaining!==STATE.paused_remaining||incoming.registration_open!==STATE.registration_open||incoming.announcement?.id!==STATE.announcement?.id||incoming.presentation_mode!==STATE.presentation_mode||incoming.market_version!==STATE.market_version;STATE=incoming;if(changed){if(ME?.role==='admin')adminPage();else if(ME?.role==='player'){if(STATE.event_status==='finished')finalResultsPage();else playerPage();}}updateTimer();}catch(err){}});if(clock)clearInterval(clock);clock=setInterval(updateTimer,250);if(presenceClock)clearInterval(presenceClock);if(ME?.role==='player'){presenceClock=setInterval(()=>fetch('/api/player/heartbeat',{method:'POST'}).catch(()=>{}),15000)}}
let lastVisibility=!!document.hidden;document.addEventListener('visibilitychange',()=>{const hidden=document.hidden;if(hidden===lastVisibility)return;lastVisibility=hidden;fetch('/api/player/visibility',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hidden})}).catch(()=>{})});
function remainingMs(){if(!STATE)return 0;if(STATE.event_status==='paused')return Math.max(0,Number(STATE.paused_remaining||0));if(!STATE.phase_ends_at)return 0;return Math.max(0,Number(STATE.phase_ends_at)-(Date.now()+serverOffset))}
function timerText(){const sec=Math.ceil(remainingMs()/1000);const mm=String(Math.floor(sec/60)).padStart(2,'0'),ss=String(sec%60).padStart(2,'0');if(STATE?.event_status==='paused')return `PAUSED · ${mm}:${ss}`;if(STATE?.phase==='news')return `TRADING STARTS IN ${mm}:${ss}`;if(STATE?.phase==='trading')return `TRADING CLOSES IN ${mm}:${ss}`;if(STATE?.event_status==='finished')return 'EVENT FINISHED';return STATE?.current_round?'WAITING FOR NEXT ROUND':'WAITING FOR HOST'}
function timerLabel(){if(STATE?.event_status==='paused')return 'Emergency pause — timer frozen';if(STATE?.phase==='news')return 'News announcement';if(STATE?.phase==='trading')return 'Live trading';if(STATE?.event_status==='finished')return 'Final results';return 'Event control'}

/*
 * Player scroll preservation
 * --------------------------
 * The player dashboard is rebuilt after server/SSE updates. Capturing scroll
 * after an async request is too late for a real browser refresh, and an
 * element-anchor alone is unreliable when the number/height of dynamic cards
 * changes (especially near the bottom or inside the sector grid).
 *
 * We therefore use three safeguards:
 *  1) Persist the viewport state in sessionStorage during scrolling/pagehide,
 *     so a full browser refresh has the user's last known position.
 *  2) Capture BEFORE every dashboard fetch/re-render, not after it.
 *  3) Restore only after dynamic layout has settled. For a bottom position we
 *     preserve distance-from-bottom, which avoids restoring to the middle when
 *     the new page is temporarily shorter than the final page.
 *
 * The visual anchor is retained as a secondary fallback for large content
 * shifts. All restoration is clamped to the final scrollable range.
 */
const PLAYER_SCROLL_KEY='stockwars.player.scroll.v2';
let pendingPlayerScroll=null;
let scrollSaveTimer=null;

function maxScrollY(){return Math.max(0,document.documentElement.scrollHeight-window.innerHeight)}
function savePlayerScroll(){
  if(ME?.role!=='player')return;
  const y=Math.max(0,window.scrollY||window.pageYOffset||0);
  const max=maxScrollY();
  const nearBottom=max>0 && (max-y)<=Math.max(24,window.innerHeight*0.02);
  const data={y,max,distanceFromBottom:Math.max(0,max-y),nearBottom,viewport:window.innerHeight,t:Date.now()};
  try{sessionStorage.setItem(PLAYER_SCROLL_KEY,JSON.stringify(data))}catch(_){/* storage may be unavailable */}
}
function schedulePlayerScrollSave(){
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer=setTimeout(savePlayerScroll,50);
}
function readSavedPlayerScroll(){
  try{
    const raw=sessionStorage.getItem(PLAYER_SCROLL_KEY);
    if(!raw)return null;
    const d=JSON.parse(raw);
    if(!d||typeof d.y!=='number')return null;
    return d;
  }catch(_){return null}
}
function capturePlayerScroll(){
  const y=Math.max(0,window.scrollY||window.pageYOffset||0);
  const max=maxScrollY();
  const nearBottom=max>0 && (max-y)<=Math.max(24,window.innerHeight*0.02);
  const probeY=Math.min(Math.max(24,window.innerHeight*0.34),Math.max(24,window.innerHeight-24));
  const anchor=document.elementFromPoint(Math.min(28,Math.max(8,window.innerWidth/2)),probeY);
  let path='',offset=0;
  if(anchor){path=getDomPath(anchor);offset=probeY-anchor.getBoundingClientRect().top}
  return {y,max,distanceFromBottom:Math.max(0,max-y),nearBottom,viewport:window.innerHeight,path,offset,t:Date.now()};
}
function getDomPath(el){
  if(!el||el===document.body||el===document.documentElement)return '';
  if(el.id)return '#'+CSS.escape(el.id);
  const parts=[];let node=el;
  while(node&&node!==document.body&&node!==document.documentElement){
    let part=node.tagName.toLowerCase();const parent=node.parentElement;if(!parent)break;
    const siblings=Array.from(parent.children).filter(x=>x.tagName===node.tagName);
    if(siblings.length>1)part+=`:nth-of-type(${siblings.indexOf(node)+1})`;
    parts.unshift(part);node=parent;
  }
  return parts.length?'.wrap '+parts.map((x,i)=>i===0?x:'>'+x).join(' '):'';
}
function restorePlayerScroll(saved){
  if(!saved)return Promise.resolve();
  pendingPlayerScroll=saved;
  return new Promise(resolve=>{
    const started=performance.now();let stableFrames=0,lastHeight=-1,lastWidth=-1,finished=false;
    const finish=()=>{if(finished)return;finished=true;pendingPlayerScroll=null;resolve()};
    const apply=()=>{
      const height=document.documentElement.scrollHeight,width=document.documentElement.scrollWidth;
      const stable=height===lastHeight&&width===lastWidth;
      stableFrames=stable?stableFrames+1:0;lastHeight=height;lastWidth=width;
      const elapsed=performance.now()-started;
      // Require several identical layout frames, but never block the UI forever.
      if(stableFrames<3&&elapsed<1400){requestAnimationFrame(apply);return}
      const max=maxScrollY();let target=Number(saved.y)||0;
      if(saved.nearBottom || (Number(saved.distanceFromBottom)||0)<=24){
        // Bottom anchoring is based on the FINAL page height, not the height
        // observed before dynamic stock/sector content finished rendering.
        target=max-Math.max(0,Number(saved.distanceFromBottom)||0);
      }else if(saved.path){
        try{
          const anchor=document.querySelector(saved.path);
          if(anchor){
            const probeY=Math.min(Math.max(24,window.innerHeight*0.34),Math.max(24,window.innerHeight-24));
            target=(window.scrollY||0)+anchor.getBoundingClientRect().top-(probeY-(Number(saved.offset)||0));
          }
        }catch(_){/* fall through to numeric position */}
      }
      target=Math.max(0,Math.min(max,target));
      window.scrollTo(0,target);
      // A final frame handles image/font/layout shifts that occur immediately
      // after the stable pass. Re-apply bottom anchoring when necessary.
      requestAnimationFrame(()=>{
        const finalMax=maxScrollY();
        let finalTarget=Math.max(0,Math.min(finalMax,target));
        if(saved.nearBottom)finalTarget=Math.max(0,finalMax-Math.max(0,Number(saved.distanceFromBottom)||0));
        window.scrollTo(0,finalTarget);finish();
      });
    };
    requestAnimationFrame(apply);
  });
}
window.addEventListener('scroll',schedulePlayerScrollSave,{passive:true});
window.addEventListener('pagehide',savePlayerScroll);
window.addEventListener('beforeunload',savePlayerScroll);
try{history.scrollRestoration='manual'}catch(_){/* unsupported browser */}

async function playerPage(){
  const renderSeq=++playerRenderSeq;
  // IMPORTANT: capture before awaiting any dashboard request. On refresh this
  // also lets the sessionStorage snapshot win over the browser's transient
  // restoration while the new dynamic DOM is being constructed.
  const savedScroll=capturePlayerScroll()||readSavedPlayerScroll();
  const refreshSaved=readSavedPlayerScroll();
  // sessionStorage is used specifically for a real browser reload. During a
  // live SSE refresh the in-memory capture is authoritative; using the older
  // storage snapshot there would make the page jump back to a previous sector
  // or previous viewport position.
  const nav=performance.getEntriesByType?.('navigation')?.[0];
  const isBrowserReload=nav?.type==='reload';
  const effectiveScroll=isBrowserReload?(refreshSaved||savedScroll):savedScroll;
  const d=await api('/api/player/dashboard');
  if(renderSeq!==playerRenderSeq)return;
  STATE=d.state;if(d.player&&ME)ME.status=d.player.status;
  const p=d.portfolio,r=d.round;const can=r?.status==='trading'&&STATE.event_status==='live'&&STATE.phase==='trading'&&d.player?.status!=='suspended';
  shell(`<div class="hero playerhero"><div class="heroCopy"><span class="eyebrow">ROUND ${STATE.current_round||'—'} / 6</span><h2>${r?.news_title?esc(r.news_title):'Welcome to Stock Wars'}</h2><p>${STATE.phase==='news'?'Read the market stories below, identify the stocks and sectors most affected, and trade before the market reacts.':(r?.news_body?esc(r.news_body):'Your mission: build the most valuable portfolio before the final bell.')}</p><div class="playerBadge">${esc(ME?.playerId||('STW-'+String(ME?.id||'').padStart(3,'0')))} · ${esc(ME?.name||'Player')}</div>${d.player?.status==='suspended'?'<div class="alert dangerAlert">Your trading access has been suspended by the host. You can still view the event.</div>':''}</div><div class="heroState"><div class="stateIcon">${STATE.phase==='news'?icon('news'):STATE.phase==='trading'?icon('chart'):'•'}</div><div><b>${STATE.phase==='news'?'Market Briefing':STATE.phase==='trading'?'Market Open':'Standby'}</b><small>${STATE.event_status==='paused'?'Emergency pause active':can?'Orders accepted':'Waiting for market'}</small></div></div></div><section class="marketPulse card"><div class="pulseHead"><div><span class="eyebrow">LIVE MARKET PULSE</span><h2>Round ${STATE.current_round||'—'} News</h2><p>${d.newsEvents?.length||0} independent stories · prices react after trading closes</p></div><span class="newsCount">${d.newsEvents?.length||0} STORIES</span></div><div class="hostNewsPaperList playerUsesHostNewsUI">${(d.newsEvents||[]).map((n,i)=>`<article class="hostNewsStoryV8">
  <div class="hostNewsNoV8">${i+1}</div>
  <div class="hostNewsDividerV8"></div>
  <div class="hostNewsContentV8">
    <div class="hostNewsMetaV8"><span>${esc(n.category)}</span><span>${esc(n.target_sector||'MARKET-WIDE')}</span></div>
    <h3>${esc(n.headline)}</h3>
    <p>${esc(n.body)}</p>
  </div>
</article>`).join('')||'<div class="empty">News will appear automatically when the round starts.</div>'}</div></section><div class="kpis"><div class="kpi"><label>Portfolio Value</label><div class="value">${money(p.total)}</div><small>${pnl(p.profit)} overall</small></div><div class="kpi"><label>Invested</label><div class="value">${money(p.marketValue)}</div><small>Current market value</small></div><div class="kpi"><label>Available Cash</label><div class="value">${money(p.cash)}</div><small>Ready to deploy</small></div><div class="kpi"><label>Return</label><div class="value">${p.profit>=0?'+':''}${(p.profit/200000*100).toFixed(2)}%</div><small>vs ₹2,00,000 start</small></div></div><div class="grid"><div class="card c8"><div class="sectionHead"><div><span class="eyebrow">MARKET</span><h2>Stocks</h2></div><div class="marketTools"><div class="search"><span>${icon('search')}</span><input id="stockSearch" placeholder="Search stocks or sectors"></div>${can?'<span class="pill live">MARKET OPEN</span>':'<span class="pill">MARKET CLOSED</span>'}</div></div><div id="market" class="stockGrid"></div></div><div class="card c12"><div class="sectionHead"><div><span class="eyebrow">SECTORS & DISCOVERY</span><h2>Browse Market Sectors</h2></div><div class="marketTools"><div class="search"><span>${icon('search')}</span><input id="sectorSearch" placeholder="Search sectors"></div></div></div><div id="sectors" class="sectorGrid"></div></div><div class="card c12"><div class="sectionHead"><div><span class="eyebrow">PORTFOLIO HOLDINGS</span><h2>Your Positions</h2></div><div class="row"><span class="pill">${esc(d?.portfolio?.holdings?.length||0)} positions</span><button class="btn secondary tiny" onclick="openTransactions()">Transaction History</button></div></div><div class="portfolioSummary"><div><span>Total Value</span><b>${money(p.total)}</b></div><div><span>Unrealized P/L</span><b>${pnl(p.unrealizedPnl)}</b></div><div><span>Realized P/L</span><b>${pnl(p.realizedPnl)}</b></div><div><span>Cash</span><b>${money(p.cash)}</b></div></div><div id="holdings"></div></div><div class="card c12"><div class="sectionHead"><div><span class="eyebrow">PERFORMANCE</span><h2>Round History</h2></div><span class="muted">End-of-round snapshots</span></div><div id="roundHistory"></div></div><div class="card c12"><div class="sectionHead"><div><span class="eyebrow">LIVE RANKING</span><h2>Leaderboard</h2></div><span class="muted">Updates automatically</span></div><div id="leaderboard"></div></div></div><div id="stockModal"></div>`, 'Stock Wars','Player Trading Terminal');
  await renderPlayerData(can,d);
  if(renderSeq===playerRenderSeq)await restorePlayerScroll(effectiveScroll);
  updateTimer();
}

function updateTimer(){const t=document.getElementById('eventTimer'),l=document.getElementById('timerLabel');if(t)t.textContent=timerText();if(l)l.textContent=timerLabel();const b=document.getElementById('timerBar');if(b){const total=STATE?.phase==='news'?120000:180000;const pctv=STATE?.event_status==='paused'?0:Math.max(0,Math.min(100,remainingMs()/total*100));b.style.width=pctv+'%'}}
let authMode='player';
function loginPage(err=''){app.innerHTML=`<div class="auth"><div class="authbox"><div class="brand"><div class="logo">SW</div><div><div class="title">Stock Wars</div><div class="muted">Portfolio Management Simulation</div></div></div><div class="authswitch"><button id="pl" class="authmode active">Player Login</button><button id="hl" class="authmode">Host Login</button><button id="rt" class="authmode">Player Registration</button></div><div id="auth"></div></div></div>`;showLogin(err);$('#pl').onclick=()=>{authMode='player';showLogin()};$('#hl').onclick=()=>{authMode='host';showLogin()};$('#rt').onclick=showRegister}
function showLogin(err=''){const host=authMode==='host';$('#pl').classList.toggle('active',!host);$('#hl').classList.toggle('active',host);$('#rt').classList.remove('active');$('#auth').innerHTML=`${err?`<div class="error">${esc(err)}</div>`:''}<div class="loginheading"><h2>${host?'Host / Admin Login':'Player Login'}</h2><p class="muted">${host?'Access the Stock Wars control room.':'Enter your player account to access the trading terminal.'}</p></div><div class="form"><div class="full"><label>${host?'Host Username':'Username'}</label><input id="u" autofocus autocomplete="username"></div><div class="full"><label>Password</label><input id="p" type="password" autocomplete="current-password"></div><div class="full"><button class="btn" id="go">${host?'Enter Host Console':'Login to Trading Terminal'}</button></div></div>`;$('#go').onclick=async()=>{try{const endpoint=host?'/api/auth/admin-login':'/api/auth/player-login';const d=await api(endpoint,{method:'POST',body:JSON.stringify({username:$('#u').value,password:$('#p').value})});if(host&&d.user?.role!=='admin')throw Error('Host credentials required.');boot()}catch(e){showLogin(e.message)}}}
function showRegister(){authMode='register';$('#pl').classList.remove('active');$('#hl').classList.remove('active');$('#rt').classList.add('active');if(STATE&&!STATE.registration_open){$('#auth').innerHTML='<div class="error">Player registration is currently closed by the host.</div><div class="notice">Please contact the event host for access.</div>';return}$('#auth').innerHTML=`<div class="notice">Each player starts with <b>₹2,00,000</b>.</div><br><div class="form"><div class="full"><label>Player name</label><input id="n"></div><div><label>Username</label><input id="u"></div><div><label>Password</label><input id="p" type="password"></div><div class="full"><button class="btn" id="go">Create Account</button></div></div>`;$('#go').onclick=async()=>{try{await api('/api/auth/register',{method:'POST',body:JSON.stringify({name:$('#n').value,username:$('#u').value,password:$('#p').value})});boot()}catch(e){toast(e.message)}}}
function shell(body,title,sub){const a=STATE?.announcement;const status=ME?.status==='suspended'?`<span class="pill paused">ACCOUNT SUSPENDED</span>`:'';app.innerHTML=`<div class="wrap"><div class="top"><div class="brand"><div class="logo">SW</div><div><h1>${esc(title)}</h1><div class="muted">${esc(sub)}</div></div></div><div class="row">${status}<span class="pill userpill">${esc(ME.name)}</span><button class="btn secondary" id="logout">Logout</button></div></div><div class="timerbar"><div><b id="timerLabel">Event control</b><span class="timerhint">● Server synchronized</span></div><strong id="eventTimer">WAITING FOR HOST</strong><div class="timertrack"><span id="timerBar"></span></div></div>${a?`<div class="broadcast broadcast-${esc(a.severity)}"><b>HOST ANNOUNCEMENT</b><span>${esc(a.message)}</span></div>`:''}${body}</div>`;$('#logout').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});clearInterval(poll);if(presenceClock)clearInterval(presenceClock);ME=null;boot()}}
async function finalResultsPage(){const d=await api('/api/final-results');STATE=d.state;const mine=d.mine;shell(`<div class="finalPage"><div class="finalHero"><span class="eyebrow">STOCK WARS · EVENT COMPLETE</span><h1>Final Results</h1><p>The market is closed. Here are the final portfolio standings.</p><button class="btn" onclick="downloadTransactions()">Download Transaction History CSV</button></div>${mine?`<div class="winnerCard ${mine.rank===1?'champion':''}"><span class="eyebrow">YOUR RESULT</span><div class="finalRank">${mine.rank<=3?['🥇','🥈','🥉'][mine.rank-1]:'#'+mine.rank}</div><h2>${esc(mine.name)}</h2><div class="finalValue">${money(mine.total)}</div><div>${pnl(mine.profit)} · ${mine.tradeCount} trades</div><div class="playerBadge">${esc(mine.playerId)}</div></div>`:''}<div class="card"><div class="sectionHead"><div><span class="eyebrow">FINAL LEADERBOARD</span><h2>Top 20</h2></div></div><div class="finalLeaderboard">${d.rankings.map(x=>`<div class="finalRow ${mine&&x.id===mine.id?'me':''}"><span class="finalMedal">${x.rank<=3?['🥇','🥈','🥉'][x.rank-1]:x.rank}</span><div><b>${esc(x.name)}</b><small>${esc(x.playerId)}</small></div><strong>${money(x.total)}</strong><span>${pnl(x.profit)}</span></div>`).join('')}</div></div></div>`,'Stock Wars','Final Results')}
async function playerPage(){const renderSeq=++playerRenderSeq;const d=await api('/api/player/dashboard');if(renderSeq!==playerRenderSeq)return;const savedScroll=capturePlayerScroll();STATE=d.state;if(d.player&&ME)ME.status=d.player.status;const p=d.portfolio,r=d.round;const can=r?.status==='trading'&&STATE.event_status==='live'&&STATE.phase==='trading'&&d.player?.status!=='suspended';shell(`<div class="hero playerhero"><div class="heroCopy"><span class="eyebrow">ROUND ${STATE.current_round||'—'} / 6</span><h2>${r?.news_title?esc(r.news_title):'Welcome to Stock Wars'}</h2><p>${r?.news_body?esc(r.news_body):'Your mission: build the most valuable portfolio before the final bell.'}</p><div class="playerBadge">${esc(ME?.playerId||('STW-'+String(ME?.id||'').padStart(3,'0')))} · ${esc(ME?.name||'Player')}</div>${d.player?.status==='suspended'?'<div class="alert dangerAlert">Your trading access has been suspended by the host. You can still view the event.</div>':''}</div><div class="heroState"><div class="stateIcon">${STATE.phase==='news'?icon('news'):STATE.phase==='trading'?icon('chart'):'•'}</div><div><b>${STATE.phase==='news'?'Market Briefing':STATE.phase==='trading'?'Market Open':'Standby'}</b><small>${STATE.event_status==='paused'?'Emergency pause active':can?'Orders accepted':'Waiting for market'}</small></div></div></div><div class="kpis"><div class="kpi"><label>Portfolio Value</label><div class="value">${money(p.total)}</div><small>${pnl(p.profit)} overall</small></div><div class="kpi"><label>Invested</label><div class="value">${money(p.marketValue)}</div><small>Current market value</small></div><div class="kpi"><label>Available Cash</label><div class="value">${money(p.cash)}</div><small>Ready to deploy</small></div><div class="kpi"><label>Return</label><div class="value">${p.profit>=0?'+':''}${(p.profit/200000*100).toFixed(2)}%</div><small>vs ₹2,00,000 start</small></div></div><div class="grid"><div class="card c8"><div class="sectionHead"><div><span class="eyebrow">MARKET</span><h2>Stocks</h2></div><div class="marketTools"><div class="search"><span>${icon('search')}</span><input id="stockSearch" placeholder="Search stocks or sectors"></div>${can?'<span class="pill live">MARKET OPEN</span>':'<span class="pill">MARKET CLOSED</span>'}</div></div><div id="market" class="stockGrid"></div></div><div class="card c12"><div class="sectionHead"><div><span class="eyebrow">SECTORS & DISCOVERY</span><h2>Browse Market Sectors</h2></div><div class="marketTools"><div class="search"><span>${icon('search')}</span><input id="sectorSearch" placeholder="Search sectors"></div></div></div><div id="sectors" class="sectorGrid"></div></div><div class="card c12"><div class="sectionHead"><div><span class="eyebrow">PORTFOLIO HOLDINGS</span><h2>Your Positions</h2></div><div class="row"><span class="pill">${esc(d?.portfolio?.holdings?.length||0)} positions</span><button class="btn secondary tiny" onclick="openTransactions()">Transaction History</button></div></div><div class="portfolioSummary"><div><span>Total Value</span><b>${money(p.total)}</b></div><div><span>Unrealized P/L</span><b>${pnl(p.unrealizedPnl)}</b></div><div><span>Realized P/L</span><b>${pnl(p.realizedPnl)}</b></div><div><span>Cash</span><b>${money(p.cash)}</b></div></div><div id="holdings"></div></div><div class="card c12"><div class="sectionHead"><div><span class="eyebrow">PERFORMANCE</span><h2>Round History</h2></div><span class="muted">End-of-round snapshots</span></div><div id="roundHistory"></div></div><div class="card c12"><div class="sectionHead"><div><span class="eyebrow">LIVE RANKING</span><h2>Leaderboard</h2></div><span class="muted">Updates automatically</span></div><div id="leaderboard"></div></div></div><div id="stockModal"></div>`, 'Stock Wars','Player Trading Terminal');renderPlayerData(can,d).finally(()=>{if(renderSeq===playerRenderSeq)restorePlayerScroll(savedScroll)});updateTimer()}
async function renderPlayerData(can,dashboardData=null){
  const [stocks,d,lb,sectorsData]=await Promise.all([api('/api/stocks'),dashboardData||api('/api/player/dashboard'),api('/api/leaderboard'),api('/api/sectors')]);
  const search=$('#stockSearch');
  const draw=()=>{
    const q=(search?.value||'').toLowerCase();
    const list=stocks.filter(s=>(s.symbol+' '+s.name+' '+s.sector).toLowerCase().includes(q));
    const visible=q||marketExpanded?list:list.slice(0,12);
    $('#market').innerHTML=visible.map(s=>{
      const mp=pct(s.price,s.base_price);
      return `<div class="stockCard"><div class="stockTop"><div><span class="stock">${esc(s.symbol)}</span><span class="small">${esc(s.name)}</span></div><button class="iconBtn" onclick="openStock(${s.id})">${icon('chart')}</button></div><div class="stockPrice">${money(s.price)}</div><div class="stockMove ${mp>=0?'green':'red'}">${mp>=0?'+':''}${mp.toFixed(2)}% <span>from base</span></div><div class="stockBottom"><span class="sector">${esc(s.sector)}</span><button class="btn tiny" onclick="openOrder(${s.id},'BUY')" ${can?'':'disabled'}>Buy</button><button class="btn tiny secondary" onclick="openOrder(${s.id},'SELL')" ${can?'':'disabled'}>Sell</button></div></div>`
    }).join('')||'<div class="empty">No stocks match your search.</div>';
    if(!q && list.length>12) $('#market').insertAdjacentHTML('beforeend',`<div class="marketMore"><button class="btn secondary tiny" onclick="toggleMarket()">${marketExpanded?'Show fewer':'Show all '+list.length+' stocks'}</button></div>`);
  };
  draw();if(search)search.oninput=draw;
  const sectorSearch=$('#sectorSearch');
  const drawSectors=()=>{
    const q=(sectorSearch?.value||'').toLowerCase();
    const sectors=(sectorsData.sectors||[]).filter(s=>s.sector.toLowerCase().includes(q));
    $('#sectors').innerHTML=sectors.map(s=>`<button type="button" class="sectorTile" data-sector="${esc(s.sector)}"><span>${esc(s.sector)}</span><b>${s.stock_count} stocks</b><small>View sector →</small></button>`).join('')||'<div class="empty">No sectors match your search.</div>';
  };
  drawSectors();if(sectorSearch)sectorSearch.oninput=drawSectors;
  const sectorBox=$('#sectors'); if(sectorBox){sectorBox.onclick=e=>{const card=e.target.closest('.sectorTile');if(card)openSector(card.dataset.sector)}}
  renderHoldingsTable(d.portfolio.holdings,can);
  $('#roundHistory').innerHTML=d.roundHistory?.length?`<div class="historyGrid">${d.roundHistory.map(h=>`<div class="historyItem"><b>R${h.round_id}</b><strong>${money(h.total)}</strong><span>${pnl(h.profit)}</span></div>`).join('')}</div>`:'<div class="empty">Round performance will appear after each price update.</div>';
  $('#leaderboard').innerHTML=`<div class="leaderGrid">${lb.slice(0,10).map(x=>`<div class="leader ${x.id===ME.id?'me':''}"><span class="rank">${x.rank}</span><div><b>${esc(x.name)}</b><small>${x.rank===1?'Current leader':'Portfolio rank'}</small></div><strong>${money(x.total)}</strong><span>${pnl(x.profit)}</span></div>`).join('')}</div>`;
}
function sortHoldings(key){
  if(holdingSort.key===key) holdingSort.dir*=-1; else {holdingSort.key=key;holdingSort.dir=key==='symbol'?1:'desc';}
  api('/api/player/dashboard').then(d=>renderHoldingsTable(d.portfolio.holdings,STATE?.phase==='trading'&&STATE?.event_status==='live'&&d.player?.status!=='suspended'));
}
function renderHoldingsTable(rows,can){
  const arr=[...(rows||[])].sort((a,b)=>{
    let x=a[holdingSort.key],y=b[holdingSort.key];
    if(holdingSort.key==='symbol'){x=String(x);y=String(y);}
    return x<y?-holdingSort.dir:x>y?holdingSort.dir:0;
  });
  const arrow=k=>holdingSort.key===k?(holdingSort.dir>0?'↑':'↓'):'↕';
  const visible=holdingsExpanded?arr:arr.slice(0,10);
  $('#holdings').innerHTML=arr.length?`<div class="portfolioTableWrap"><table class="portfolioTable"><thead><tr>
    <th onclick="sortHoldings('symbol')">Stock ${arrow('symbol')}</th>
    <th onclick="sortHoldings('quantity')">Held Qty ${arrow('quantity')}</th><th>Purchased</th>
    <th onclick="sortHoldings('avg_price')">Avg Price ${arrow('avg_price')}</th>
    <th onclick="sortHoldings('price')">Market Price ${arrow('price')}</th>
    <th onclick="sortHoldings('cost_basis')">Cost Basis ${arrow('cost_basis')}</th>
    <th onclick="sortHoldings('market_value')">Market Value ${arrow('market_value')}</th>
    <th onclick="sortHoldings('unrealized_pnl')">Unrealized P/L ${arrow('unrealized_pnl')}</th>
    <th></th></tr></thead><tbody>${visible.map(h=>`<tr>
      <td><b>${esc(h.symbol)}</b><small>${esc(h.name)}</small></td><td>${h.quantity}</td><td>${h.total_purchased||0}</td><td>${money(h.avg_price)}</td><td>${money(h.price)}</td>
      <td>${money(h.cost_basis)}</td><td>${money(h.market_value)}</td><td>${pnl(h.unrealized_pnl)}</td>
      <td><button class="btn tiny" onclick="openOrder(${h.stock_id},'BUY')" ${can?'':'disabled'}>Buy</button> <button class="btn secondary tiny" onclick="openOrder(${h.stock_id},'SELL')" ${can?'':'disabled'}>Sell</button></td>
    </tr>`).join('')}</tbody></table></div>${arr.length>10?`<div class="compactAction"><button class="btn secondary tiny" onclick="toggleHoldings()">${holdingsExpanded?'Show fewer':'Show all '+arr.length+' holdings'}</button></div>`:''}`:'<div class="empty">No holdings yet. Buy a stock to create your first position.</div>';
}

function toggleMarket(){marketExpanded=!marketExpanded;renderPlayerData(STATE?.phase==='trading')}
function toggleHoldings(){holdingsExpanded=!holdingsExpanded;api('/api/player/dashboard').then(d=>renderHoldingsTable(d.portfolio.holdings,STATE?.phase==='trading'&&STATE?.event_status==='live'&&d.player?.status!=='suspended'))}
async function openStock(id){const d=await api('/api/stock/'+id+'/history');const pts=d.points||[];$('#stockModal').innerHTML=`<div class="modalBack" onclick="closeModal(event)"><div class="modal stockModal" onclick="event.stopPropagation()"><button class="close" onclick="closeModal()">×</button><span class="eyebrow">STOCK DETAIL</span><div class="stockDetailHead"><div><h2>${esc(d.stock.symbol)}</h2><p>${esc(d.stock.name)} · ${esc(d.stock.sector)}</p></div><div class="modalPrice">${money(d.stock.price)}</div></div><canvas id="priceChart" width="760" height="310"></canvas><div class="chartLegend">Round-by-round simulated market price</div><div class="stockDetailActions"><button class="btn buyBtn" onclick="openOrder(${d.stock.id},'BUY')">Buy ${esc(d.stock.symbol)}</button><button class="btn sellBtn" onclick="openOrder(${d.stock.id},'SELL')">Sell ${esc(d.stock.symbol)}</button></div></div></div>`;drawChart(pts)}
function drawChart(points){const c=$('#priceChart');if(!c)return;const ctx=c.getContext('2d'),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);if(!points.length)return;const vals=points.map(p=>p.price),min=Math.min(...vals),max=Math.max(...vals),pad=38;ctx.strokeStyle='#d6dde7';ctx.lineWidth=1;for(let i=0;i<5;i++){const y=pad+(h-pad*2)*i/4;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke()}const x=i=>pad+(w-pad*2)*(i/(Math.max(1,points.length-1)));const y=v=>h-pad-(v-min)/(Math.max(0.0001,max-min))*(h-pad*2);ctx.beginPath();points.forEach((p,i)=>{if(i===0)ctx.moveTo(x(i),y(p.price));else ctx.lineTo(x(i),y(p.price))});ctx.strokeStyle='#1769aa';ctx.lineWidth=4;ctx.stroke();points.forEach((p,i)=>{ctx.beginPath();ctx.arc(x(i),y(p.price),4,0,Math.PI*2);ctx.fillStyle='#1769aa';ctx.fill();ctx.fillStyle='#536174';ctx.font='12px system-ui';ctx.fillText(p.label,x(i)-10,h-10)});ctx.fillStyle='#172033';ctx.font='bold 13px system-ui';ctx.fillText(money(max),8,pad+4);ctx.fillText(money(min),8,h-pad)}
function closeModal(e){if(!e||e.target.classList.contains('modalBack'))$('#stockModal').innerHTML=''}
async function openOrder(id,side){
  const stocks=await api('/api/stocks');const s=stocks.find(x=>x.id===id);if(!s)return;
  const d=await api('/api/player/dashboard');const h=d.portfolio.holdings.find(x=>x.stock_id===id);
  const buy=side==='BUY';
  $('#stockModal').innerHTML=`<div class="modalBack" onclick="closeModal(event)"><div class="modal orderModal ${buy?'buyOrder':'sellOrder'}" onclick="event.stopPropagation()">
    <button class="close" onclick="closeModal()">×</button>
    <div class="tradeTabs"><button class="${buy?'activeBuy':''}" onclick="openOrder(${id},'BUY')">BUY</button><button class="${!buy?'activeSell':''}" onclick="openOrder(${id},'SELL')">SELL</button></div>
    <span class="eyebrow">${side} ORDER</span><h2>${esc(s.symbol)}</h2><p class="muted">${esc(s.name)} · ${esc(s.sector)}</p>
    <div class="balanceHero"><span>Current Balance</span><strong id="orderBalance">${money(d.portfolio.cash)}</strong></div>
    <div class="orderPrice">${money(s.price)} <small>current market price</small></div>
    <div class="orderGrid"><div><label>Ticker</label><input id="orderSymbol" value="${esc(s.symbol)}" readonly></div>
      <div><label>Quantity</label><input id="orderQty" type="number" min="1" step="1" value="1"></div>
      <div><label>Order Type</label><select id="orderType"><option value="MARKET">Market</option><option value="LIMIT">Limit</option></select></div>
      <div id="limitWrap" class="hidden"><label>Limit Price</label><input id="limitPrice" type="number" min="0.01" step="0.01" value="${s.price}"></div>
    </div>
    <div id="sellAvail" class="notice ${buy?'hidden':''}">Available to sell: <b>${h?.quantity||0}</b> shares</div>
    <div class="estimateBox"><div><span>Estimated ${buy?'Amount to Pay':'Amount Received'}</span><strong id="estimatedAmount">Calculating…</strong></div><div><span>Estimated Price / Share</span><b id="estimatedPrice">—</b></div><small id="estimateStatus">Estimated amount updates with quantity and order type.</small></div>
    <div id="orderError" class="error hidden"></div>
    <button class="btn wide ${buy?'buyBtn':'sellBtn'}" id="reviewBtn" onclick="reviewOrder(${id},'${side}',${s.price})">Review ${side} Order</button>
  </div></div>`;
  const update=()=>{const type=$('#orderType').value;$('#limitWrap').classList.toggle('hidden',type!=='LIMIT');updateOrderEstimate(id,side)};
  $('#orderType').onchange=update;$('#orderQty').oninput=update;$('#limitPrice').oninput=update;update();
}
async function updateOrderEstimate(id,side){
  const err=$('#orderError'),btn=$('#reviewBtn');if(!$('#orderQty'))return;
  const qty=Number($('#orderQty').value),type=$('#orderType').value,lp=type==='LIMIT'?Number($('#limitPrice').value):null;
  if(!Number.isInteger(qty)||qty<=0){$('#estimatedAmount').textContent='—';return}
  try{
    err.classList.add('hidden');$('#estimateStatus').textContent='Calculating server estimate…';
    const q=await api(`/api/player/quote?stockId=${id}&side=${side}&quantity=${qty}&orderType=${type}${lp!==null?'&limitPrice='+encodeURIComponent(lp):''}`);
    $('#estimatedAmount').textContent=money(q.net);
    $('#estimatedPrice').textContent=money(q.executionPrice);
    
    $('#orderBalance').textContent=money(q.currentBalance);
    $('#estimateStatus').textContent='Server-calculated estimate';
    if(side==='SELL' && qty>q.availableQuantity) {err.textContent=`You can sell a maximum of ${q.availableQuantity} shares.`;err.classList.remove('hidden');btn.disabled=true}
    else if(side==='BUY' && q.net>q.currentBalance) {err.textContent=`Insufficient balance. You need ${money(q.net)} but have ${money(q.currentBalance)}.`;err.classList.remove('hidden');btn.disabled=true}
    else {btn.disabled=false}
  }catch(e){$('#estimatedAmount').textContent='—';$('#estimateStatus').textContent='Unable to calculate estimate.';err.textContent=e.message;err.classList.remove('hidden');btn.disabled=true}
}

async function reviewOrder(id,side,marketPrice){
  try{
    const quantity=Number($('#orderQty').value),orderType=$('#orderType').value,limitPrice=orderType==='LIMIT'?Number($('#limitPrice').value):null;
    const q=await api(`/api/player/quote?stockId=${id}&side=${side}&quantity=${quantity}&orderType=${orderType}${limitPrice!==null?'&limitPrice='+encodeURIComponent(limitPrice):''}`);
    $('#stockModal').querySelector('.orderModal').innerHTML=`<button class="close" onclick="closeModal()">×</button><span class="eyebrow">CONFIRM ${side}</span>
      <h2>Review Order</h2><p class="muted">Server-calculated transaction quote</p>
      <div class="confirmBox"><div><span>Stock</span><b>${esc(q.stockSymbol||'')}</b></div><div><span>Quantity</span><b>${q.quantity}</b></div><div><span>Order Type</span><b>${q.orderType}</b></div><div><span>Execution Price</span><b>${money(q.executionPrice)}</b></div><div class="confirmTotal"><span>Transaction Total</span><strong>${money(q.net)}</strong></div><div class="confirmTotal"><span>Balance After Trade</span><strong>${money(q.balanceAfter)}</strong></div></div>
      ${side==='SELL'&&q.availableQuantity<q.quantity?'<div class="error">You do not hold enough shares.</div>':''}
      <div class="row"><button class="btn secondary" onclick="openOrder(${id},'${side}')">Edit</button><button class="btn ${side==='BUY'?'':'danger'}" onclick="submitOrder(${id},'${side}',${marketPrice},'${q.orderType}',${q.limitPrice===null?'null':q.limitPrice},${q.quantity})">Confirm & Execute</button></div>`;
  }catch(e){toast(e.message)}
}
async function submitOrder(id,side,price,orderType='MARKET',limitPrice=null,finalQty=0){
  const nonce=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g,'');
  try{
    const q=await api(`/api/player/quote?stockId=${id}&side=${side}&quantity=${finalQty}&orderType=${orderType}${limitPrice!==null?'&limitPrice='+encodeURIComponent(limitPrice):''}`);
    await api('/api/player/trade',{method:'POST',body:JSON.stringify({stockId:id,side,quantity:finalQty,orderType,limitPrice,clientNonce:nonce})});
    closeModal();toast(`${side} ${q.quantity} shares completed · total ${money(q.net)}`);playerPage();
  }catch(e){toast(e.message)}
}


async function openSector(sector){
  const modal=$('#stockModal');modal.innerHTML=`<div class="modalBack"><div class="modal sectorModal" onclick="event.stopPropagation()"><button class="close" onclick="closeModal()">×</button><span class="eyebrow">SECTOR</span><h2>${esc(sector)}</h2><div class="search sectorModalSearch"><span>${icon('search')}</span><input id="sectorStockSearch" placeholder="Search stocks in ${esc(sector)}"></div><div id="sectorStocks" class="sectorStocks"><div class="loading">Loading sector…</div></div></div></div>`;
  try{
    const d=await api('/api/sectors/'+encodeURIComponent(sector));const input=$('#sectorStockSearch');
    const draw=()=>{
      const q=(input?.value||'').toLowerCase();
      const rows=d.stocks.filter(s=>(s.symbol+' '+s.name).toLowerCase().includes(q));
      $('#sectorStocks').innerHTML=rows.map(s=>`<div class="sectorRow"><div><b>${esc(s.symbol)}</b><small>${esc(s.name)}</small></div><div><span>Price</span><b>${money(s.price)}</b></div><div><span>24h</span><b class="${s.change_pct>=0?'green':'red'}">${s.change_pct>=0?'+':''}${s.change_pct.toFixed(2)}%</b></div><div><span>Market Cap</span><b>${formatCompact(s.market_cap,'₹')}</b></div><div><span>Volume</span><b>${formatCompact(s.trading_volume,'')}</b></div><div class="row"><button class="iconBtn" onclick="closeModal();openStock(${s.id})">${icon('chart')}</button><button class="btn tiny" onclick="closeModal();openOrder(${s.id},'BUY')">Buy</button><button class="btn secondary tiny" onclick="closeModal();openOrder(${s.id},'SELL')">Sell</button></div></div>`).join('')||'<div class="empty">No stocks match your search.</div>';
    };
    draw();if(input)input.oninput=draw;
  }catch(e){$('#sectorStocks').innerHTML=`<div class="error">${esc(e.message)}</div>`}
}
function formatCompact(n,prefix=''){n=Number(n)||0;if(n>=1e12)return prefix+(n/1e12).toFixed(2)+'T';if(n>=1e9)return prefix+(n/1e9).toFixed(2)+'B';if(n>=1e6)return prefix+(n/1e6).toFixed(2)+'M';if(n>=1e3)return prefix+(n/1e3).toFixed(1)+'K';return prefix+String(Math.round(n))}
async function openTransactions(){
  try{
    const d=await api('/api/player/transactions');
    $('#stockModal').innerHTML=`<div class="modalBack" onclick="closeModal(event)"><div class="modal transactionModal" onclick="event.stopPropagation()">
      <button class="close" onclick="closeModal()">×</button><div class="sectionHead"><div><span class="eyebrow">TRANSACTIONS</span><h2>Order History</h2></div><button class="btn secondary tiny" onclick="downloadTransactions()">Export CSV</button></div>
      <div class="notice">Cost basis: ${esc(d.costBasisMethod)}</div>
      <div class="scroll"><table><thead><tr><th>Time</th><th>Round</th><th>Side</th><th>Stock</th><th>Qty</th><th>Price</th><th>Type</th><th>Transaction Total</th><th>Realized P/L</th></tr></thead><tbody>
      ${d.transactions.map(t=>`<tr><td>${esc(t.created_at)}</td><td>R${t.round_id}</td><td class="${t.side==='BUY'?'green':'red'}">${t.side}</td><td><b>${esc(t.symbol)}</b></td><td>${t.quantity}</td><td>${money(t.price)}</td><td>${t.order_type}${t.limit_price?` @ ${money(t.limit_price)}`:''}</td><td>${money(t.net_total)}</td><td>${t.side==='SELL'?pnl(t.realized_pnl):'—'}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No transactions yet.</td></tr>'}
      </tbody></table></div></div></div>`;
  }catch(e){toast(e.message)}
}
async function downloadTransactions(){try{const r=await fetch('/api/player/export-transactions');if(!r.ok)throw Error('Export failed');const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='stock-wars-transactions.csv';a.click();URL.revokeObjectURL(a.href)}catch(e){toast(e.message)}}

async function adminPage(){const o=await api('/api/admin/overview');STATE=o.state;shell(`<div class="hostLayout"><aside class="hostNav"><button class="hostNavItem ${adminTab==='overview'?'active':''}" onclick="adminTab='overview';adminPage()">Dashboard</button><button class="hostNavItem ${adminTab==='players'?'active':''}" onclick="adminTab='players';adminPage()">Players</button><button class="hostNavItem ${adminTab==='operations'?'active':''}" onclick="adminTab='operations';adminPage()">Operations</button><button class="hostNavItem ${adminTab==='analytics'?'active':''}" onclick="adminTab='analytics';adminPage()">Analytics</button><button class="hostNavItem ${adminTab==='finale'?'active':''}" onclick="adminTab='finale';adminPage()">🏆 Finale</button><button class="hostNavItem ${adminTab==='rounds'?'active':''}" onclick="adminTab='rounds';adminPage()">News & Rounds</button><button class="hostNavItem ${adminTab==='impacts'?'active':''}" onclick="adminTab='impacts';adminPage()">Price Impacts</button><button class="hostNavItem ${adminTab==='audit'?'active':''}" onclick="adminTab='audit';adminPage()">Audit Log</button></aside><main id="admin"></main></div>`,'Stock Wars — Host Console','Event Control Room');if(adminTab==='overview')adminOverview(o);if(adminTab==='players')adminPlayers();if(adminTab==='operations')adminOperations();if(adminTab==='analytics')adminAnalytics();if(adminTab==='finale')adminFinale();if(adminTab==='rounds')adminRounds();if(adminTab==='impacts')adminImpacts();if(adminTab==='audit')adminAudit();updateTimer()}
function adminOverview(o){const active=STATE.phase;$('#admin').innerHTML=`<div class="hostHero"><div><span class="eyebrow">LIVE CONTROL ROOM</span><h2>${STATE.current_round?`Round ${STATE.current_round} · ${active==='news'?'News briefing':active==='trading'?'Trading window':'Standby'}`:'Ready to launch'}</h2><p>All connected players are synchronized to this server.</p></div><div class="hostTimer"><small>${timerLabel()}</small><strong id="eventTimerHost">${timerText()}</strong></div></div><div class="hostKpis"><div><span>Players</span><b>${o.playerCount}</b></div><div><span>Orders</span><b>${o.tradeCount}</b></div><div><span>Round</span><b>${STATE.current_round}/6</b></div><div><span>Phase</span><b>${esc(active)}</b></div></div><div class="hostGrid"><div class="card hostControl c8"><div class="sectionHead"><div><span class="eyebrow">EVENT ENGINE</span><h2>Round Control</h2></div>${pill(STATE.event_status)}</div><div class="controlSteps"><div class="step ${active==='news'?'on':''}"><span>01</span><b>News</b><small>2 min</small></div><div class="step ${active==='trading'?'on':''}"><span>02</span><b>Trading</b><small>3 min</small></div><div class="step ${STATE.current_round&&STATE.phase==='idle'?'on':''}"><span>03</span><b>Price Update</b><small>Automatic</small></div></div><div class="row"><button class="btn" onclick="startNext()" ${STATE.event_status==='live'||STATE.event_status==='paused'?'disabled':''}>Start Next Round</button><button class="btn warning" onclick="pauseEvent()" ${!STATE.current_round?'disabled':''}>${STATE.event_status==='paused'?'Resume':'Pause'}</button><button class="btn danger" onclick="lockRound()" ${STATE.phase!=='trading'?'disabled':''}>Force Lock</button><button class="btn secondary resetBtn" onclick="resetEvent()">Reset Event</button></div><div class="notice">Normal flow is automatic. Force Lock is only for emergencies; price impacts are applied immediately.</div></div><div class="card c4 hostNewsPanel">
<div class="sectionHead">
  <div><span class="eyebrow">CURRENT NEWS</span><h2>${STATE.current_round?`Round ${STATE.current_round} · ${o.newsEvents?.length||0} stories`:'No active round'}</h2></div>
</div>
${o.newsEvents?.length ? `<div class="hostNewsPaperList">${o.newsEvents.map((n,i)=>`
  <article class="hostNewsStoryV8">
    <div class="hostNewsNoV8">${i+1}</div>
    <div class="hostNewsDividerV8"></div>
    <div class="hostNewsContentV8">
      <div class="hostNewsMetaV8"><span>${esc(n.category)}</span><span>${esc(n.target_sector||'MARKET-WIDE')}</span></div>
      <h3>${esc(n.headline)}</h3>
      <p>${esc(n.body)}</p>
    </div>
  </article>`).join('')}</div>` : '<div class="empty">Start a round to publish news.</div>'}
</div><div class="card c12"><div class="sectionHead"><div><span class="eyebrow">LIVE RANKING</span><h2>Top Players</h2></div></div><div id="hostLeaderboard"></div></div></div>`;loadHostLeaderboard();syncHostTimer()}
async function loadHostLeaderboard(){const lb=await api('/api/leaderboard');$('#hostLeaderboard').innerHTML=`<div class="leaderGrid">${lb.slice(0,12).map(x=>`<div class="leader"><span class="rank">${x.rank}</span><div><b>${esc(x.name)}</b><small>${esc(x.username)}</small></div><strong>${money(x.total)}</strong><span>${pnl(x.profit)}</span></div>`).join('')}</div>`}
function syncHostTimer(){const el=document.getElementById('eventTimerHost');if(el){el.textContent=timerText();setTimeout(syncHostTimer,250)}}
async function adminAudit(){const rows=await api('/api/admin/audit');$('#admin').innerHTML=`<div class="card"><div class="sectionHead"><div><span class="eyebrow">SECURITY</span><h2>Audit Log</h2></div><span class="muted">Latest 500 events</span></div><div class="scroll"><table><thead><tr><th>Time</th><th>Role</th><th>Action</th><th>ID</th><th>Details</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.created_at)}</td><td>${esc(x.role||'-')}</td><td><b>${esc(x.action)}</b></td><td>${x.user_id||'-'}</td><td>${esc(x.meta||'')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No audit events yet.</td></tr>'}</tbody></table></div></div>`}
async function startNext(){try{await api('/api/admin/start-round',{method:'POST',body:JSON.stringify({roundId:STATE.current_round+1})});toast('Round started — news is live');adminPage()}catch(e){toast(e.message)}}
async function lockRound(){try{await api('/api/admin/lock-round',{method:'POST'});toast('Emergency lock applied');adminPage()}catch(e){toast(e.message)}}
async function pauseEvent(){try{await api('/api/admin/pause',{method:'POST'});toast(STATE.event_status==='paused'?'Event resumed':'Event paused');adminPage()}catch(e){toast(e.message)}}
async function resetEvent(){if(!confirm('Reset the entire event?'))return;try{await api('/api/admin/reset',{method:'POST'});toast('Event reset');adminPage()}catch(e){toast(e.message)}}
async function adminPlayers(){const ps=await api('/api/admin/players');ps.sort((a,b)=>b.total-a.total);$('#admin').innerHTML=`<div class="card"><div class="sectionHead"><div><span class="eyebrow">PARTICIPANTS</span><h2>Players</h2></div><span class="muted">${ps.length} registered</span></div><div class="scroll"><table><thead><tr><th>Rank</th><th>Name</th><th>Username</th><th>Portfolio</th><th>P/L</th><th>Status</th><th></th></tr></thead><tbody>${ps.map((p,i)=>`<tr><td>${i+1}</td><td><b>${esc(p.name)}</b><small>${esc(p.playerId||('STW-'+String(p.id).padStart(3,'0')))}</small></td><td>${esc(p.username)}</td><td>${money(p.total)}</td><td>${pnl(p.profit)}</td><td><span class="pill ${p.status==='suspended'?'paused':p.online?'live':''}">${p.status==='suspended'?'Suspended':p.online?'Online':'Offline'}</span></td><td><button class="btn secondary tiny" onclick="viewPlayer(${p.id})">View</button> <button class="btn secondary tiny" onclick="playerCard(${p.id})">Card</button> <button class="btn secondary tiny" onclick="playerQR(${p.id})">QR</button> <button class="btn ${p.status==='suspended'?'good':'danger'} tiny" onclick="togglePlayerStatus(${p.id},'${p.status==='suspended'?'active':'suspended'}')">${p.status==='suspended'?'Reactivate':'Suspend'}</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">No players.</td></tr>'}</tbody></table></div></div>`}
async function viewPlayer(id){const [p,h]=await Promise.all([api('/api/admin/player/'+id),api('/api/admin/player/'+id+'/history')]);$('#admin').innerHTML=`<div class="card"><div class="row"><div><span class="eyebrow">PLAYER PROFILE</span><h2>${esc(p.name)}</h2><div class="muted">@${esc(p.username)}</div></div><button class="btn secondary right" onclick="adminPlayers()">Back</button></div><div class="kpis"><div class="kpi"><label>Portfolio</label><div class="value">${money(p.total)}</div></div><div class="kpi"><label>P/L</label><div class="value">${pnl(p.profit)}</div></div><div class="kpi"><label>Cash</label><div class="value">${money(p.cash)}</div></div><div class="kpi"><label>Stock Value</label><div class="value">${money(p.marketValue)}</div></div></div><div class="row" style="margin-bottom:14px"><span class="pill ${p.status==='suspended'?'paused':'live'}">${p.status==='suspended'?'SUSPENDED':'ACTIVE'}</span><span class="muted">${p.playerId||('STW-'+String(p.id).padStart(3,'0'))}</span><button class="btn ${p.status==='suspended'?'good':'danger'} tiny right" onclick="togglePlayerStatus(${p.id},'${p.status==='suspended'?'active':'suspended'}');viewPlayer(${p.id})">${p.status==='suspended'?'Reactivate':'Suspend Trading'}</button></div><h3>Round Performance</h3><div class="historyGrid">${(h.history||[]).map(x=>`<div class="historyItem"><b>R${x.round_id}</b><strong>${money(x.total)}</strong><span>${pnl(x.profit)}</span></div>`).join('')||'<div class="empty">No completed round snapshots.</div>'}</div><h3>Holdings</h3><div class="scroll"><table><thead><tr><th>Stock</th><th>Qty</th><th>Avg Buy</th><th>Current</th><th>Value</th></tr></thead><tbody>${p.holdings.map(h=>`<tr><td>${esc(h.symbol)}</td><td>${h.quantity}</td><td>${h.total_purchased||0}</td><td>${money(h.avg_price)}</td><td>${money(h.price)}</td><td>${money(h.quantity*h.price)}</td></tr>`).join('')||'<tr><td colspan="5">No holdings.</td></tr>'}</tbody></table></div><h3 style="margin-top:18px">Trades</h3><div class="scroll"><table><thead><tr><th>Round</th><th>Side</th><th>Stock</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${p.trades.map(t=>`<tr><td>${t.round_id}</td><td class="${t.side==='BUY'?'green':'red'}">${t.side}</td><td>${esc(t.symbol)}</td><td>${t.quantity}</td><td>${money(t.price)}</td><td>${money(t.total)}</td></tr>`).join('')||'<tr><td colspan="6">No trades.</td></tr>'}</tbody></table></div></div>`}
async function adminOperations(){
  const d=await api('/api/admin/operations');
  const open=d.registrationOpen;
  $('#admin').innerHTML=`<div class="opsGrid">
    <div class="card">
      <div class="sectionHead"><div><span class="eyebrow">REGISTRATION CONTROL</span><h2>Player Registration</h2></div><span class="pill ${open?'live':''}">${open?'OPEN':'LOCKED'}</span></div>
      <p class="muted">${open?'New players can create accounts until the host starts Round 1.':'Registration is locked. No new player accounts can be created.'}</p>
      <div class="row"><button class="btn ${open?'danger':'good'}" onclick="toggleRegistration(${!open})">${open?'Lock Registration':'Open Registration'}</button><span class="muted">${d.players.length} registered</span></div>
    </div>
    <div class="card">
      <div class="sectionHead"><div><span class="eyebrow">LIVE PRESENCE</span><h2>Connections</h2></div><span class="pill live">${d.onlinePlayers} ONLINE</span></div>
      <div class="opsKpis"><div><b>${d.players.length}</b><small>Registered</small></div><div><b>${d.onlinePlayers}</b><small>Online</small></div><div><b>${d.suspendedPlayers}</b><small>Suspended</small></div><div><b>${d.snapshotCount}</b><small>Snapshots</small></div></div>
    </div>
    <div class="card">
      <div class="sectionHead"><div><span class="eyebrow">TRADING RULES</span><h2>Cost Basis</h2></div></div>
      <div class="form"><div><label>Cost Basis</label><select id="costBasis"><option value="FIFO" ${d.costBasisMethod==='FIFO'?'selected':''}>FIFO — oldest lots first</option><option value="AVERAGE" ${d.costBasisMethod==='AVERAGE'?'selected':''}>Average Cost</option></select></div><div class="row"><button class="btn" onclick="setCostBasis()">Save Cost Basis</button></div></div>
      <div class="notice">Changing cost basis affects future sell calculations; existing holdings remain intact.</div>
    </div>
    <div class="card">
      <div class="sectionHead"><div><span class="eyebrow">HOST BROADCAST</span><h2>Announcement</h2></div></div>
      <div class="form"><div class="full"><label>Message</label><textarea id="broadcastMsg" rows="3" maxlength="300" placeholder="Example: Trading resumes in 30 seconds."></textarea></div><div><label>Severity</label><select id="broadcastSeverity"><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="critical">Critical</option></select></div><div class="row" style="align-items:end"><button class="btn" onclick="sendBroadcast()">Broadcast</button><button class="btn secondary" onclick="clearBroadcast()">Clear</button></div></div>
      ${d.announcement?`<div class="notice"><b>Current:</b> ${esc(d.announcement.message)}</div>`:'<div class="empty">No active announcement.</div>'}
    </div>
    <div class="card">
      <div class="sectionHead"><div><span class="eyebrow">CONNECTION MONITOR</span><h2>Players</h2></div></div>
      <div class="scroll"><table><thead><tr><th>Player</th><th>Status</th><th>Connection</th><th>Tab</th><th>Hidden Events</th><th>Last Seen</th></tr></thead><tbody>
      ${d.players.map(p=>`<tr><td><b>${esc(p.name)}</b><small>${esc(p.playerId)}</small></td><td>${p.status==='suspended'?'<span class="pill paused">SUSPENDED</span>':'<span class="pill live">ACTIVE</span>'}</td><td>${p.online?'<span class="green">● Online</span>':'<span class="muted">○ Offline</span>'}</td><td>${p.last_visibility==='hidden'?'<span class="yellow">Hidden</span>':'Visible'}</td><td>${p.visibility_events||0}</td><td>${p.secondsSinceSeen===null?'—':p.secondsSinceSeen+'s ago'}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No players registered.</td></tr>'}
      </tbody></table></div>
    </div>
    <div class="card">
      <div class="sectionHead"><div><span class="eyebrow">EVENT DATA</span><h2>Full Backup Export</h2></div></div>
      <p class="muted">Download a complete JSON event package containing rounds, stocks, impacts, trades, snapshots, flags, announcements and audit history.</p>
      <button class="btn" onclick="downloadEventExport()">Download Event Package</button>
    </div>
  </div>`;
}
async function setCostBasis(){try{await api('/api/admin/cost-basis',{method:'POST',body:JSON.stringify({method:$('#costBasis').value})});toast('Cost basis updated');adminOperations()}catch(e){toast(e.message)}}
async function toggleRegistration(enabled){try{const d=await api('/api/admin/registration',{method:'POST',body:JSON.stringify({enabled})});STATE=d.state;toast(enabled?'Registration opened':'Registration locked');adminOperations()}catch(e){toast(e.message)}}
async function sendBroadcast(){try{const msg=$('#broadcastMsg').value.trim();if(!msg)return toast('Enter an announcement');await api('/api/admin/announcement',{method:'POST',body:JSON.stringify({message:msg,severity:$('#broadcastSeverity').value})});toast('Announcement broadcast');adminOperations()}catch(e){toast(e.message)}}
async function clearBroadcast(){try{await api('/api/admin/announcement/clear',{method:'POST'});toast('Announcement cleared');adminOperations()}catch(e){toast(e.message)}}
async function downloadEventExport(){try{const r=await fetch('/api/admin/export-event');if(!r.ok)throw Error('Export failed');const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='stock-wars-event-package.json';a.click();URL.revokeObjectURL(a.href);toast('Event package downloaded')}catch(e){toast(e.message)}}
async function togglePlayerStatus(id,status){const action=status==='suspended'?'suspend':'reactivate';if(status==='suspended'&&!confirm('Suspend this player\'s trading access?'))return;try{await api('/api/admin/player/'+id+'/status',{method:'POST',body:JSON.stringify({status})});toast(action==='suspend'?'Player suspended':'Player reactivated');adminPlayers()}catch(e){toast(e.message)}}
async function adminAnalytics(){const d=await api('/api/admin/phase4-analytics');$("#admin").innerHTML=`<div class="phase4Grid"><div class="card"><div class="sectionHead"><div><span class="eyebrow">COMPETITION</span><h2>Advanced Rankings</h2></div></div><div class="scroll"><table><thead><tr><th>Rank</th><th>Player</th><th>ID</th><th>Portfolio</th><th>P/L</th><th>Trades</th></tr></thead><tbody>${d.rankings.map(x=>`<tr><td>${x.rank<=3?['🥇','🥈','🥉'][x.rank-1]:x.rank}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.playerId)}</td><td>${money(x.total)}</td><td>${pnl(x.profit)}</td><td>${x.tradeCount}</td></tr>`).join('')}</tbody></table></div></div><div class="card"><div class="sectionHead"><div><span class="eyebrow">SECTORS</span><h2>Sector Performance</h2></div></div>${d.sectorMovement.map(s=>`<div class="sectorMetric"><div class="row"><b>${esc(s.sector)}</b><span class="${Number(s.movement_pct)>=0?'green':'red'}">${Number(s.movement_pct)>=0?'+':''}${Number(s.movement_pct).toFixed(2)}%</span></div><div class="bar"><i style="width:${Math.min(100,Math.abs(Number(s.movement_pct))*4)}%"></i></div><small>${s.stocks} stocks · range ${Number(s.min_pct).toFixed(1)}% to ${Number(s.max_pct).toFixed(1)}%</small></div>`).join('')}</div><div class="card"><div class="sectionHead"><div><span class="eyebrow">ROUND ACTIVITY</span><h2>Trading by Round</h2></div></div><div class="roundAnalytics">${d.rounds.map(r=>{const b=d.roundTrades.find(x=>x.round_id===r.id&&x.side==='BUY'),s=d.roundTrades.find(x=>x.round_id===r.id&&x.side==='SELL');return `<div class="roundStat"><b>R${r.id}</b><span>${esc(r.status)}</span><small>Buy ${b?.trades||0} · Sell ${s?.trades||0}</small><strong>${money(Number(b?.value||0)+Number(s?.value||0))}</strong></div>`}).join('')}</div></div></div>`}
async function adminFinale(){const d=await api('/api/final-results'),top=d.rankings||[],winner=top[0];$("#admin").innerHTML=`<div class="finaleControl"><div class="card finaleBanner"><span class="eyebrow">FINALE CONTROL</span><h1>${d.finished?'🏆 EVENT COMPLETE':'🏁 FINALE PREVIEW'}</h1><p>${d.finished?'Final standings are ready for presentation.':'Preview the final standings before Round 6 is complete.'}</p><div class="row"><button class="btn" onclick="togglePresentation(true)">▶ Presentation Mode</button><button class="btn secondary" onclick="togglePresentation(false)">Exit Presentation</button>${winner?`<button class="btn secondary" onclick="playerCard(${winner.id})">Winner Certificate</button>`:''}</div></div>${winner?`<div class="winnerSpotlight"><div class="eyebrow">CURRENT #1</div><div class="trophy">🏆</div><h2>${esc(winner.name)}</h2><div class="winnerAmount">${money(winner.total)}</div><div>${pnl(winner.profit)} · ${esc(winner.playerId)}</div></div>`:''}<div class="card"><div class="sectionHead"><div><span class="eyebrow">FINAL STANDINGS</span><h2>Leaderboard</h2></div><button class="btn secondary tiny" onclick="exportData('leaderboard')">Export Results</button></div><div class="finalLeaderboard">${top.map(x=>`<div class="finalRow"><span class="finalMedal">${x.rank<=3?['🥇','🥈','🥉'][x.rank-1]:x.rank}</span><div><b>${esc(x.name)}</b><small>${esc(x.playerId)}</small></div><strong>${money(x.total)}</strong><span>${pnl(x.profit)}</span><button class="btn secondary tiny" onclick="playerCard(${x.id})">Certificate</button></div>`).join('')}</div></div></div>`}
async function togglePresentation(enabled){try{const d=await api('/api/admin/presentation',{method:'POST',body:JSON.stringify({enabled})});STATE=d.state;toast(enabled?'Presentation mode ON':'Presentation mode OFF');}catch(e){toast(e.message)}}
async function playerCard(id){try{const d=await api('/api/admin/player/'+id+'/card');const w=window.open('','_blank','width=900,height=700');if(!w)return toast('Allow popups');w.document.write(`<html><head><title>${esc(d.eventName)} Certificate</title><style>body{font-family:Georgia,serif;background:#07111f;color:#fff;padding:50px}.cert{max-width:800px;margin:auto;border:4px solid #38d9ff;padding:70px;text-align:center;background:#0d1c2e}.rank{font-size:72px;font-weight:900}.name{font-size:48px;margin:20px}.amount{font-size:32px}.id{margin-top:30px;font-family:monospace}@media print{body{background:#fff;color:#000}.cert{color:#000;border-color:#000}button{display:none}}</style></head><body><div class="cert"><div>${esc(d.eventName)}</div><h1>PORTFOLIO MANAGEMENT CHALLENGE</h1><div>FINAL RANK</div><div class="rank">#${d.player.rank}</div><div class="name">${esc(d.player.name)}</div><div class="amount">${money(d.player.total)}</div><div>${pnl(d.player.profit)} · ${d.player.tradeCount} trades</div><div class="id">${esc(d.player.playerId)}</div><button onclick="print()">Print / Save PDF</button></div></body></html>`);w.document.close()}catch(e){toast(e.message)}}
async function playerQR(id){try{const d=await api('/api/admin/player/'+id+'/qr');const w=window.open('','_blank','width=520,height=650');if(!w)return toast('Allow popups');w.document.write(`<html><head><title>${esc(d.playerId)} QR</title><style>body{font-family:Arial;text-align:center;padding:35px}.card{max-width:420px;margin:auto;border:1px solid #ddd;padding:30px;border-radius:18px}img{width:320px;max-width:100%}</style></head><body><div class="card"><h1>STOCK WARS</h1><h2>${esc(d.playerId)}</h2><p>${esc(d.name)} · @${esc(d.username)}</p><img src="${d.dataUrl}"><p>Scan to open the player login page.</p><button onclick="print()">Print</button></div></body></html>`);w.document.close()}catch(e){toast(e.message)}}
async function adminRounds(){
  const d=await api('/api/admin/news-engine');
  $('#admin').innerHTML=`<div class="grid">
    <div class="card c12"><div class="sectionHead"><div><span class="eyebrow">AUTONOMOUS MARKET ENGINE</span><h2>News → Price → Portfolio</h2></div><span class="pill live">AUTO ${d.autoNews?'ON':'OFF'}</span></div>
      <div class="notice">Each round generates its own simulated financial news and impact map. Players see the news during the briefing; prices are updated atomically when trading ends. No manual news or price-impact entry is required.</div>
      <div class="causalGrid">${d.rounds.map(r=>`<div class="causalCard"><div class="row"><b>ROUND ${r.id}</b>${pill(r.status)}</div><h3>${r.news_title?esc(r.news_title):'Not generated yet'}</h3><p>${r.news_body?esc(r.news_body):'Start this round to generate the scenario.'}</p>${r.category?`<div class="causalMeta"><span>${esc(r.category)}</span><span>${esc(r.sentiment)}</span><span>${esc(r.scope)}${r.target_sector?' · '+esc(r.target_sector):''}</span><b class="${Number(r.impact_pct)>=0?'green':'red'}">Model ${Number(r.impact_pct)>=0?'+':''}${Number(r.impact_pct).toFixed(2)}%</b></div>`:''}</div>`).join('')}</div>
    </div>
    <div class="card c12"><div class="sectionHead"><div><span class="eyebrow">PRICE AUDIT TRAIL</span><h2>News Impact Results</h2></div><span class="muted">Committed server-side after each round</span></div>
      <div class="scroll"><table><thead><tr><th>Round</th><th>Stock</th><th>Sector</th><th>Before</th><th>Impact</th><th>After</th><th>Timestamp</th></tr></thead><tbody>${d.causal.map(x=>`<tr><td>R${x.round_id}</td><td><b>${esc(x.symbol)}</b></td><td>${esc(x.sector)}</td><td>${money(x.old_price)}</td><td class="${Number(x.impact_pct)>=0?'green':'red'}">${Number(x.impact_pct)>=0?'+':''}${Number(x.impact_pct).toFixed(2)}%</td><td>${money(x.new_price)}</td><td>${esc(x.created_at)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No price events yet.</td></tr>'}</tbody></table></div>
    </div>
  </div>`;
}
async function saveNews(id){try{await api('/api/admin/news',{method:'POST',body:JSON.stringify({roundId:id,title:$('#title'+id).value,body:$('#body'+id).value,note:$('#note'+id).value})});toast('News saved')}catch(e){toast(e.message)}}
async function adminImpacts(){const stocks=await api('/api/admin/stocks'),rows=await api('/api/admin/impacts');const m={};rows.forEach(x=>m[x.round_id+'-'+x.stock_id]=x.impact_pct);$('#admin').innerHTML=`<div class="card"><div class="sectionHead"><div><span class="eyebrow">SCENARIO ENGINE</span><h2>Price Impact Matrix</h2></div><span class="muted">Host only</span></div><div class="scroll"><table><thead><tr><th>Stock</th><th>Sector</th>${[1,2,3,4,5,6].map(r=>`<th>R${r}</th>`).join('')}<th></th></tr></thead><tbody>${stocks.map(s=>`<tr><td><b>${esc(s.symbol)}</b></td><td>${esc(s.sector)}</td>${[1,2,3,4,5,6].map(r=>`<td><input style="width:72px" type="number" step="0.1" id="i${r}-${s.id}" value="${m[r+'-'+s.id]??0}"></td>`).join('')}<td><button class="btn tiny" onclick="saveImp(${s.id})">Save</button></td></tr>`).join('')}</tbody></table></div></div>`}
async function saveImp(id){try{for(let r=1;r<=6;r++)await api('/api/admin/impact',{method:'POST',body:JSON.stringify({roundId:r,stockId:id,impactPct:Number($('#i'+r+'-'+id).value)})});toast('Impacts saved')}catch(e){toast(e.message)}}
Object.assign(window,{trade:submitOrder,openStock,openOrder,submitOrder,closeModal,adminPage,adminPlayers,viewPlayer,saveNews,saveImp,startNext,lockRound,pauseEvent,resetEvent,adminAudit,adminAnalytics,adminFinale,togglePresentation,playerCard,playerQR,finalResultsPage,adminOperations,toggleRegistration,sendBroadcast,clearBroadcast,downloadEventExport,togglePlayerStatus,setCostBasis,sortHoldings,openTransactions,downloadTransactions,reviewOrder,updateOrderEstimate,openSector,toggleMarket,toggleHoldings});boot();
