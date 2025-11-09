/* script.js — triple-wheel fruit integration (completed + updated)
   - Triple concentric wheel drawing & animation
   - Weighted outcome selection
   - Betting, auto-play, free spins, sounds
   - Gold badge tracking with threshold reward
   - Round flow: idle -> betting -> resolve -> post-bet slow spin -> next round
   - History + winners feed
*/

/***** DOM & initial wallet sync *****/
document.addEventListener('DOMContentLoaded', () => {
  const walletBalance = document.getElementById('wallet-balance');
  let balance = parseFloat(localStorage.getItem('spinxBalance')) || 0;
  if (!walletBalance) return;
  walletBalance.textContent = balance.toFixed(2);
  setInterval(() => {
    let updatedBalance = parseFloat(localStorage.getItem('spinxBalance')) || 0;
    walletBalance.textContent = updatedBalance.toFixed(2);
  }, 2000);
});

document.addEventListener('DOMContentLoaded', () => {
  const initialWallet = parseFloat(localStorage.getItem('spinxBalance')) || 0;
  if(walletEl) walletEl.textContent = initialWallet.toFixed(2);
  updateFooter(0); // last win is 0 on load
});


// DOM refs
const canvas = document.getElementById('wheel');
if (!canvas) throw new Error('Missing canvas#wheel element');
const ctx = canvas.getContext('2d');
const betBtn = document.getElementById('bet-btn');
const stakeInput = document.getElementById('stake');
const walletEl = document.getElementById('wallet-balance');
const countdownEl = document.getElementById('countdown');
const freeCheckbox = document.getElementById('use-free');
const freeSpinsEl = document.getElementById('free-spins');
const autoToggleBtn = document.getElementById('auto-toggle');
const autoStatusEl = document.getElementById('auto-status');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalOk = document.getElementById('modal-ok');
const winnersFeed = document.getElementById('winners-feed');
const historyList = document.getElementById('history');
const hamburgerBtn = document.getElementById('hamburger');
const menu = document.getElementById('menu');
const soundToggle = document.getElementById('sound-toggle');
const badgeCountEl = document.getElementById('gold-badge-count');
const badgeThresholdEl = document.getElementById('gold-badge-threshold');
const footerBalance = document.getElementById('footer-balance');
const footerLastWin = document.getElementById('footer-last-win');

canvas.width = canvas.clientWidth || 600;
canvas.height = canvas.clientHeight || 600;

/***** Persistent state *****/
let wallet = Number(localStorage.getItem('spinx_wallet')) || Number(localStorage.getItem('spinxBalance')) || 20000;
let freeSpins = Number(localStorage.getItem('spinx_free')) || 1;
let goldBadgeTotal = Number(localStorage.getItem('spinx_gold')) || 250;
let history = JSON.parse(localStorage.getItem('spinx_history')) || [];
let autoMode = localStorage.getItem('spinx_auto') === '1';
let soundOn = localStorage.getItem('spinx_sound') === '1';

if (walletEl) walletEl.textContent = wallet;
if (freeSpinsEl) freeSpinsEl.textContent = freeSpins;
if (autoStatusEl) autoStatusEl.textContent = autoMode ? 'On' : 'Off';
if(soundToggle) soundToggle.textContent = soundOn ? '🔈' : '🔊';

/***** Config & wheel basics *****/
const config = {
  houseEdge: 0.30,
  betWindow: 5,
  idleSpinSpeed: 0.6,
  maxHistory: 2000,
  minStake: 1,
  maxAutoAttempts: 1000,
  goldBadgeValue: 5 // threshold to win free spin
};

const fruits = [
  { name: '🍉 Watermelon', value: 300 },
  { name: '🍊 Orange',    value: 150 },
  { name: '🍋 Lemon',     value: 0   },
  { name: '🍇 Grapes',    value: 1000 },
  { name: '🍎 Apple',     value: 50  },
  { name: '🍒 Cherry',    value: 0   }
];

const segments = [
  { label: 'Try Again', value: 0, gift: null, baseWeight: 12 },
  { label: 'KSh 50', value: 50, gift: null, baseWeight: 9 },
  { label: 'Free Spin', value: 0, gift: 'Free Spin', baseWeight: 4 },
  { label: 'KSh 1000', value: 1000, gift: null, baseWeight: 6 },
  { label: 'Sticker', value: 0, gift: 'Sticker Pack', baseWeight: 3 },
  { label: 'KSh 250', value: 250, gift: null, baseWeight: 5 },
  { label: 'Try Again', value: 0, gift: null, baseWeight: 12 },
  { label: 'KSh 150', value: 150, gift: null, baseWeight: 7 },
  { label: 'Gold Badge', value: 0, gift: 'Gold Badge', baseWeight: 2 },
  { label: 'KSh 300', value: 300, gift: null, baseWeight: 5 }
];

