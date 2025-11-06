/* script.js — triple-wheel fruit integration (completed)
   - Triple concentric wheel drawing & animation
   - Weighted outcome selection
   - Betting, auto-play, free spins, sounds
   - Round flow: idle -> betting window -> resolve -> post-bet slow spin -> next round
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




canvas.width = canvas.clientWidth || 600;
canvas.height = canvas.clientHeight || 600;

/***** Persistent state *****/
let wallet = Number(localStorage.getItem('spinx_wallet')) || Number(localStorage.getItem('spinxBalance')) || 20000;
let freeSpins = Number(localStorage.getItem('spinx_free')) || 0;
let history = JSON.parse(localStorage.getItem('spinx_history')) || [];
let autoMode = localStorage.getItem('spinx_auto') === '1';
let soundOn = localStorage.getItem('spinx_sound') === '1';

if (walletEl) walletEl.textContent = wallet;
if (freeSpinsEl) freeSpinsEl.textContent = freeSpins;
if (autoStatusEl) autoStatusEl.textContent = autoMode ? 'On' : 'Off';
if (soundToggle) soundToggle.textContent = soundOn ? '🔈' : '🔊';

/***** Config & wheel basics *****/
const config = {
  houseEdge: 0.30,
  betWindow: 5,
  idleSpinSpeed: 0.6,
  maxHistory: 2000,
  minStake: 1,
  maxAutoAttempts: 1000
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
  localStorage.setItem('spinx_history', JSON.stringify(history.slice(0, config.maxHistory)));
  localStorage.setItem('spinx_auto', autoMode ? '1' : '0');
  localStorage.setItem('spinx_sound', soundOn ? '1' : '0');
}

/***** sounds (tiny oscillator) *****/
function playSound(kind){
  if(!soundOn) return;
  try{
    const A = new (window.AudioContext || window.webkitAudioContext)();
    const o = A.createOscillator(), g = A.createGain();
    o.type = 'sine';
    o.frequency.value = kind === 'win' ? 880 : kind === 'spin' ? 440 : 240;
    g.gain.value = 0.02;
    o.connect(g); g.connect(A.destination);
    o.start(); setTimeout(()=>{ o.stop(); A.close(); }, 120);
  }catch(e){}
}
function degToRad(d){ return d * Math.PI / 180; }

/***** DRAW TRIPLE WHEEL *****/
function drawRing(radius, rotationDeg, ringIndex){
  const startOffset = -90;
  for(let i=0;i<fruitCount;i++){
    const start = degToRad(startOffset + sliceDeg * i + rotationDeg);
    const end = degToRad(startOffset + sliceDeg * (i + 1) + rotationDeg);
    const neon = ringIndex === 0 ? (i%2===0 ? 'rgba(0,240,255,0.95)' : 'rgba(0,255,153,0.95)')
                                : ringIndex === 1 ? (i%2===0 ? 'rgba(255,140,60,0.9)' : 'rgba(255,200,80,0.9)')
                                                 : (i%2===0 ? 'rgba(200,120,255,0.9)' : 'rgba(180,200,255,0.9)');
    const grad = ctx.createLinearGradient(cx + Math.cos((start+end)/2)*radius, cy + Math.sin((start+end)/2)*radius, cx, cy);
    grad.addColorStop(0, 'rgba(3,6,10,0.02)');
    grad.addColorStop(1, neon);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.stroke();

    const midAngle = (start + end) / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(midAngle) * (radius - 20), cy + Math.sin(midAngle) * (radius - 20));
    ctx.rotate(midAngle + Math.PI/2);
    ctx.textAlign = 'center';
    ctx.font = '20px Inter, sans-serif';
    ctx.fillStyle = '#fff';
    const fruit = fruits[i];
    ctx.fillText(fruit.name, 0, 0);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 6, 0, Math.PI*2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,240,255,0.06)';
  ctx.stroke();
}

function drawTripleWheel(outerRot, midRot, innerRot){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Outer shadow/background
  ctx.beginPath();
  ctx.arc(cx, cy, outerRingRadius + 10, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fill();

  drawRing(outerRingRadius, outerRot, 0);
  drawRing(midRingRadius, midRot, 1);
  drawRing(innerRingRadius, innerRot, 2);

  // center button
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI*2);
  ctx.fillStyle = '#001';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,240,255,0.12)';
  ctx.stroke();

  // pointer at top
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy - outerRingRadius - 4);
  ctx.lineTo(cx + 12, cy - outerRingRadius - 4);
  ctx.lineTo(cx, cy - outerRingRadius + 14);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
}

