import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { query, withTransaction } from './db/index.js';
import { initDatabase } from './db/init.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const formatTxnDate = (d) =>
  d.toLocaleDateString() + ', ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const parseAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const ROUTE_COLUMNS = 'id, name, stations, base_fare AS "baseFare", per_km AS "perKm", total_km AS "totalKm"';

// Routes
app.get('/', (req, res) => {
  res.send('SmartRail API Running with PostgreSQL...');
});

app.post('/api/register', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const { rows } = await query(
    `INSERT INTO users (username, password, role, balance)
     VALUES ($1, $2, 'user', 0)
     ON CONFLICT (username) DO NOTHING
     RETURNING id, username, role`,
    [username, password]
  );

  if (rows.length === 0) {
    return res.status(400).json({ success: false, message: 'Passenger ID already registered' });
  }

  const newUser = rows[0];
  res.json({
    success: true,
    user: { id: newUser.id, username: newUser.username, role: newUser.role, balance: 0 },
    token: 'jwt-' + Math.random().toString(36).substring(7)
  });
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await query(
    'SELECT id, username, role, balance FROM users WHERE username = $1 AND password = $2',
    [username, password]
  );

  if (rows.length > 0) {
    const user = rows[0];
    res.json({
      success: true,
      user: { id: user.id, username: user.username, role: user.role, balance: user.balance || 0 },
      token: 'jwt-' + Date.now()
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
}));

app.get('/api/history/:userId', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (Number.isNaN(userId)) return res.json({ success: true, history: [] });

  const { rows } = await query(
    `SELECT id, user_id AS "userId", type, title, amount, created_at
     FROM transactions WHERE user_id = $1
     ORDER BY id DESC LIMIT 10`,
    [userId]
  );
  const history = rows.map(({ created_at, ...t }) => ({ ...t, date: formatTxnDate(created_at) }));
  res.json({ success: true, history });
}));

app.get('/api/users', asyncHandler(async (req, res) => {
  const { rows } = await query("SELECT id, username, role, balance FROM users WHERE role = 'user' ORDER BY id");
  res.json({ success: true, users: rows });
}));

app.get('/api/routes', asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT ${ROUTE_COLUMNS} FROM routes ORDER BY id`);
  res.json({ success: true, routes: rows });
}));

app.put('/api/routes/:id', asyncHandler(async (req, res) => {
  const { baseFare, perKm } = req.body;
  const id = parseInt(req.params.id, 10);
  const base = Number(baseFare);
  const per = Number(perKm);

  if (Number.isNaN(id) || !Number.isFinite(base) || !Number.isFinite(per)) {
    return res.status(404).json({ success: false, message: 'Route not found' });
  }

  const { rows } = await query(
    `UPDATE routes SET base_fare = $2, per_km = $3 WHERE id = $1 RETURNING ${ROUTE_COLUMNS}`,
    [id, base, per]
  );

  if (rows.length > 0) {
    res.json({ success: true, route: rows[0] });
  } else {
    res.status(404).json({ success: false, message: 'Route not found' });
  }
}));

app.post('/api/topup', asyncHandler(async (req, res) => {
  const amount = parseAmount(req.body.amount);
  if (amount === null) return res.status(400).json({ success: false, message: 'Invalid amount' });

  const userId = Number(req.body.userId);
  const balance = Number.isInteger(userId)
    ? await withTransaction(async (client) => {
        const { rows } = await client.query(
          'UPDATE users SET balance = balance + $2 WHERE id = $1 RETURNING balance',
          [userId, amount]
        );
        if (rows.length === 0) return null;
        await client.query(
          "INSERT INTO transactions (user_id, type, title, amount) VALUES ($1, 'credit', 'Card Recharge', $2)",
          [userId, amount]
        );
        return rows[0].balance;
      })
    : null;

  if (balance === null) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, balance });
}));

app.post('/api/rfid/tap', asyncHandler(async (req, res) => {
  const userId = Number(req.body.userId);
  if (!Number.isInteger(userId)) {
    return res.status(404).json({ success: false, message: 'RFID unregistered' });
  }

  const amount = parseAmount(req.body.amount);
  if (amount === null) return res.status(400).json({ success: false, message: 'Invalid amount' });

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      'UPDATE users SET balance = balance - $2 WHERE id = $1 AND balance >= $2 RETURNING balance',
      [userId, amount]
    );

    if (rows.length > 0) {
      await client.query(
        "INSERT INTO transactions (user_id, type, title, amount) VALUES ($1, 'debit', 'Station Exit Tap', $2)",
        [userId, amount]
      );
      return { status: 200, newBalance: rows[0].balance };
    }

    const found = await client.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    return { status: found.rows.length > 0 ? 402 : 404 };
  });

  if (result.status === 200) {
    return res.json({ success: true, message: 'Tap Approved', newBalance: result.newBalance });
  }
  if (result.status === 402) {
    return res.status(402).json({ success: false, message: 'Insufficient funds' });
  }
  res.status(404).json({ success: false, message: 'RFID unregistered' });
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Server error' });
});

const start = async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to backend/.env (see backend/.env.example).');
    process.exit(1);
  }
  try {
    await initDatabase();
  } catch (err) {
    // Connection refusals surface as an AggregateError with an empty message.
    const reason = err.message || err.errors?.[0]?.message || err.code || String(err);
    console.error('Could not initialise the database:', reason);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`🚀 SmartRail Backend running on http://localhost:${PORT}`);
  });
};

start();
