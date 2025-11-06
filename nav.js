// nav.js — shared navigation & small UI helpers for SpinX pages
(() => {
  // Elements might not exist on some pages; defensive grabbing.
  const hamburger = document.getElementById('hamburger');
  const menu = document.getElementById('menu');
  const soundToggle = document.getElementById('sound-toggle');
  const homeLinks = document.querySelectorAll('.menu-link.home-link');
  const registerLinks = document.querySelectorAll('.menu-link.register-link');
  const loginLinks = document.querySelectorAll('.menu-link.login-link');
  const withdrawLinks = document.querySelectorAll('.menu-link.withdraw-link');

  // Toggle menu
  if (hamburger && menu) {
    hamburger.addEventListener('click', () => menu.classList.toggle('hidden'));
    // close on outside click
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !hamburger.contains(e.target))
        menu.classList.add('hidden');
    });
  }

  // Sound icon persistent state (localStorage)
  const soundState = () => localStorage.getItem('spinx_sound') === '1';
  if (soundToggle) {
    soundToggle.textContent = soundState() ? '🔈' : '🔊';
    soundToggle.addEventListener('click', () => {
      const on = !soundState();
      localStorage.setItem('spinx_sound', on ? '1' : '0');
      soundToggle.textContent = on ? '🔈' : '🔊';
    });
  }

  // Determine correct path depth for all navigation
  const depth = window.location.pathname.includes('/backend/') ? '../' : '';

  // Home link — always routes correctly
  if (homeLinks && homeLinks.length) {
    homeLinks.forEach(a => a.setAttribute('href', `${depth}index.html`));
  }

  // Register / Login / Withdraw links — resolve to backend pages
  if (registerLinks && registerLinks.length) {
    registerLinks.forEach(a => a.setAttribute('href', `${depth}backend/register.html`));
  }
  if (loginLinks && loginLinks.length) {
    loginLinks.forEach(a => a.setAttribute('href', `${depth}backend/login.html`));
  }
  if (withdrawLinks && withdrawLinks.length) {
    withdrawLinks.forEach(a => a.setAttribute('href', `${depth}backend/withdraw.html`));
  }

  // Small helper to show transient toasts (non-blocking)
  window.spinxt = window.spinxt || {};
  window.spinxt.toast = (msg, ms = 1600) => {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.position = 'fixed';
    t.style.left = '50%';
    t.style.bottom = '36px';
    t.style.transform = 'translateX(-50%)';
    t.style.background = 'rgba(0,0,0,0.6)';
    t.style.color = '#fff';
    t.style.padding = '8px 12px';
    t.style.borderRadius = '8px';
    t.style.zIndex = 9999;
    t.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  };
})();