/***** Weighted pool helpers *****/
function buildWeightedPool(){
  // adjust weights based on houseEdge or other logic if necessary
  const pool = [];
  segments.forEach((s, idx) => {
    const weight = Math.max(0, s.baseWeight);
    for(let i=0;i<weight;i++) pool.push(idx);
  });
  return pool;
}
const weightedPool = buildWeightedPool();

function pickSegmentIndex(){
  // return a segment index using the weighted pool
  if(weightedPool.length === 0) return Math.floor(Math.random() * segments.length);
  const idx = weightedPool[Math.floor(Math.random() * weightedPool.length)];
  return idx;
}

/***** Compute rotation helpers *****/
function computeRotationToAlignFruit(fruitIndex, ringRadius){
  // we want the center of the slice to align with pointer at top (which is -90deg)
  const sliceCenterDeg = sliceDeg * fruitIndex + sliceDeg/2;
  let needed = (90 - sliceCenterDeg) % 360; // because our draw uses startOffset -90
  if(needed < 0) needed += 360;
  return needed;
}

/***** Animation helpers: animateTripleSpinTo *****/
function animateTripleSpinTo(targetFruitIndex, callback){
  // We create different angular targets for outer/mid/inner so the wheels look different but central fruit aligns
  const targetOuter = computeRotationToAlignFruit(targetFruitIndex, outerRingRadius) + 360 * (2 + Math.random()*2);
  const targetMid = computeRotationToAlignFruit(targetFruitIndex, midRingRadius) + 360 * (3 + Math.random()*2);
  const targetInner = computeRotationToAlignFruit(targetFruitIndex, innerRingRadius) + 360 * (4 + Math.random()*2);

  const startOuter = rotOuter % 360;
  const startMid = rotMid % 360;
  const startInner = rotInner % 360;

  const duration = 2500 + Math.floor(Math.random()*600); // ms
  const startTime = performance.now();

  playSound('spin');

  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

  function frame(now){
    const t = Math.min(1, (now - startTime) / duration);
    const eased = easeOutCubic(t);
    rotOuter = startOuter + (targetOuter - startOuter) * eased;
    rotMid = startMid + (targetMid - startMid) * eased;
    rotInner = startInner + (targetInner - startInner) * eased;

    drawTripleWheel(rotOuter % 360, rotMid % 360, rotInner % 360);

    if(t < 1){
      requestAnimationFrame(frame);
    } else {
      playSound('win');
      // normalize rotation angles to [0,360)
      rotOuter = ((rotOuter % 360) + 360) % 360;
      rotMid = ((rotMid % 360) + 360) % 360;
      rotInner = ((rotInner % 360) + 360) % 360;
      if (typeof callback === 'function') callback();
    }
  }
  requestAnimationFrame(frame);
}

/***** Idle spin *****/
function startIdleSpin(){
  stopIdleSpin();
  idleSpinInterval = setInterval(()=>{ 
    rotOuter += config.idleSpinSpeed; 
    rotMid -= config.idleSpinSpeed*0.6; 
    rotInner += config.idleSpinSpeed*0.9; 
    drawTripleWheel(rotOuter % 360, rotMid % 360, rotInner % 360); 
  }, 40);
}
function stopIdleSpin(){ if(idleSpinInterval){ clearInterval(idleSpinInterval); idleSpinInterval = null; } }

/***** NEW: Post-bet slow spin *****/
function startPostBetIdleSpin(){
  stopIdleSpin();
  let elapsed = 0;
  const duration = 3000; // 3 seconds slow spin
  const speedOuter = 0.3, speedMid = 0.2, speedInner = 0.25;

  function frame(){
    elapsed += 40;
    rotOuter += speedOuter;
    rotMid -= speedMid;
    rotInner += speedInner;
    drawTripleWheel(rotOuter % 360, rotMid % 360, rotInner % 360);
    if(elapsed < duration){
      setTimeout(frame, 40);
    } else {
      startRoundCountdown();
    }
  }
  frame();
}

