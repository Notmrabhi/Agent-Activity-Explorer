const { pageSize, tickerIntervalMs, tickerVisibleRows, storageKey } = window.APP_CONFIG;

const grid = document.getElementById('agents');
const searchInput = document.getElementById('search');
const resultsList = document.getElementById('results');
const resultsCount = document.getElementById('results-count');
const topbar = document.querySelector('.topbar');
const backToTop = document.getElementById('back-to-top');
const progress = document.getElementById('read-progress');
const tickerToggle = document.getElementById('ticker-toggle');
const preview = document.getElementById('row-preview');
const scrollContext = document.getElementById('scroll-context');

const minCardHeight = 220;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Timestamps are already ISO strings in UTC, so "HH:MM:SS" is a slice. Same output as
// toLocaleTimeString('en-GB', UTC), without creating a Date and a formatter per row.
function formatTime(iso) {
  return iso.slice(11, 19);
}

function countByAgent(events) {
  const counts = {};
  events.forEach((event) => {
    counts[event.agent] = (counts[event.agent] || 0) + 1;
  });
  return counts;
}

function renderAgents() {
  const counts = countByAgent(window.ACTIVITY);
  grid.innerHTML = window.AGENTS.map((agent, index) => {
    const image = 'assets/agents/agent-' + String((index % 12) + 1).padStart(2, '0') + '.png';
    return (
      '<article class="agent-card">' +
      '<img class="agent-avatar" src="' + image + '" alt="">' +
      '<h3>' + escapeHtml(agent.name) + '</h3>' +
      '<p class="agent-owner">' + escapeHtml(agent.owner) + '</p>' +
      '<p class="agent-description">' + escapeHtml(agent.description) + '</p>' +
      '<p class="agent-count">' + (counts[agent.name] || 0).toLocaleString() + ' calls today</p>' +
      '</article>'
    );
  }).join('');
  grid.querySelectorAll('img').forEach((img) => img.addEventListener('load', equalizeCardHeights));
}

function equalizeCardHeights() {
  const cards = grid.querySelectorAll('.agent-card');
  cards.forEach((card) => {
    card.style.height = '';
    const rowTop = card.offsetTop;
    let tallest = Math.max(card.offsetHeight, minCardHeight);
    cards.forEach((other) => {
      if (other.offsetTop === rowTop) {
        tallest = Math.max(tallest, other.offsetHeight);
      }
    });
    card.style.height = tallest + 'px';
  });
}

function loadViewed() {
  return JSON.parse(localStorage.getItem(storageKey) || '[]');
}

function rememberViewed(items) {
  const viewed = loadViewed();
  for (const item of items) {
    if (!viewed.includes(item.id)) {
      viewed.push(item.id);
    }
    localStorage.setItem(storageKey, JSON.stringify(viewed));
  }
}

// Events sorted newest first once at startup, plus a lazily built lowercase JSON string
// per event. Search used to stringify all 100k events and re-sort the matches (with two
// Date objects per comparison) on every keystroke.
let sortedEvents = [];
const searchTexts = [];

function buildSearchIndex() {
  // Sort is stable, so filtering this list gives the same order the old
  // filter-then-sort produced, ties included.
  sortedEvents = window.ACTIVITY
    .map((event) => ({ event, time: Date.parse(event.timestamp) }))
    .sort((a, b) => b.time - a.time)
    .map((entry) => entry.event);
}

function search(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return sortedEvents;
  const matches = [];
  for (let i = 0; i < sortedEvents.length; i++) {
    // Match against the same text as before (key names included), so results don't change.
    let text = searchTexts[i];
    if (text === undefined) text = searchTexts[i] = JSON.stringify(sortedEvents[i]).toLowerCase();
    if (text.includes(needle)) matches.push(sortedEvents[i]);
  }
  return matches;
}

function renderResults(query) {
  const matches = search(query);
  const page = matches.slice(0, pageSize);
  const viewed = loadViewed();
  resultsCount.textContent = matches.length.toLocaleString() + ' matching tool calls';
  resultsList.innerHTML = page.map((event) => {
    const isNew = !viewed.includes(event.id);
    return (
      '<li class="result-row status-' + event.status + '" data-id="' + event.id + '" data-minute="' + event.timestamp.slice(11, 16) + '">' +
      '<span class="result-time">' + formatTime(event.timestamp) + '</span>' +
      '<span class="result-agent">' + escapeHtml(event.agent) + '</span>' +
      '<span class="result-tool">' + escapeHtml(event.tool) + '</span>' +
      '<span class="result-status">' + event.status + '</span>' +
      '<span class="result-latency">' + event.latencyMs + ' ms</span>' +
      '<span class="result-summary">' + escapeHtml(event.summary) + '</span>' +
      (isNew ? '<span class="badge-new">New</span>' : '') +
      '</li>'
    );
  }).join('');
  fitSummaries();
  rememberViewed(page);
}

