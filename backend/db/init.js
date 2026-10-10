import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, withTransaction } from './index.js';
import { seedUsers, seedRoutes } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

// Keep sequences ahead of explicitly inserted ids.
export const syncSequences = async (client) => {
  for (const table of ['users', 'routes', 'transactions']) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 0), 1), (SELECT COUNT(*) > 0 FROM ${table}))`
    );
  }
};

export const ensureSchema = (client = pool) => client.query(schemaSql);

export const initDatabase = async () => {
  await ensureSchema();

  await withTransaction(async (client) => {
    // Serialise concurrent first starts.
    await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM users');
    if (rows[0].n > 0) return;

    for (const u of seedUsers) {
      await client.query(
        'INSERT INTO users (id, username, password, role, balance) VALUES ($1, $2, $3, $4, $5)',
        [u.id, u.username, u.password, u.role, u.balance]
      );
    }
    for (const r of seedRoutes) {
      await client.query(
        'INSERT INTO routes (id, name, stations, base_fare, per_km, total_km) VALUES ($1, $2, $3, $4, $5, $6)',
        [r.id, r.name, r.stations, r.baseFare, r.perKm, r.totalKm]
      );
    }
    await syncSequences(client);
  });
};
