require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 4000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json());

// SSE clients for real-time updates
const sseClients = new Set();

// Helper to broadcast events to all SSE clients
function broadcastEvent(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

// ============== TRADES ==============

// POST /trades - Log a completed trade
app.post('/trades', async (req, res) => {
  try {
    const {
      pair,
      side,
      size,
      price,
      total_usd,
      strategy,
      sigma_at_entry,
      tx_hash,
      order_id,
      status = 'filled'
    } = req.body;

    if (!pair || !side || !size || !price || !total_usd) {
      return res.status(400).json({ error: 'Missing required fields: pair, side, size, price, total_usd' });
    }

    const result = await pool.query(
      `INSERT INTO trades (pair, side, size, price, total_usd, strategy, sigma_at_entry, tx_hash, order_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [pair, side, size, price, total_usd, strategy, sigma_at_entry, tx_hash, order_id, status]
    );

    const trade = result.rows[0];
    broadcastEvent('trade', trade);
    res.status(201).json(trade);
  } catch (err) {
    console.error('Error creating trade:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /trades - Trade history (most recent 50)
app.get('/trades', async (req, res) => {
  try {
    const { pair, side, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM trades WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (pair) {
      query += ` AND pair = $${paramIndex++}`;
      params.push(pair);
    }
    if (side) {
      query += ` AND side = $${paramIndex++}`;
      params.push(side);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM trades WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (pair) {
      countQuery += ` AND pair = $${countParamIndex++}`;
      countParams.push(pair);
    }
    if (side) {
      countQuery += ` AND side = $${countParamIndex++}`;
      countParams.push(side);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      trades: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching trades:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============== ACTIONS ==============

// POST /actions - Log agent action
app.post('/actions', async (req, res) => {
  try {
    const { action_type, summary, data } = req.body;

    if (!action_type || !summary) {
      return res.status(400).json({ error: 'Missing required fields: action_type, summary' });
    }

    const result = await pool.query(
      `INSERT INTO agent_actions (action_type, summary, data)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [action_type, summary, data ? JSON.stringify(data) : null]
    );

    const action = result.rows[0];
    broadcastEvent('action', action);
    res.status(201).json(action);
  } catch (err) {
    console.error('Error creating action:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /actions - Recent agent actions (most recent 20)
app.get('/actions', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const result = await pool.query(
      'SELECT * FROM agent_actions ORDER BY created_at DESC LIMIT $1',
      [parseInt(limit)]
    );
    res.json({ actions: result.rows });
  } catch (err) {
    console.error('Error fetching actions:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============== PORTFOLIO ==============

// POST /portfolio - Post portfolio snapshot
app.post('/portfolio', async (req, res) => {
  try {
    const { total_usd, cash_usd, positions, pnl_usd, pnl_pct } = req.body;

    if (total_usd === undefined || cash_usd === undefined || !positions) {
      return res.status(400).json({ error: 'Missing required fields: total_usd, cash_usd, positions' });
    }

    const result = await pool.query(
      `INSERT INTO portfolio_snapshots (total_usd, cash_usd, positions, pnl_usd, pnl_pct)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [total_usd, cash_usd, JSON.stringify(positions), pnl_usd, pnl_pct]
    );

    const portfolio = result.rows[0];
    broadcastEvent('portfolio', portfolio);
    res.status(201).json(portfolio);
  } catch (err) {
    console.error('Error creating portfolio snapshot:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /portfolio - Latest portfolio state
app.get('/portfolio', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM portfolio_snapshots ORDER BY created_at DESC LIMIT 1'
    );

    if (result.rows.length === 0) {
      return res.json({ portfolio: null });
    }

    res.json({ portfolio: result.rows[0] });
  } catch (err) {
    console.error('Error fetching portfolio:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============== SSE EVENTS ==============

// GET /events - SSE stream for real-time updates
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection message
  res.write('event: connected\ndata: {"status":"connected"}\n\n');

  // Add client to set
  sseClients.add(res);

  // Keep connection alive with periodic heartbeat
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30000);

  // Remove client on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /docs - API documentation
app.get('/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ClawBerg API Docs</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0a0a0a; color:#e8e8e8; font-family:'SF Mono','Fira Code',monospace; padding:3rem; max-width:860px; margin:0 auto; }
    h1 { color:#00ff88; font-size:1.4rem; margin-bottom:0.4rem; }
    .subtitle { color:#555; font-size:0.8rem; margin-bottom:3rem; }
    h2 { font-size:0.95rem; color:#e8e8e8; margin:2.5rem 0 1rem; border-bottom:1px solid #1a1a1a; padding-bottom:0.5rem; }
    h3 { font-size:0.8rem; color:#00ff88; margin:1.5rem 0 0.5rem; }
    p { color:#888; font-size:0.8rem; line-height:1.7; margin-bottom:0.8rem; }
    pre { background:#111; border:1px solid #1a1a1a; padding:1rem; border-radius:4px; overflow-x:auto; font-size:0.75rem; line-height:1.6; margin:0.5rem 0 1rem; }
    .method { display:inline-block; padding:0.2rem 0.5rem; border-radius:2px; font-size:0.65rem; font-weight:700; margin-right:0.5rem; }
    .post { background:#0f2a1a; color:#00ff88; border:1px solid #00ff8833; }
    .get  { background:#0a1a2a; color:#4d9fff; border:1px solid #4d9fff33; }
    .endpoint { font-size:0.85rem; color:#e8e8e8; }
    .required { color:#ff5f56; font-size:0.7rem; }
    .optional { color:#555; font-size:0.7rem; }
    table { width:100%; border-collapse:collapse; font-size:0.78rem; margin:0.5rem 0 1rem; }
    td,th { padding:0.5rem 0.8rem; border:1px solid #1a1a1a; text-align:left; }
    th { color:#555; font-weight:normal; font-size:0.7rem; letter-spacing:1px; text-transform:uppercase; }
    td:first-child { color:#00ff88; }
    a { color:#00ff88; }
    nav { margin-bottom:3rem; font-size:0.75rem; }
    nav a { color:#666; text-decoration:none; margin-right:1.5rem; }
    nav a:hover { color:#e8e8e8; }
  </style>
</head>
<body>
  <h1>ClawBerg API</h1>
  <div class="subtitle">Base URL: <code>http://localhost:4000</code> &nbsp;|&nbsp; Real-time: SSE at <code>/events</code></div>
  <nav>
    <a href="#trades">Trades</a>
    <a href="#actions">Actions</a>
    <a href="#portfolio">Portfolio</a>
    <a href="#events">Events</a>
    <a href="#workflow">Agent Workflow</a>
  </nav>

  <h2 id="trades">Trades</h2>

  <h3><span class="method post">POST</span><span class="endpoint">/trades</span></h3>
  <p>Log a completed trade after execution on Kraken.</p>
  <table>
    <tr><th>Field</th><th>Type</th><th></th></tr>
    <tr><td>pair</td><td>string</td><td class="required">required</td></tr>
    <tr><td>side</td><td>"buy" | "sell"</td><td class="required">required</td></tr>
    <tr><td>size</td><td>number</td><td class="required">required</td></tr>
    <tr><td>price</td><td>number</td><td class="required">required</td></tr>
    <tr><td>total_usd</td><td>number</td><td class="required">required</td></tr>
    <tr><td>strategy</td><td>string</td><td class="optional">optional</td></tr>
    <tr><td>sigma_at_entry</td><td>number</td><td class="optional">optional — σ position at time of trade</td></tr>
    <tr><td>tx_hash</td><td>string</td><td class="optional">optional — on-chain proof</td></tr>
    <tr><td>order_id</td><td>string</td><td class="optional">optional — Kraken order ID</td></tr>
  </table>
  <pre>curl -X POST http://localhost:4000/trades \\
  -H "Content-Type: application/json" \\
  -d '{"pair":"TSLAx/USD","side":"buy","size":12.4,"price":241.80,"total_usd":3000,"strategy":"VWAP entry","sigma_at_entry":-0.8,"order_id":"OQCLML-XXXXX"}'</pre>

  <h3><span class="method get">GET</span><span class="endpoint">/trades</span></h3>
  <p>Trade history. Query params: <code>pair</code>, <code>side</code>, <code>limit</code> (default 50), <code>offset</code>.</p>

  <h2 id="actions">Actions</h2>

  <h3><span class="method post">POST</span><span class="endpoint">/actions</span></h3>
  <p>Log agent activity — analysis steps, decisions, alerts, user interactions.</p>
  <table>
    <tr><th>Field</th><th>Type</th><th></th></tr>
    <tr><td>action_type</td><td>"analyze" | "trade" | "rebalance" | "alert" | "chat"</td><td class="required">required</td></tr>
    <tr><td>summary</td><td>string</td><td class="required">required — human-readable description</td></tr>
    <tr><td>data</td><td>object</td><td class="optional">optional — raw signal data (VWAP, σ, etc.)</td></tr>
  </table>
  <pre>curl -X POST http://localhost:4000/actions \\
  -H "Content-Type: application/json" \\
  -d '{"action_type":"analyze","summary":"TSLAx at -0.8σ below VWAP. F&G: 49 neutral. Recommending $3k entry.","data":{"pair":"TSLAx/USD","sigma":-0.8,"fear_greed":49}}'</pre>

  <h3><span class="method get">GET</span><span class="endpoint">/actions</span></h3>
  <p>Recent agent actions. Query param: <code>limit</code> (default 20).</p>

  <h2 id="portfolio">Portfolio</h2>

  <h3><span class="method post">POST</span><span class="endpoint">/portfolio</span></h3>
  <p>Post current portfolio state. Call this after any trade or rebalance.</p>
  <table>
    <tr><th>Field</th><th>Type</th><th></th></tr>
    <tr><td>total_usd</td><td>number</td><td class="required">required</td></tr>
    <tr><td>cash_usd</td><td>number</td><td class="required">required</td></tr>
    <tr><td>positions</td><td>array</td><td class="required">required — [{pair, size, value_usd, entry_price, pnl_pct}]</td></tr>
    <tr><td>pnl_usd</td><td>number</td><td class="optional">optional</td></tr>
    <tr><td>pnl_pct</td><td>number</td><td class="optional">optional</td></tr>
  </table>

  <h3><span class="method get">GET</span><span class="endpoint">/portfolio</span></h3>
  <p>Latest portfolio snapshot. Returns <code>{"portfolio": null}</code> if none exists yet.</p>

  <h2 id="events">Real-time Events (SSE)</h2>

  <h3><span class="method get">GET</span><span class="endpoint">/events</span></h3>
  <p>Server-Sent Events stream. Dashboard connects here for live updates. Event types: <code>connected</code>, <code>trade</code>, <code>action</code>, <code>portfolio</code>.</p>
  <pre>const es = new EventSource('http://localhost:4000/events');
es.addEventListener('trade', e => console.log('New trade:', JSON.parse(e.data)));
es.addEventListener('portfolio', e => console.log('Portfolio updated:', JSON.parse(e.data)));</pre>

  <h2 id="workflow">Agent Workflow</h2>
  <p>The typical sequence after a trade decision:</p>
  <pre>1. Log analysis   →  POST /actions  (action_type: "analyze", what you saw + why)
2. Execute trade  →  kraken order buy TSLAx/USD 12.4 --type market --asset-class tokenized_asset
3. Log trade      →  POST /trades   (pair, side, size, price, order_id from Kraken)
4. Update state   →  POST /portfolio (current holdings after the trade)
5. Log decision   →  POST /actions  (action_type: "trade", what was executed + why)</pre>

  <p style="margin-top:2rem; color:#444; font-size:0.72rem;">ClawBerg — AI Trading Agents Hackathon, lablab.ai × Kraken × Surge, March 2026</p>
</body>
</html>`);
});

// Start server
app.listen(port, () => {
  console.log(`ClawBerg API running on port ${port}`);
});