const cx = canvas.width / 2;
const cy = canvas.height / 2;
const outerRadius = Math.min(cx, cy) - 6;
const ringGap = 36;
const outerRingRadius = outerRadius;
const midRingRadius = outerRingRadius - ringGap;
const innerRingRadius = midRingRadius - ringGap;
const fruitCount = fruits.length;
const sliceDeg = 360 / fruitCount;

let rotOuter = 0;
let rotMid = 0;
let rotInner = 0;

let acceptingBets = true;
let pendingBet = null;
let idleSpinInterval = null;
let roundTimer = null;
let roundCountdown = config.betWindow;

/***** storage helpers *****/
function saveState(){
  localStorage.setItem('spinx_wallet', String(wallet));
  localStorage.setItem('spinxBalance', String(wallet));
  localStorage.setItem('spinx_free', String(freeSpins));
  localStorage.setItem('spinx_gold', String(goldBadgeTotal));
  localStorage.setItem('spinx_history', JSON.stringify(history.slice(0, config.maxHistory)));
  localStorage.setItem('spinx_auto', autoMode ? '1' : '0');
  localStorage.setItem('spinx_sound', soundOn ? '1' : '0');
}

function updateFooter(winAmount = 0){
  if(footerBalance) footerBalance.textContent = `₵${wallet.toFixed(2)}`;
  if(footerLastWin) footerLastWin.textContent = `₵${winAmount.toFixed(2)}`;
}


/***** sounds *****/
function playSound(kind){
  if(!soundOn) return;
  try{
    const A = new (window.AudioContext || window.webkitAudioContext)();
    const o = A.createOscillator(), g = A.createGain();
    o.type = 'sine';
    o.frequency.value = kind==='win'?880: kind==='spin'?440:240;
    g.gain.value = 0.02;
    o.connect(g); g.connect(A.destination);
    o.start(); setTimeout(()=>{o.stop();A.close();},120);
  }catch(e){}
}
function degToRad(d){ return d*Math.PI/180; }

/***** DRAW TRIPLE WHEEL *****/
function drawRing(radius, rotationDeg, ringIndex){
  const startOffset = -90;
  for(let i=0;i<fruitCount;i++){
    const start = degToRad(startOffset + sliceDeg * i + rotationDeg);
    const end = degToRad(startOffset + sliceDeg * (i + 1) + rotationDeg);
    const neon = ringIndex===0?(i%2===0?'rgba(0,240,255,0.95)':'rgba(0,255,153,0.95)'):
                ringIndex===1?(i%2===0?'rgba(255,140,60,0.9)':'rgba(255,200,80,0.9)'):
                (i%2===0?'rgba(200,120,255,0.9)':'rgba(180,200,255,0.9)');
    const grad = ctx.createLinearGradient(cx + Math.cos((start+end)/2)*radius, cy + Math.sin((start+end)/2)*radius, cx, cy);
    grad.addColorStop(0,'rgba(3,6,10,0.02)');
    grad.addColorStop(1,neon);

    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,radius,start,end);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.stroke();

    const midAngle = (start+end)/2;
    ctx.save();
    ctx.translate(cx + Math.cos(midAngle)*(radius-20), cy + Math.sin(midAngle)*(radius-20));
    ctx.rotate(midAngle + Math.PI/2);
    ctx.textAlign = 'center';
    ctx.font = '20px Inter, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(fruits[i].name,0,0);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx,cy,radius+6,0,Math.PI*2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,240,255,0.06)';
  ctx.stroke();
}

function drawTripleWheel(outerRot, midRot, innerRot){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Outer shadow/background
  ctx.beginPath();
  ctx.arc(cx,cy,outerRingRadius+10,0,Math.PI*2);
  ctx.fillStyle='rgba(0,0,0,0.2)';
  ctx.fill();

  drawRing(outerRingRadius, outerRot,0);
  drawRing(midRingRadius, midRot,1);
  drawRing(innerRingRadius, innerRot,2);

  // center button
  ctx.beginPath();
  ctx.arc(cx,cy,28,0,Math.PI*2);
  ctx.fillStyle='#001';
  ctx.lineWidth=2;
  ctx.strokeStyle='rgba(0,240,255,0.12)';
  ctx.stroke();

  // pointer at top
  ctx.beginPath();
  ctx.moveTo(cx-12,cy-outerRingRadius-4);
  ctx.lineTo(cx+12,cy-outerRingRadius-4);
  ctx.lineTo(cx,cy-outerRingRadius+14);
  ctx.closePath();
  ctx.fillStyle='#fff';
  ctx.fill();
}

