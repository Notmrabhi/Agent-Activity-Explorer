// Builds the 100k events and answers searches off the main thread, so the page never freezes.
self.window = self; // config.js assigns to window.*
importScripts('config.js');

const { pageSize } = self.APP_CONFIG;
const events = self.buildActivity(100000);

// Stable sort, so filtering keeps the original filter-then-sort order.
const sorted = events
  .map((event) => ({ event, time: Date.parse(event.timestamp) }))
  .sort((a, b) => b.time - a.time)
  .map((entry) => entry.event);

const agentCounts = {};
const minuteCounts = {};
for (const event of events) {
  agentCounts[event.agent] = (agentCounts[event.agent] || 0) + 1;
  const minute = event.timestamp.slice(11, 16);
  minuteCounts[minute] = (minuteCounts[minute] || 0) + 1;
}

// The unfiltered first page goes out before the search index is built.
self.postMessage({ type: 'ready', agentCounts, minuteCounts, firstPage: sorted.slice(0, pageSize), total: sorted.length });

// Same text the original search matched (key names included), so results don't change.
const texts = sorted.map((event) => JSON.stringify(event).toLowerCase());

self.onmessage = ({ data }) => {
  if (data.type === 'search') {
    const needle = data.query.trim().toLowerCase();
    const page = [];
    let total = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (needle && !texts[i].includes(needle)) continue;
      if (page.length < pageSize) page.push(sorted[i]);
      total++;
    }
    self.postMessage({ type: 'results', id: data.id, page, total });
  } else if (data.type === 'random') {
    self.postMessage({ type: 'random', event: events[Math.floor(Math.random() * events.length)] });
  }
};