/***** Round flow *****/
function startRoundCountdown(){
  acceptingBets = true;
  roundCountdown = config.betWindow;
  if(countdownEl) countdownEl.textContent = roundCountdown;
  startIdleSpin();

  if(roundTimer) clearInterval(roundTimer);
  if(autoMode) autoPlayIfReady();

  roundTimer = setInterval(()=>{
    roundCountdown--;
    if(countdownEl) countdownEl.textContent = roundCountdown;
    if(roundCountdown <= 0){
      clearInterval(roundTimer);
      roundTimer = null;
      stopIdleSpin();
      acceptingBets = false;
      if(pendingBet){
        resolveRoundWithBet();
      } else {
        decorativeSpinThenNext();
      }
    }
  }, 1000);
}
function decorativeSpinThenNext(){
  const randomFruit = Math.floor(Math.random()*fruitCount);
  animateTripleSpinTo(randomFruit, ()=>{ setTimeout(startRoundCountdown, 900); });
}

/***** Resolve round *****/
function resolveRoundWithBet(){
  if(!pendingBet){ setTimeout(startRoundCountdown, 500); return; }

  // pick a segment from weighted segments, map to fruit index
  const segIndex = pickSegmentIndex();
  // Map segment index onto fruit via modulo — this preserves your original scaffold
  const fruitIndex = segIndex % fruitCount;

  animateTripleSpinTo(fruitIndex, ()=>{
    const chosenFruit = fruits[fruitIndex];
    const seg = segments[segIndex];
    const pseudoChosen = { label: chosenFruit.name, value: chosenFruit.value, gift: seg.gift || null, segValue: seg.value };
    handleRoundResultForFruit(pseudoChosen);
    pendingBet = null;
    // AFTER bet resolves, start slow spin BEFORE next round
    startPostBetIdleSpin();
  });
}

/***** handleRoundResultForFruit *****/
function handleRoundResultForFruit(result){
  // pendingBet structure: { stake: number, useFree: boolean }
  const stake = pendingBet ? Number(pendingBet.stake) : 0;
  const usedFree = pendingBet ? Boolean(pendingBet.useFree) : false;
  let payout = 0;
  let isWin = false;
  let message = '';

  // Determine payout logic:
  // - If result.value > 0 it's a cash prize (we treat seg.value >0 as cash)
  // - If gift exists, treat as win but with no cash unless seg.value >0
  if(result.segValue && result.segValue > 0){
    // scale payout roughly by stake (simple multiplier: seg.value / 50)
    const multiplier = result.segValue / 50;
    payout = Math.round(stake * multiplier);
    isWin = payout > 0;
    message = `You won KSh ${payout}`;
  } else if(result.gift){
    payout = 0;
    isWin = true;
    message = `You won a ${result.gift}`;
  } else {
    payout = 0;
    isWin = false;
    message = 'Try again';
  }

  // Apply free spin consumption or stake loss
  if(usedFree){
    // free spin used, do not deduct stake; if won, maybe add small bonus
    if(isWin && payout > 0){
      wallet += payout;
    } else if(isWin && result.gift){
      // keep as gift
    }
    freeSpins = Math.max(0, freeSpins - 1);
  } else {
    // deduct stake then add payout if any
    wallet -= stake;
    if(isWin && payout > 0) wallet += payout;
  }

  // if result is Free Spin gift, add
  if(result.gift === 'Free Spin'){
    freeSpins += 1;
  }

  // update history + winners feed
  const entry = {
    time: new Date().toISOString(),
    stake, resultLabel: result.label || result.segLabel || result.segValue || result.gift,
    isWin, payout, gift: result.gift || null
  };
  history.unshift(entry);
  if(history.length > config.maxHistory) history.pop();

  // winners feed (only for wins)
  if(isWin){
    pushWinnersFeed(`${entry.time} — ${entry.isWin ? 'WIN' : 'LOSE'} — ${entry.payout || payout} — ${entry.resultLabel || result.label}`);
  }

  // UI updates & persistence
  updateUI();
  saveState();

  // modal display summary
  openModal(isWin ? 'You won!' : 'Round result', `
    <div>
      <p>${message}</p>
      <p>Stake: KSh ${stake}</p>
      <p>Payout: KSh ${payout}</p>
      ${result.gift ? `<p>Gift: ${result.gift}</p>` : ''}
    </div>
  `);
}