/***** Weighted pool helpers *****/
function buildWeightedPool(){
  const pool=[];
  segments.forEach((s,idx)=>{
    const weight = Math.max(0,s.baseWeight);
    for(let i=0;i<weight;i++) pool.push(idx);
  });
  return pool;
}
const weightedPool = buildWeightedPool();
function pickSegmentIndex(){
  if(weightedPool.length===0) return Math.floor(Math.random()*segments.length);
  return weightedPool[Math.floor(Math.random()*weightedPool.length)];
}

/***** Compute rotation helpers *****/
function computeRotationToAlignFruit(fruitIndex){
  const sliceCenterDeg = sliceDeg*fruitIndex + sliceDeg/2;
  let needed = (90 - sliceCenterDeg)%360;
  if(needed<0) needed+=360;
  return needed;
}

/***** Animate Triple Spin *****/
function animateTripleSpinTo(targetFruitIndex, callback){
  const targetOuter = computeRotationToAlignFruit(targetFruitIndex)+360*(2+Math.random()*2);
  const targetMid = computeRotationToAlignFruit(targetFruitIndex)+360*(3+Math.random()*2);
  const targetInner = computeRotationToAlignFruit(targetFruitIndex)+360*(4+Math.random()*2);

  const startOuter = rotOuter%360;
  const startMid = rotMid%360;
  const startInner = rotInner%360;

  const duration = 2500 + Math.floor(Math.random()*600);
  const startTime = performance.now();
  playSound('spin');

  function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }

  function frame(now){
    const t = Math.min(1,(now-startTime)/duration);
    const eased = easeOutCubic(t);
    rotOuter = startOuter + (targetOuter-startOuter)*eased;
    rotMid = startMid + (targetMid-startMid)*eased;
    rotInner = startInner + (targetInner-startInner)*eased;

    drawTripleWheel(rotOuter%360, rotMid%360, rotInner%360);

    if(t<1) requestAnimationFrame(frame);
    else {
      playSound('win');
      rotOuter=((rotOuter%360)+360)%360;
      rotMid=((rotMid%360)+360)%360;
      rotInner=((rotInner%360)+360)%360;
      if(callback) callback();
    }
  }
  requestAnimationFrame(frame);
}

/***** Idle spin *****/
function startIdleSpin(){
  stopIdleSpin();
  idleSpinInterval=setInterval(()=>{
    rotOuter+=config.idleSpinSpeed;
    rotMid-=config.idleSpinSpeed*0.6;
    rotInner+=config.idleSpinSpeed*0.9;
    drawTripleWheel(rotOuter%360, rotMid%360, rotInner%360);
  },40);
}
function stopIdleSpin(){ if(idleSpinInterval){ clearInterval(idleSpinInterval); idleSpinInterval=null; } }
/***** BET HANDLING & ROUND FLOW *****/
function placeBetManual(){
  if(!acceptingBets) return false;

  const stake = parseFloat(stakeInput.value) || 0;
  if(freeCheckbox.checked && freeSpins>0){
    pendingBet = {stake:0, free:true};
    freeSpins--;
    freeSpinsEl.textContent = freeSpins;
    saveState();
  } else if(stake>0 && stake<=wallet){
    pendingBet={stake, free:false};
    wallet-=stake;
    walletEl.textContent=wallet;
    saveState();
  } else {
    alert('Invalid stake or insufficient balance.');
    return false;
  }

  acceptingBets=false;
  return true;
}

betBtn.addEventListener('click',()=>{
  if(!acceptingBets) return alert('Betting closed for this round.');
  if(!placeBetManual()) return;
  triggerRound();
});

/***** AUTO-PLAY *****/
let autoCount=0;
autoToggleBtn.addEventListener('click',()=>{
  autoMode=!autoMode;
  localStorage.setItem('spinx_auto',autoMode?'1':'0');
  autoStatusEl.textContent=autoMode?'On':'Off';
  if(autoMode) autoPlayRound();
});

