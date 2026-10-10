import express from 'express';
import { query, withTransaction } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, handle } from '../lib/http.js';

const router = express.Router();
router.use(requireAuth);

const TRIP_SELECT = `
  SELECT t.id, t.user_id AS "userId", u.username, t.route_id AS "routeId", r.name AS "routeName",
         ss.name AS "startStation", es.name AS "endStation", t.fare, t.status,
         t.started_at AS "startedAt", t.ended_at AS "endedAt", t.cancel_reason AS "cancelReason"
  FROM trips t
  JOIN users u ON u.id = t.user_id
  JOIN routes r ON r.id = t.route_id
  JOIN stations ss ON ss.id = t.start_station_id
  LEFT JOIN stations es ON es.id = t.end_station_id`;

const toId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Station must be on the route's ordered list.
const stationOnRoute = async (client, routeId, stationId) => {
  const { rows } = await client.query(
    `SELECT s.name FROM route_stations rs JOIN stations s ON s.id = rs.station_id
     WHERE rs.route_id = $1 AND rs.station_id = $2`,
    [routeId, stationId]
  );
  return rows[0]?.name ?? null;
};

// Reader bridge: Admin-authenticated until device authentication is designed.
router.post('/rfid/tap', requireRole('admin'), handle(async (req, res) => {
  const { action } = req.body;
  const userId = toId(req.body.userId);
  const routeId = toId(req.body.routeId);
  const stationId = toId(req.body.stationId);

  if (action !== 'start' && action !== 'end') throw new HttpError(400, 'Tap action must be start or end.');
  if (userId === null) throw new HttpError(404, 'RFID unregistered');
  if (routeId === null || stationId === null) throw new HttpError(400, 'Route and Station are required.');

  const result = await withTransaction(async (client) => {
    const card = (await client.query('SELECT status, balance FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
    if (!card || card.status === 'deleted') throw new HttpError(404, 'RFID unregistered');
    if (card.status !== 'active') throw new HttpError(403, 'Card deactivated');

    const route = (await client.query('SELECT id, name, fare, status FROM routes WHERE id = $1', [routeId])).rows[0];
    if (!route) throw new HttpError(404, 'Route not found');
    const stationName = await stationOnRoute(client, routeId, stationId);
    if (stationName === null) throw new HttpError(400, 'Station is not on this Route.');

    if (action === 'start') {
      if (route.status !== 'active') throw new HttpError(409, 'This Route is not in service.');
      if (card.balance < route.fare) throw new HttpError(402, 'Insufficient funds');

      let trip;
      try {
        trip = (await client.query(
          `INSERT INTO trips (user_id, route_id, start_station_id, fare)
           VALUES ($1, $2, $3, $4) RETURNING id, fare, status`,
          [userId, routeId, stationId, route.fare]
        )).rows[0];
      } catch (err) {
        if (err.code === '23505') throw new HttpError(409, 'Card already has an open trip.');
        throw err;
      }
      return { message: 'Trip started', trip: { ...trip, routeId }, balance: card.balance };
    }

    // action === 'end'
    const open = (await client.query(
      "SELECT id, route_id, start_station_id, fare FROM trips WHERE user_id = $1 AND status = 'open' FOR UPDATE",
      [userId]
    )).rows[0];
    if (!open) throw new HttpError(409, 'No open trip for this Card.');
    if (open.route_id !== routeId) throw new HttpError(409, 'Open trip is on a different Route.');
    if (open.start_station_id === stationId) {
      throw new HttpError(400, 'End Station must differ from the start Station.');
    }

    let transactionId = null;
    let balance = card.balance;
    if (open.fare > 0) {
      const debited = await client.query(
        'UPDATE users SET balance = balance - $2 WHERE id = $1 AND balance >= $2 RETURNING balance',
        [userId, open.fare]
      );
      if (debited.rows.length === 0) throw new HttpError(402, 'Insufficient funds');
      balance = debited.rows[0].balance;
      const title = `Trip: ${route.name} (${(await stationOnRoute(client, routeId, open.start_station_id))} → ${stationName})`;
      transactionId = (await client.query(
        "INSERT INTO transactions (user_id, type, title, amount) VALUES ($1, 'debit', $2, $3) RETURNING id",
        [userId, title, open.fare]
      )).rows[0].id;
    }

    await client.query(
      `UPDATE trips SET status = 'completed', end_station_id = $2, ended_at = now(), transaction_id = $3
       WHERE id = $1`,
      [open.id, stationId, transactionId]
    );
    return {
      message: 'Trip completed',
      trip: { id: open.id, fare: open.fare, status: 'completed', routeId },
      newBalance: balance,
    };
  });

  res.json({ success: true, ...result });
}));

router.get('/trips/mine', handle(async (req, res) => {
  const { rows } = await query(`${TRIP_SELECT} WHERE t.user_id = $1 ORDER BY t.id DESC LIMIT 20`, [req.user.id]);
  res.json({ success: true, trips: rows });
}));

router.get('/trips', requireRole('admin'), handle(async (req, res) => {
  const status = req.query.status;
  if (status !== undefined && !['open', 'completed', 'cancelled'].includes(status)) {
    throw new HttpError(400, 'Invalid status.');
  }
  const userId = req.query.userId === undefined ? null : toId(req.query.userId);
  const { rows } = await query(
    `${TRIP_SELECT}
     WHERE ($1::text IS NULL OR t.status = $1) AND ($2::int IS NULL OR t.user_id = $2)
     ORDER BY t.id DESC LIMIT 100`,
    [status ?? null, userId]
  );
  res.json({ success: true, trips: rows });
}));

router.put('/trips/:id/cancel', requireRole('admin'), handle(async (req, res) => {
  const id = toId(req.params.id);
  const reason = String(req.body.reason ?? '').trim();
  if (id === null) throw new HttpError(404, 'Trip not found');
  if (!reason) throw new HttpError(400, 'A reason is required.');

  const updated = await query(
    `UPDATE trips SET status = 'cancelled', ended_at = now(), cancelled_by = $2, cancel_reason = $3
     WHERE id = $1 AND status = 'open' RETURNING id`,
    [id, req.user.id, reason.slice(0, 200)]
  );
  if (updated.rows.length === 0) {
    const exists = await query('SELECT 1 FROM trips WHERE id = $1', [id]);
    if (exists.rows.length === 0) throw new HttpError(404, 'Trip not found');
    throw new HttpError(409, 'Only open trips can be cancelled.');
  }
  const { rows } = await query(`${TRIP_SELECT} WHERE t.id = $1`, [id]);
  res.json({ success: true, trip: rows[0] });
}));

export default router;
