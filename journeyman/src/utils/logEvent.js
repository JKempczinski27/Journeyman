const eventQueue = [];

export function logEvent(name, data = {}) {
  eventQueue.push({ name, data, timestamp: Date.now() });
}

export function flushEvents() {
  const events = [...eventQueue];
  eventQueue.length = 0;
  return events;
}
