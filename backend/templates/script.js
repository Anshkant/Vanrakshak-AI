// script.js - shared logic for splash, login, dashboard

// THEME: load saved theme and apply
(function() {
  const saved = localStorage.getItem('dashboard-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  // set any theme switches on current page
  const themeCheckboxes = document.querySelectorAll('.theme-switch-input');
  themeCheckboxes.forEach(cb => cb.checked = (saved === 'dark'));
  const labels = document.querySelectorAll('.theme-label');
  labels.forEach(l => l.textContent = (saved === 'dark') ? 'Dark' : 'Light');
})();

// Toggle handler (attach to inputs with class 'theme-switch-input')
document.addEventListener('change', (e) => {
  if (!e.target.classList.contains('theme-switch-input')) return;
  const mode = e.target.checked ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('dashboard-theme', mode);
  // update labels if present
  const labels = document.querySelectorAll('.theme-label');
  labels.forEach(l => l.textContent = (mode === 'dark') ? 'Dark' : 'Light');
});

// ----------------- Splash typing & transition -----------------
function runSplashTyping(options) {
  // options: { text: "Qaptiz.ai", typingSpeed: 100, holdAfter: 800, onComplete: fn }
  const el = document.querySelector('#splashTyping');
  if (!el) return;
  const text = options.text || 'Qaptiz.ai';
  const speed = options.typingSpeed || 100;
  let i = 0;
  el.textContent = '';
  el.classList.add('typing');

  const typer = setInterval(() => {
    el.textContent += text[i++];
    if (i >= text.length) {
      clearInterval(typer);
      // remove caret after a short hold and call onComplete after hold
      setTimeout(() => {
        el.classList.remove('typing');
        if (typeof options.onComplete === 'function') options.onComplete();
      }, options.holdAfter || 700);
    }
  }, speed);
}

// auto-redirect splash -> login
function splashAutoToLogin() {
  const splashWrap = document.querySelector('.splash-wrap');
  if (!splashWrap) return;
  // fade then redirect
  splashWrap.classList.add('fade-out');
  setTimeout(()=> {
    window.location.href = 'login.html';
  }, 700);
}

// ----------------- Login logic -----------------
function attachLoginHandler() {
  const form = document.querySelector('#loginForm');
  if (!form) return;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const user = form.querySelector('#username').value.trim();
    const pass = form.querySelector('#password').value.trim();

    // Simple demo credentials - change in production
    const valid = (user === 'admin' && pass === 'admin');
    if (valid) {
      // store basic session info in localStorage for demo
      localStorage.setItem('qaptiz_user', JSON.stringify({ username: user }));
      // redirect to dashboard
      window.location.href = 'dashboard.html';
    } else {
      const err = document.querySelector('#loginError');
      if (err) {
        err.textContent = 'Invalid credentials — try admin / admin';
        err.style.opacity = 1;
        setTimeout(()=> err.style.opacity = 0, 3500);
      } else {
        alert('Invalid credentials — try admin / admin');
      }
    }
  });
}

// ----------------- Dashboard helpers (simulate detections) -----------------
function startDashboardSimulation() {
  const totalEl = document.getElementById('totalCount');
  const prodAEl = document.getElementById('prodA');
  const prodBEl = document.getElementById('prodB');
  const prodCEl = document.getElementById('prodC');
  const detectionsTable = document.getElementById('detectionsTable');

  if (!totalEl) return; // not a dashboard page

  let total = 0, a=0,b=0,c=0;
  function addDummy(item, conf){
    total++;
    if(item==='Product A') a++; else if(item==='Product B') b++; else c++;
    totalEl.textContent = total;
    prodAEl.textContent = a;
    prodBEl.textContent = b;
    prodCEl.textContent = c;

    const tr = document.createElement('tr');
    const now = new Date();
    tr.innerHTML = `<td>${now.toLocaleTimeString()}</td><td>${item}</td><td>${(conf*100).toFixed(1)}%</td><td>CAM-1</td>`;
    if (detectionsTable) detectionsTable.prepend(tr);
    while (detectionsTable && detectionsTable.children.length > 10) detectionsTable.removeChild(detectionsTable.lastChild);
  }

  // simulate every 2s
  setInterval(() => {
    const items = ['Product A','Product B','Product C'];
    const it = items[Math.floor(Math.random()*items.length)];
    const conf = 0.6 + Math.random()*0.4;
    addDummy(it, conf);
  }, 2000);
}

// ----------------- Page init runs -----------------
document.addEventListener('DOMContentLoaded', () => {
  // run splash typing if splash present
  if (document.querySelector('.splash-wrap')) {
    runSplashTyping({
      text: 'Qaptiz.ai',
      typingSpeed: 120,
      holdAfter: 900,
      onComplete: () => {
        // after a short wait, fade to login
        setTimeout(splashAutoToLogin, 900);
      }
    });
  }

  // attach login handler if login form exists
  attachLoginHandler();

  // if dashboard page, start simulation
  if (document.body.classList.contains('dashboard-page')) {
    startDashboardSimulation();
  }
});
