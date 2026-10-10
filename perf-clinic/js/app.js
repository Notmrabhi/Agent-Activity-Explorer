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
  measureRows();
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
    measureRows();
  });
}

// Calls per "HH:MM", counted once. The scroll handler used to filter all 100k events
// (with a new Date each) on every scroll event.
const callsPerMinute = new Map();
function countCallsPerMinute() {
  for (const event of window.ACTIVITY) {
    const minute = event.timestamp.slice(11, 16);
    callsPerMinute.set(minute, (callsPerMinute.get(minute) || 0) + 1);
  }
}

// Row positions inside the list, measured once per render/resize. Rows used to be measured
// one by one with getBoundingClientRect on every scroll event.
let rows = [];
let rowOffsets = [];
let focusedRows = new Set();
function measureRows() {
  rows = [...resultsList.children];
  const listTop = resultsList.getBoundingClientRect().top;
  rowOffsets = rows.map((row) => row.getBoundingClientRect().top - listTop);
  focusedRows = new Set();
}

let lastPadding = '';
let lastContext = '';
let scrollFrame = 0;
function onScroll() {
  // Scroll events can fire several times per frame; do the work once per frame.
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateOnScroll);
}

function updateOnScroll() {
  scrollFrame = 0;
  // Reads first...
  const scrolled = window.scrollY;
  const viewport = window.innerHeight;
  const max = document.documentElement.scrollHeight - viewport;
  const listTop = resultsList.getBoundingClientRect().top;

  // ...then writes, so the browser lays out at most once.
  // transform instead of width: the bar animates without triggering layout.
  progress.style.transform = 'scaleX(' + (max > 0 ? scrolled / max : 0) + ')';
  topbar.classList.toggle('topbar-raised', scrolled > 8);
  // The shrink only changes over the first 120px; skip the (layout-causing) write otherwise.
  const padding = Math.max(6, 12 - scrolled / 20) + 'px';
  if (padding !== lastPadding) {
    topbar.style.paddingBlock = padding;
    lastPadding = padding;
  }
  backToTop.classList.toggle('visible', scrolled > viewport);

  // Same rule as before: rows whose top is between 30% and 60% of the viewport.
  const next = new Set();
  rowOffsets.forEach((offset, i) => {
    const top = listTop + offset;
    if (top > viewport * 0.3 && top < viewport * 0.6) next.add(i);
  });
  focusedRows.forEach((i) => { if (!next.has(i)) rows[i].classList.remove('in-focus'); });
  next.forEach((i) => { if (!focusedRows.has(i)) rows[i].classList.add('in-focus'); });
  focusedRows = next;

  const first = next.size ? rows[Math.min(...next)] : null;
  const context = first
    ? first.dataset.minute + ' UTC · ' + (callsPerMinute.get(first.dataset.minute) || 0) + ' calls that minute'
    : '';
  if (context !== lastContext) {
    scrollContext.textContent = context;
    lastContext = context;
  }
}

function hidePreview() {
  preview.hidden = true;
}

// id -> event, built once. The preview used to scan all 100k events on every mousemove.
const eventsById = new Map();
let previewId = null;

function showPreview(event) {
  const row = event.target.closest('.result-row');
  if (!row) return;
  if (row.dataset.id !== previewId) {
    const item = eventsById.get(row.dataset.id);
    if (!item) return;
    preview.textContent = item.summary;
    previewId = row.dataset.id;
  }
  // transform moves the tooltip without a layout; top/left would trigger one per mousemove.
  preview.style.transform = 'translate(' + (event.clientX + 12) + 'px, ' + (event.clientY + 12) + 'px)';
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
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', equalizeCardHeights);
window.addEventListener('resize', scheduleFitSummaries);
resultsList.addEventListener('mousemove', showPreview);
resultsList.addEventListener('mouseleave', hidePreview);
// Passive: these only hide the tooltip, so the browser must not wait for them before
// scrolling (non-passive wheel/touch listeners delayed every wheel scroll).
resultsList.addEventListener('wheel', hidePreview, { passive: true });
resultsList.addEventListener('touchstart', hidePreview, { passive: true });
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
tickerToggle.addEventListener('click', () => (tickerPanel ? closeTicker() : openTicker()));

// Let the browser paint the page shell first: building the data and the first
// render are slow, and they used to run before anything showed on screen.
function start() {
  window.ACTIVITY = window.buildActivity(100000);
  buildSearchIndex();
  countCallsPerMinute();
  window.ACTIVITY.forEach((event) => eventsById.set(event.id, event));
  renderAgents();
  equalizeCardHeights();
  // Whatever was typed before the data was ready.
  renderResults(searchInput.value);
  ready = true;
}
requestAnimationFrame(() => setTimeout(start, 0));
