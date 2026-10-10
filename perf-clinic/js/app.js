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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Timestamps are UTC ISO strings.
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
  grid.innerHTML = window.AGENTS.map((agent, index) => {
    const image = 'assets/agents/agent-' + String((index % 6) + 1).padStart(2, '0') + '.webp';
    return (
      '<article class="agent-card">' +
      '<img class="agent-avatar" src="' + image + '" width="48" height="48" decoding="async" alt="">' +
      '<h3>' + escapeHtml(agent.name) + '</h3>' +
      '<p class="agent-owner">' + escapeHtml(agent.owner) + '</p>' +
      '<p class="agent-description">' + escapeHtml(agent.description) + '</p>' +
      '<p class="agent-count">&nbsp;</p>' +
      '</article>'
    );
  }).join('');
}

function renderAgentCounts() {
  const counts = countByAgent(window.ACTIVITY);
  grid.querySelectorAll('.agent-count').forEach((cell, index) => {
    cell.textContent = (counts[window.AGENTS[index].name] || 0).toLocaleString() + ' calls today';
  });
}

const MAX_VIEWED = 5000;
const viewedIds = new Set(loadViewed());

function loadViewed() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch {
    return [];
  }
}

function rememberViewed(items) {
  let changed = false;
  for (const item of items) {
    if (!viewedIds.has(item.id)) {
      viewedIds.add(item.id);
      changed = true;
    }
  }
  if (!changed) return;
  const extra = viewedIds.size - MAX_VIEWED;
  if (extra > 0) [...viewedIds].slice(0, extra).forEach((id) => viewedIds.delete(id));
  localStorage.setItem(storageKey, JSON.stringify([...viewedIds]));
}

let sortedEvents = [];
const searchTexts = [];

function buildSearchIndex() {
  sortedEvents = window.ACTIVITY
    .map((event) => ({ event, time: Date.parse(event.timestamp) }))
    .sort((a, b) => b.time - a.time)
    .map((entry) => entry.event);
}

function searchText(i) {
  let text = searchTexts[i];
  if (text === undefined) text = searchTexts[i] = JSON.stringify(sortedEvents[i]).toLowerCase();
  return text;
}

const whenIdle = window.requestIdleCallback || ((cb) => setTimeout(() => cb({ timeRemaining: () => 10 }), 1));
let indexed = 0;
// Builds the search texts in short idle slices so the first search doesn't pay for all of them.
function indexWhenIdle(deadline) {
  const end = performance.now() + 5;
  while (indexed < sortedEvents.length && deadline.timeRemaining() > 0 && performance.now() < end) searchText(indexed++);
  if (indexed < sortedEvents.length) whenIdle(indexWhenIdle);
}

function search(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return sortedEvents;
  const matches = [];
  for (let i = 0; i < sortedEvents.length; i++) {
    if (searchText(i).includes(needle)) matches.push(sortedEvents[i]);
  }
  return matches;
}

function renderResults(query) {
  const matches = search(query);
  const page = matches.slice(0, pageSize);
  resultsCount.textContent = matches.length.toLocaleString() + ' matching tool calls';
  resultsList.innerHTML = page.map((event) => {
    const isNew = !viewedIds.has(event.id);
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

// Each pass writes all cells, then reads all cells: one layout per pass.
function fitSummaries() {
  const cells = [...resultsList.querySelectorAll('.result-summary')];
  cells.forEach((cell) => { cell.style.fontSize = '14px'; });
  const sizes = cells.map((cell) => {
    if (cell.scrollWidth <= cell.clientWidth) return 14;
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

let fitFrame = 0;
function scheduleFitSummaries() {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => {
    fitFrame = 0;
    fitSummaries();
    measureRows();
  });
}

const callsPerMinute = new Map();
function countCallsPerMinute() {
  for (const event of window.ACTIVITY) {
    const minute = event.timestamp.slice(11, 16);
    callsPerMinute.set(minute, (callsPerMinute.get(minute) || 0) + 1);
  }
}

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
  // Any scroll moves rows under the cursor.
  preview.hidden = true;
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateOnScroll);
}

function updateOnScroll() {
  scrollFrame = 0;
  const scrolled = window.scrollY;
  const viewport = window.innerHeight;
  const max = document.documentElement.scrollHeight - viewport;
  const listTop = resultsList.getBoundingClientRect().top;

  progress.style.transform = 'scaleX(' + (max > 0 ? scrolled / max : 0) + ')';
  topbar.classList.toggle('topbar-raised', scrolled > 8);
  const padding = Math.max(6, 12 - scrolled / 20) + 'px';
  if (padding !== lastPadding) {
    topbar.style.paddingBlock = padding;
    lastPadding = padding;
  }
  backToTop.classList.toggle('visible', scrolled > viewport);

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
  preview.style.transform = 'translate(' + (event.clientX + 12) + 'px, ' + (event.clientY + 12) + 'px)';
  preview.hidden = false;
}

let tickerPanel = null;
let tickerTimer = 0;
let tickerListeners = null;

function tickerRow(event) {
  const row = document.createElement('li');
  row.className = 'ticker-row status-' + event.status;
  row.innerHTML =
    '<span class="ticker-time">' + formatTime(event.timestamp) + '</span>' +
    '<span class="ticker-agent">' + escapeHtml(event.agent) + '</span>' +
    '<span class="ticker-tool">' + escapeHtml(event.tool) + '</span>';
  return row;
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

  tickerTimer = setInterval(() => {
    if (!ready) return;
    const event = window.ACTIVITY[Math.floor(Math.random() * window.ACTIVITY.length)];
    list.prepend(tickerRow(event));
    while (list.children.length > tickerVisibleRows) {
      list.lastElementChild.remove();
    }
  }, tickerIntervalMs);

  tickerListeners = new AbortController();
  const { signal } = tickerListeners;
  window.addEventListener('resize', positionTicker, { signal });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTicker();
  }, { signal });
  positionTicker();
  tickerToggle.setAttribute('aria-pressed', 'true');
  tickerToggle.textContent = 'Hide live calls';
}

function closeTicker() {
  if (!tickerPanel) return;
  clearInterval(tickerTimer);
  tickerListeners.abort();
  tickerPanel.remove();
  tickerPanel = null;
  tickerToggle.setAttribute('aria-pressed', 'false');
  tickerToggle.textContent = 'Show live calls';
}

let ready = false;
let searchTimer = 0;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (ready) renderResults(searchInput.value);
  }, 150);
});
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', scheduleFitSummaries);
resultsList.addEventListener('mousemove', showPreview);
resultsList.addEventListener('mouseleave', hidePreview);
resultsList.addEventListener('wheel', hidePreview, { passive: true });
resultsList.addEventListener('touchstart', hidePreview, { passive: true });
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
tickerToggle.addEventListener('click', () => (tickerPanel ? closeTicker() : openTicker()));

renderAgents();

function start() {
  window.ACTIVITY = window.buildActivity(100000);
  buildSearchIndex();
  countCallsPerMinute();
  window.ACTIVITY.forEach((event) => eventsById.set(event.id, event));
  renderAgentCounts();
  renderResults(searchInput.value);
  ready = true;
  whenIdle(indexWhenIdle);
}
// Build data and render the list after the first paint.
requestAnimationFrame(() => setTimeout(start, 0));