/***** Bet & Auto-play handlers *****/
function placeBetManual(){
  if(!acceptingBets) { openModal('Betting Closed', '<p>Betting window closed for this round.</p>'); return false; }
  const stake = Number(stakeInput ? stakeInput.value : 0);
  const useFree = freeCheckbox ? freeCheckbox.checked : false;

  if(useFree && freeSpins <= 0){
    openModal('No free spins', '<p>You have no free spins available.</p>'); return false;
  }

  if(!useFree){
    if(isNaN(stake) || stake < config.minStake){
      openModal('Invalid stake', `<p>Stake must be at least KSh ${config.minStake}.</p>`); return false;
    }
    if(stake > wallet){
      openModal('Insufficient funds', '<p>Your wallet balance is too low.</p>'); return false;
    }
  }

  pendingBet = { stake, useFree };
  // show quick UI acknowledgement
  if(betBtn) betBtn.classList.add('active');
  setTimeout(()=> betBtn && betBtn.classList.remove('active'), 250);

  // If betting when countdown is active - round will be resolved at end of countdown
  return true;
}

function autoPlayIfReady(){
  // attempts to auto place a bet if wallet allows and stake is set
  const stake = Number(stakeInput ? stakeInput.value : 0);
  if((isNaN(stake) || stake < config.minStake) && freeSpins <= 0) return;
  if(autoMode){
    // place bet when a new round starts if not already pending
    if(!pendingBet && acceptingBets){
      if(freeSpins > 0){
        pendingBet = { stake: 0, useFree: true };
        return;
      } else if(wallet >= stake){
        pendingBet = { stake, useFree: false };
        return;
      } else {
        // try smaller stake
        const tryStake = Math.min(wallet, stake);
        if(tryStake >= config.minStake){
          pendingBet = { stake: tryStake, useFree: false };
          return;
        }
      }
    }
  }
}

/***** UI helpers & modal *****/
function updateUI(){
  if(walletEl) walletEl.textContent = wallet.toFixed(2);
  if(freeSpinsEl) freeSpinsEl.textContent = freeSpins;
  if(autoStatusEl) autoStatusEl.textContent = autoMode ? 'On' : 'Off';
  if(historyList){
    historyList.innerHTML = '';
    for(let i=0;i<Math.min(20, history.length); i++){
      const h = history[i];
      const li = document.createElement('li');
      li.textContent = `${new Date(h.time).toLocaleTimeString()} — ${h.isWin ? 'WIN' : 'LOSE'} — stake KSh ${h.stake} — payout ${h.payout || 0} ${h.gift ? `— ${h.gift}` : ''}`;
      historyList.appendChild(li);
    }
  }
}

function updateHistoryUI(){ updateUI(); }

function pushWinnersFeed(text){
  if(!winnersFeed) return;
  const el = document.createElement('div');
  el.className = 'winner';
  el.textContent = text;
  winnersFeed.prepend(el);
  // keep feed length reasonable
  while(winnersFeed.children.length > 30) winnersFeed.removeChild(winnersFeed.lastChild);
}

/***** Modal helpers *****/
function openModal(title, bodyHtml){
  if(!modal) return;
  if(modalTitle) modalTitle.textContent = title || '';
  if(modalBody) modalBody.innerHTML = bodyHtml || '';
  modal.style.display = 'block';
}
function closeModal(){
  if(!modal) return;
  modal.style.display = 'none';
}
if(modalOk) modalOk.addEventListener('click', ()=> closeModal());
if(modal) modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });

/***** UI event wiring *****/
if(betBtn) betBtn.addEventListener('click', ()=> {
  const ok = placeBetManual();
  if(ok) {
    // immediate feedback
    if(!acceptingBets) openModal('Bet placed', '<p>Your bet was registered but betting is closed for this round.</p>');
  }
});

if(autoToggleBtn) autoToggleBtn.addEventListener('click', ()=>{
  autoMode = !autoMode;
  autoStatusEl && (autoStatusEl.textContent = autoMode ? 'On' : 'Off');
  saveState();
});

if(soundToggle) soundToggle.addEventListener('click', ()=> {
  soundOn = !soundOn;
  soundToggle.textContent = soundOn ? '🔈' : '🔊';
  saveState();
});

if(hamburgerBtn) hamburgerBtn.addEventListener('click', ()=> {
  if(menu) menu.classList.toggle('open');
});

/***** Initial draw + start rounds *****/
drawTripleWheel(rotOuter, rotMid, rotInner);
updateUI();
startRoundCountdown();

/***** Safety: cleanup on page hide/unload *****/
window.addEventListener('beforeunload', ()=> {
  stopIdleSpin();
  if(roundTimer) clearInterval(roundTimer);
  saveState();
});

// Expose for debugging in console
window.SpinX = {
  placeBetManual, startRoundCountdown, animateTripleSpinTo, getState: ()=>({ wallet, freeSpins, history, autoMode })
};