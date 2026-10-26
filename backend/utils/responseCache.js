// Short-lived in-memory cache for the heavy read endpoints (full candidate list,
// dashboard, statistics). On the free Render/Atlas tiers each of those takes
// 5-20s to build, so repeat visits were paying that every time.
//
// Correctness: any write to Candidate / Role / EmploymentType (via the model hooks
// attached with `invalidateOnWrite`) empties the cache, and entries also expire
// after TTL_MS to cover writes made outside this server (scripts, the ETL cron on
// another instance, direct DB edits).
const TTL_MS = 2 * 60 * 1000;
// Render's free instance has ~256MB of heap and a full candidate list is ~15MB of JSON,
// so cap the total cached bytes, not just the entry count.
const MAX_ENTRIES = 12;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const store = new Map();
let totalBytes = 0;

function clear() {
  store.clear();
  totalBytes = 0;
}

function evictOldest() {
  const oldestKey = store.keys().next().value;
  totalBytes -= store.get(oldestKey).body.length;
  store.delete(oldestKey);
}

// Express middleware: serves a cached 200 JSON body for the same URL, else lets the
// handler run and remembers its successful response.
function cacheGet(req, res, next) {
  if (req.method !== 'GET') return next();
  const key = req.originalUrl;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    res.set('X-Cache', 'HIT');
    return res.status(200).type('application/json').send(hit.body);
  }
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (res.statusCode === 200) {
      const body = JSON.stringify(payload);
      if (body.length <= MAX_TOTAL_BYTES / 2) {
        if (store.has(key)) { totalBytes -= store.get(key).body.length; store.delete(key); }
        while (store.size >= MAX_ENTRIES || (store.size && totalBytes + body.length > MAX_TOTAL_BYTES)) evictOldest();
        store.set(key, { at: Date.now(), body });
        totalBytes += body.length;
      }
      res.set('X-Cache', 'MISS');
      return res.type('application/json').send(body);
    }
    return originalJson(payload);
  };
  return next();
}

// Attach to a schema so any write drops the cached reads.
function invalidateOnWrite(schema) {
  schema.post('save', clear);
  schema.post('insertMany', clear);
  schema.post(/^(updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findOneAndDelete|findOneAndReplace|replaceOne)$/, clear);
  schema.post('deleteOne', { document: true, query: false }, clear);
}

module.exports = { cacheGet, invalidateOnWrite, clear };
