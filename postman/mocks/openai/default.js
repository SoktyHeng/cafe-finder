// Contract-specific local stand-in. No real credentials, cafe data, or user text.
// Postman loads mock handlers as CommonJS, including in ESM projects.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('node:http');
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST' || req.url !== '/v1/responses') { res.statusCode = 501; return res.end('{}'); }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body;
  try { body = req.body || JSON.parse(Buffer.concat(chunks).toString()); } catch { res.statusCode = 400; return res.end('{}'); }
  if (body.model !== 'gpt-5.6-luna' || body.store !== false || body.max_output_tokens !== 512 || body.reasoning?.effort !== 'none' || !body.text?.format?.strict || body.tools) {
    res.statusCode = 400; return res.end(JSON.stringify({ error: { message: 'Invalid contract' } }));
  }
  const message = JSON.parse(body.input[0].content).newestMessage;
  if (message === 'mock:html') { res.statusCode = 502; res.setHeader('Content-Type', 'text/html'); return res.end('<html>upstream error</html>'); }
  if (message === 'mock:429') { res.statusCode = 429; return res.end(JSON.stringify({ error: { message: 'rate limit' } })); }
  if (message === 'mock:timeout') return setTimeout(() => { res.statusCode = 503; res.end('{}'); }, 1000);
  const intent = { action: 'search', locationMode: 'area', areaId: 'bkk1', purpose: 'work', radiusMeters: 3000, minRating: null, clearMinRating: false, openNowOnly: null, budget: 'under_5', preferQuiet: true, preferWifi: true, unsupportedFilters: false };
  const output = message === 'mock:invalid' ? '{bad json' : JSON.stringify(intent);
  res.end(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: output }] }], usage: { input_tokens: 800, output_tokens: 180 } }));
}).listen(process.env.PORT);