function autoPlayRound(){
  if(!autoMode) return;
  if(autoCount>=config.maxAutoAttempts) { autoMode=false; autoStatusEl.textContent='Off'; return; }
  autoCount++;
  if(wallet>0 || freeSpins>0){
    placeBetManual();
    triggerRound(()=>setTimeout(autoPlayRound,2000));
  } else {
    autoMode=false;
    autoStatusEl.textContent='Off';
  }
}

/***** ROUND TRIGGER *****/
function triggerRound(callback){
  stopIdleSpin();
  const selectedIdx = pickSegmentIndex();
  animateTripleSpinTo(selectedIdx,()=>{
    resolveRound(selectedIdx);
    if(callback) callback();
    else startIdleSpin();
  });
}

/***** ROUND RESOLUTION *****/
function resolveRound(fruitIdx){
  const segment = segments[fruitIdx];
  let won = segment.value;
  let message='';

  if(pendingBet?.free) won = segment.value;
  else if(pendingBet?.stake) won *= pendingBet.stake;

  wallet += won;
  walletEl.textContent = wallet;

  // Gold badge tracking
  if(segment.gift==='Gold Badge'){
    goldBadgeTotal++;
    badgeCountEl.textContent = goldBadgeTotal;
    if(goldBadgeTotal>=config.goldBadgeValue){
      goldBadgeTotal=0;
      freeSpins++;
      freeSpinsEl.textContent=freeSpins;
      showModal('Congratulations!', `You've won a free spin for reaching ${config.goldBadgeValue} Gold Badges!`);
    }
  }

  // Free spin gift
  if(segment.gift==='Free Spin'){
    freeSpins++;
    freeSpinsEl.textContent = freeSpins;
    message+='🎁 Free spin awarded! ';
  }

  // Regular gifts
  if(segment.gift && segment.gift!=='Free Spin' && segment.gift!=='Gold Badge'){
    message+=`🎉 You received: ${segment.gift}! `;
  }

  if(won>0) message+=`You won KSh ${won}!`;
  else message+='Try again next time!';

  // winners feed
  pushWinnersFeed(`Player won ${segment.gift??won} at ${new Date().toLocaleTimeString()}`);

  // history
  history.unshift({time:Date.now(), segment:segment.label, win:won, gift:segment.gift??null});
  saveState();

  pendingBet=null;
  acceptingBets=true;
}

/***** MODAL HELPER *****/
function showModal(title,msg){
  modalTitle.textContent=title;
  modalBody.textContent=msg;
  modal.style.display='block';
}
modalOk.addEventListener('click',()=>{ modal.style.display='none'; });

/***** WINNERS FEED *****/
function pushWinnersFeed(text){
  if(!winnersFeed) return;
  const div = document.createElement('div');
  div.textContent = text;
  winnersFeed.prepend(div);
  if(winnersFeed.children.length>config.maxHistory){
    winnersFeed.removeChild(winnersFeed.lastChild);
  }
}

/***** HISTORY DISPLAY (optional) *****/
function renderHistory(){
  if(!historyList) return;
  historyList.innerHTML='';
  history.forEach(h=>{
    const li = document.createElement('li');
    li.textContent=`[${new Date(h.time).toLocaleTimeString()}] ${h.segment} - Win: ${h.win}${h.gift? ' Gift: '+h.gift:''}`;
    historyList.appendChild(li);
  });
}
setInterval(renderHistory,2000);

/***** ROUND COUNTDOWN *****/
function startRoundCountdown(){
  roundCountdown=config.betWindow;
  countdownEl.textContent=roundCountdown;
  roundTimer=setInterval(()=>{
    roundCountdown--;
    countdownEl.textContent=roundCountdown;
    if(roundCountdown<=0){
      clearInterval(roundTimer);
      if(acceptingBets) triggerRound();
    }
  },1000);
}

/***** HAMBURGER MENU & SOUND TOGGLE *****/
if(hamburgerBtn){
  hamburgerBtn.addEventListener('click',()=>menu.classList.toggle('show'));
}
if(soundToggle){
  soundToggle.addEventListener('click',()=>{
    soundOn=!soundOn;
    localStorage.setItem('spinx_sound',soundOn?'1':'0');
    soundToggle.textContent = soundOn?'🔈':'🔊';
  });
}

/***** INITIALIZATION *****/
drawTripleWheel(rotOuter,rotMid,rotInner);
startIdleSpin();
startRoundCountdown();