// Postman requires CommonJS handlers.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('node:http');
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') { res.statusCode = 501; return res.end('{}'); }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try { body = req.body || JSON.parse(Buffer.concat(chunks).toString()); } catch { res.statusCode = 400; return res.end('{}'); }
  if (body.model !== 'openai/gpt-oss-20b' || body.stream !== false || body.max_tokens !== 2048 || !body.response_format?.json_schema?.strict || body.tools) {
    res.statusCode = 422; return res.end('{}');
  }
  const message = JSON.parse(body.messages.at(-1).content).newestMessage;
  if (message === 'mock:html') { res.statusCode = 502; res.setHeader('Content-Type', 'text/html'); return res.end('<html>unavailable</html>'); }
  if (message === 'mock:429') { res.statusCode = 429; return res.end('{}'); }
  if (message === 'mock:timeout') return setTimeout(() => res.end('{}'), 1000);
  const intent = { action: 'search', locationMode: 'area', areaId: 'bkk1', purpose: 'work', radiusMeters: 3000, minRating: null, clearMinRating: false, openNowOnly: null, budget: 'under_5', preferQuiet: true, preferWifi: true, unsupportedFilters: false };
  res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: message === 'mock:invalid' ? '{bad' : JSON.stringify(intent) } }], usage: { prompt_tokens: 800, completion_tokens: 180 } }));
}).listen(process.env.PORT);
