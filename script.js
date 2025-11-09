/* script.js — triple-wheel fruit integration (fixed + enhanced)
   - Triple concentric wheel drawing & animation
   - Weighted outcome selection
   - Betting, auto-play, free spins, sounds
   - Round flow: idle -> betting window -> resolve -> post-bet slow spin -> next round
   - History + winners feed
   - Responsive canvas + footer updates
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
const footerBalanceEl = document.getElementById('footer-balance');
const footerLastWinEl = document.getElementById('footer-last-win');

// Responsive canvas
function resizeCanvas(){
  canvas.width = canvas.clientWidth || 600;
  canvas.height = canvas.clientHeight || 600;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/***** Persistent state *****/
let wallet = Number(localStorage.getItem('spinx_wallet')) || Number(localStorage.getItem('spinxBalance')) || 20000;
let freeSpins = Number(localStorage.getItem('spinx_free')) || 0;
let history = JSON.parse(localStorage.getItem('spinx_history')) || [];
let autoMode = localStorage.getItem('spinx_auto') === '1';
let soundOn = localStorage.getItem('spinx_sound') === '1';
let lastWin = 0;

if (walletEl) walletEl.textContent = wallet.toFixed(2);
if (freeSpinsEl) freeSpinsEl.textContent = freeSpins;
if (autoStatusEl) autoStatusEl.textContent = autoMode ? 'On' : 'Off';
if (footerBalanceEl) footerBalanceEl.textContent = wallet.toFixed(2);
if (footerLastWinEl) footerLastWinEl.textContent = lastWin;

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

/***** Storage helpers *****/
function saveState(){
  localStorage.setItem('spinx_wallet', String(wallet));
  localStorage.setItem('spinxBalance', String(wallet));
  localStorage.setItem('spinx_free', String(freeSpins));
  localStorage.setItem('spinx_history', JSON.stringify(history.slice(0, config.maxHistory)));
  localStorage.setItem('spinx_auto', autoMode ? '1' : '0');
  localStorage.setItem('spinx_sound', soundOn ? '1' : '0');
}

/***** Sounds (tiny oscillator) *****/
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

  ctx.beginPath();
  ctx.arc(cx, cy, outerRingRadius + 10, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fill();

  drawRing(outerRingRadius, outerRot, 0);
  drawRing(midRingRadius, midRot, 1);
  drawRing(innerRingRadius, innerRot, 2);

  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI*2);
  ctx.fillStyle = '#001';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,240,255,0.12)';
  ctx.stroke();

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
  const pool = [];
  segments.forEach((s, idx) => {
    const weight = Math.max(0, s.baseWeight);
    for(let i=0;i<weight;i++) pool.push(idx);
  });
  return pool;
}
const weightedPool = buildWeightedPool();

function pickSegmentIndex(){
  if(weightedPool.length === 0) return Math.floor(Math.random() * segments.length);
  return weightedPool[Math.floor(Math.random() * weightedPool.length)];
}

/***** Compute rotation helpers *****/
function computeRotationToAlignFruit(fruitIndex){
  const sliceCenterDeg = sliceDeg * fruitIndex + sliceDeg/2;
  let needed = (90 - sliceCenterDeg) % 360;
  if(needed < 0) needed += 360;
  return needed;
}

/***** Animate triple spin to target fruit *****/
function animateTripleSpinTo(targetFruitIndex, callback){
  const targetOuter = computeRotationToAlignFruit(targetFruitIndex) + 360*(2+Math.random()*2);
  const targetMid = computeRotationToAlignFruit(targetFruitIndex) + 360*(3+Math.random()*2);
  const targetInner = computeRotationToAlignFruit(targetFruitIndex) + 360*(4+Math.random()*2);

  const startOuter = rotOuter % 360;
  const startMid = rotMid % 360;
  const startInner = rotInner % 360;

  const duration = 2500 + Math.floor(Math.random()*600);
  const startTime = performance.now();

  playSound('spin');

  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

  function frame(now){
    const t = Math.min(1, (now - startTime)/duration);
    const eased = easeOutCubic(t);
    rotOuter = startOuter + (targetOuter - startOuter)*eased;
    rotMid = startMid + (targetMid - startMid)*eased;
    rotInner = startInner + (targetInner - startInner)*eased;

    drawTripleWheel(rotOuter % 360, rotMid % 360, rotInner % 360);

    if(t < 1) requestAnimationFrame(frame);
    else{
      playSound('win');
      rotOuter = (rotOuter%360 + 360)%360;
      rotMid = (rotMid%360 + 360)%360;
      rotInner = (rotInner%360 + 360)%360;
      if(typeof callback==='function') callback();
    }
  }
  requestAnimationFrame(frame);
}