// Same sizes as the old loop (start at 14px, shrink 0.5px until the text fits,
// never below 11px), but each pass writes every cell first and then reads every
// cell, so a pass costs one layout instead of one forced layout per cell per step.
// Grid columns are fixed, so one cell's font size never changes another's width.
function fitSummaries() {
  const cells = [...resultsList.querySelectorAll('.result-summary')];
  cells.forEach((cell) => { cell.style.fontSize = '14px'; });
  const sizes = cells.map((cell) => {
    const overflow = cell.scrollWidth > cell.clientWidth;
    if (!overflow) return 14;
    // Text width scales with font size: start one step above the estimate and
    // let the passes below walk down to the exact size.
    const estimate = Math.ceil((14 * cell.clientWidth / cell.scrollWidth) * 2) / 2 + 0.5;
    return Math.min(13.5, Math.max(11, estimate));
  });
  let pending = cells.map((_, i) => i).filter((i) => sizes[i] < 14);
  while (pending.length) {
    pending.forEach((i) => { cells[i].style.fontSize = sizes[i] + 'px'; });
    pending = pending.filter((i) => {
      if (sizes[i] <= 11 || cells[i].scrollWidth <= cells[i].clientWidth) return false;
      sizes[i] -= 0.5;
      return true;
    });
  }
}

// Resize fires many times per frame; refit at most once per frame.
let fitFrame = 0;
function scheduleFitSummaries() {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => {
    fitFrame = 0;
    fitSummaries();
  });
}

function onScroll() {
  const scrolled = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = (max > 0 ? (scrolled / max) * 100 : 0) + '%';
  topbar.classList.toggle('topbar-raised', scrolled > 8);
  topbar.style.paddingBlock = Math.max(6, 12 - scrolled / 20) + 'px';
  backToTop.classList.toggle('visible', scrolled > window.innerHeight);
  resultsList.querySelectorAll('.result-row').forEach((row) => {
    row.classList.remove('in-focus');
    const rect = row.getBoundingClientRect();
    if (rect.top > window.innerHeight * 0.3 && rect.top < window.innerHeight * 0.6) {
      row.classList.add('in-focus');
    }
  });
  const focused = resultsList.querySelector('.in-focus');
  if (focused) {
    const minute = focused.dataset.minute;
    const sameMinute = window.ACTIVITY.filter((event) => new Date(event.timestamp).toISOString().slice(11, 16) === minute).length;
    scrollContext.textContent = minute + ' UTC · ' + sameMinute + ' calls that minute';
  } else {
    scrollContext.textContent = '';
  }
}

function hidePreview() {
  preview.hidden = true;
}

function showPreview(event) {
  const row = event.target.closest('.result-row');
  if (!row) return;
  const item = window.ACTIVITY.find((candidate) => candidate.id === row.dataset.id);
  if (!item) return;
  preview.textContent = item.summary;
  preview.style.top = event.clientY + 12 + 'px';
  preview.style.left = event.clientX + 12 + 'px';
  preview.hidden = false;
}

const renderedTickerRows = new Map();
let tickerPanel = null;

function tickerRow(event) {
  if (renderedTickerRows.has(event.id)) {
    return renderedTickerRows.get(event.id).cloneNode(true);
  }
  const row = document.createElement('li');
  row.className = 'ticker-row status-' + event.status;
  row.innerHTML =
    '<span class="ticker-time">' + formatTime(event.timestamp) + '</span>' +
    '<span class="ticker-agent">' + escapeHtml(event.agent) + '</span>' +
    '<span class="ticker-tool">' + escapeHtml(event.tool) + '</span>';
  renderedTickerRows.set(event.id, row);
  return row.cloneNode(true);
}

function positionTicker() {
  if (!tickerPanel) return;
  tickerPanel.style.maxHeight = window.innerHeight - 120 + 'px';
}

function openTicker() {
  const panel = document.createElement('aside');
  panel.className = 'ticker';
  panel.innerHTML = '<header class="ticker-header">Live tool calls</header><ul class="ticker-list"></ul>';
  document.body.appendChild(panel);
  tickerPanel = panel;
  const list = panel.querySelector('.ticker-list');

  setInterval(() => {
    if (!ready) return; // data is built just after the first paint
    const event = window.ACTIVITY[Math.floor(Math.random() * window.ACTIVITY.length)];
    list.prepend(tickerRow(event));
    while (list.children.length > tickerVisibleRows) {
      list.lastElementChild.remove();
    }
  }, tickerIntervalMs);

  window.addEventListener('resize', positionTicker);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTicker();
  });
  positionTicker();
  tickerToggle.setAttribute('aria-pressed', 'true');
  tickerToggle.textContent = 'Hide live calls';
}

function closeTicker() {
  if (!tickerPanel) return;
  tickerPanel.remove();
  tickerPanel = null;
  tickerToggle.setAttribute('aria-pressed', 'false');
  tickerToggle.textContent = 'Show live calls';
}

let ready = false;
// Wait for a short pause in typing instead of searching on every keystroke.
let searchTimer = 0;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (ready) renderResults(searchInput.value);
  }, 150);
});
window.addEventListener('scroll', onScroll);
window.addEventListener('resize', equalizeCardHeights);
window.addEventListener('resize', scheduleFitSummaries);
resultsList.addEventListener('mousemove', showPreview);
resultsList.addEventListener('mouseleave', hidePreview);
resultsList.addEventListener('wheel', hidePreview);
resultsList.addEventListener('touchstart', hidePreview);
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
tickerToggle.addEventListener('click', () => (tickerPanel ? closeTicker() : openTicker()));

// Let the browser paint the page shell first: building the data and the first
// render are slow, and they used to run before anything showed on screen.
function start() {
  window.ACTIVITY = window.buildActivity(100000);
  buildSearchIndex();
  renderAgents();
  equalizeCardHeights();
  // Whatever was typed before the data was ready.
  renderResults(searchInput.value);
  ready = true;
}
requestAnimationFrame(() => setTimeout(start, 0));