/***** Idle spin helpers *****/
function startIdleSpin(){
  stopIdleSpin();
  idleSpinInterval = setInterval(()=>{
    rotOuter += config.idleSpinSpeed;
    rotMid -= config.idleSpinSpeed*0.6;
    rotInner += config.idleSpinSpeed*0.9;
    drawTripleWheel(rotOuter % 360, rotMid % 360, rotInner % 360);
  }, 40);
}
function stopIdleSpin(){ if(idleSpinInterval){ clearInterval(idleSpinInterval); idleSpinInterval=null; } }
/***** ROUND FLOW & COUNTDOWN *****/
function startRoundCountdown(){
  roundCountdown = config.betWindow;
  acceptingBets = true;
  if(countdownEl) countdownEl.textContent = roundCountdown;

  if(roundTimer) clearInterval(roundTimer);
  roundTimer = setInterval(()=>{
    roundCountdown--;
    if(countdownEl) countdownEl.textContent = roundCountdown;

    if(roundCountdown <= 0){
      clearInterval(roundTimer);
      acceptingBets = false;
      handleRoundResult();
    }
  }, 1000);
}

/***** BETTING HANDLER *****/
function placeBetManual(){
  if(!acceptingBets) return false;

  let stake = parseFloat(stakeInput.value);
  if(isNaN(stake) || stake < config.minStake) { alert('Enter a valid stake'); return false; }
  if(stake > wallet) { alert('Insufficient balance'); return false; }

  if(freeCheckbox.checked && freeSpins > 0){
    freeSpins--;
    stake = 0;
    if(freeSpinsEl) freeSpinsEl.textContent = freeSpins;
  } else if(freeCheckbox.checked && freeSpins <= 0){
    alert('No free spins available');
    return false;
  }

  wallet -= stake;
  saveState();
  if(walletEl) walletEl.textContent = wallet.toFixed(2);
  if(footerBalanceEl) footerBalanceEl.textContent = wallet.toFixed(2);

  pendingBet = stake;
  return true;
}

/***** HANDLE ROUND RESULT *****/
function handleRoundResult(){
  stopIdleSpin();
  const winningIndex = pickSegmentIndex();
  animateTripleSpinTo(winningIndex, ()=>{
    const segment = segments[winningIndex];
    let winAmount = segment.value;

    if(segment.gift === 'Free Spin'){
      freeSpins++;
      if(freeSpinsEl) freeSpinsEl.textContent = freeSpins;
      showModal('Free Spin!', 'You won a free spin!');
      winAmount = 0;
    } else if(segment.gift){
      showModal('Congratulations!', `You won a ${segment.gift}`);
      winAmount = 0;
    } else if(pendingBet && winAmount > 0){
      winAmount += pendingBet;
    }

    wallet += winAmount;
    lastWin = winAmount;
    saveState();
    if(walletEl) walletEl.textContent = wallet.toFixed(2);
    if(footerBalanceEl) footerBalanceEl.textContent = wallet.toFixed(2);
    if(footerLastWinEl) footerLastWinEl.textContent = lastWin;

    if(historyList){
      const li = document.createElement('li');
      li.textContent = `Round: ${new Date().toLocaleTimeString()} — Won: ${winAmount} — ${segment.label}`;
      historyList.prepend(li);
    }

    if(winnersFeed){
      const feedItem = document.createElement('div');
      feedItem.className = 'feed-item';
      feedItem.textContent = `Player won ${segment.label} (${winAmount})`;
      winnersFeed.prepend(feedItem);
      if(winnersFeed.childElementCount > 50) winnersFeed.removeChild(winnersFeed.lastChild);
    }

    pendingBet = null;

    if(autoMode && wallet > 0){
      setTimeout(()=>{
        startRoundCountdown();
        startIdleSpin();
      }, 1500);
    } else {
      startIdleSpin();
      startRoundCountdown();
    }
  });
}

/***** MODAL CONTROL *****/
function showModal(title, body){
  if(modalTitle) modalTitle.textContent = title;
  if(modalBody) modalBody.textContent = body;
  if(modal) modal.style.display = 'block';
}
if(modalOk) modalOk.addEventListener('click', ()=>{ if(modal) modal.style.display='none'; });

/***** AUTO-PLAY TOGGLE *****/
if(autoToggleBtn){
  autoToggleBtn.addEventListener('click', ()=>{
    autoMode = !autoMode;
    localStorage.setItem('spinx_auto', autoMode?'1':'0');
    if(autoStatusEl) autoStatusEl.textContent = autoMode?'On':'Off';
    if(autoMode && acceptingBets && !idleSpinInterval){
      startIdleSpin();
      startRoundCountdown();
    }
  });
}

/***** HAMBURGER MENU *****/
if(hamburgerBtn && menu){
  hamburgerBtn.addEventListener('click', ()=>{
    menu.classList.toggle('open');
  });
}

/***** SOUND TOGGLE *****/
if(soundToggle){
  soundToggle.addEventListener('click', ()=>{
    soundOn = !soundOn;
    localStorage.setItem('spinx_sound', soundOn?'1':'0');
    soundToggle.textContent = soundOn ? 'Sound On' : 'Sound Off';
  });
}

/***** BET BUTTON *****/
if(betBtn){
  betBtn.addEventListener('click', ()=>{
    if(!acceptingBets) return alert('Betting closed for this round.');
    if(placeBetManual()) {
      acceptingBets = false;
      clearInterval(roundTimer);
      handleRoundResult();
    }
  });
}

/***** INITIALIZATION *****/
startIdleSpin();
startRoundCountdown();

/***** QUICK DEBUG *****/
// window.wallet = wallet; window.freeSpins = freeSpins; window.rotOuter = rotOuter;