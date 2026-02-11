/**
 * ═══════════════════════════════════════════════════════════════════
 *  PG QUERY BUILDER — Supabase-Compatible PostgreSQL Query Builder
 * ═══════════════════════════════════════════════════════════════════
 *
 *  A drop-in replacement for the Supabase JS client that works with
 *  ANY PostgreSQL database. Same chainable API, zero vendor lock-in.
 *
 *  REQUIRED ENV VARS:
 *    DATABASE_URL=postgresql://user:pass@host:5432/dbname
 *    DATABASE_SSL=true|false   (optional, default false)
 *
 *  REQUIRED PACKAGES:
 *    npm install pg dotenv
 *
 *  USAGE:
 *    import { db } from './pg-query-builder.js';
 *
 *    // SELECT
 *    const { data, error } = await db.from('users').select('*').eq('active', true).order('name').limit(10);
 *
 *    // SELECT with count
 *    const { data, count } = await db.from('users').select('*', { count: 'exact' });
 *
 *    // SELECT single row
 *    const { data, error } = await db.from('users').select('*').eq('id', 1).single();
 *
 *    // INSERT
 *    const { data } = await db.from('users').insert({ name: 'John', email: 'john@example.com' }).select();
 *
 *    // INSERT multiple
 *    const { data } = await db.from('users').insert([{ name: 'A' }, { name: 'B' }]).select();
 *
 *    // UPDATE
 *    const { data } = await db.from('users').update({ name: 'Jane' }).eq('id', 1).select();
 *
 *    // UPSERT (insert or update on conflict)
 *    const { data } = await db.from('users').upsert({ id: 1, name: 'Jane' }, { onConflict: 'id' });
 *
 *    // FILTERING — same API as Supabase
 *    .eq(col, val)           — equals
 *    .neq(col, val)          — not equals
 *    .gt / .gte / .lt / .lte — comparisons
 *    .is(col, null)          — IS NULL
 *    .not(col, 'is', null)   — IS NOT NULL
 *    .order(col, { ascending: false })
 *    .limit(n)
 *    .single()               — return one row (or error)
 *
 *    // JOINS (basic foreign key joins)
 *    const { data } = await db.from('orders').select('*, products(title, price)');
 *
 *    // JSON path queries
 *    .eq('metadata->key', 'value')   — queries JSONB columns
 *
 *    // Direct SQL (escape hatch)
 *    import { pool } from './pg-query-builder.js';
 *    const result = await pool.query('SELECT NOW()');
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import pg from 'pg';

// ─── CONNECTION POOL ──────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.warn('[pg-query-builder] DATABASE_URL is required — queries will fail without it');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
});

// ─── QUERY BUILDER ────────────────────────────────────────────────

class QueryBuilder {
  constructor(pool) {
    this._pool = pool;
    this._table = null;
    this._operation = null; // 'select', 'insert', 'update', 'upsert'
    this._selectCols = '*';
    this._countExact = false;
    this._joins = [];
    this._wheres = [];
    this._params = [];
    this._orderClauses = [];
    this._limitVal = null;
    this._singleResult = false;
    this._insertData = null;
    this._updateData = null;
    this._upsertConflict = null;
    this._returnData = false;
  }

  /** Start a query on a table */
  from(table) {
    const qb = new QueryBuilder(this._pool);
    qb._table = table;
    return qb;
  }

  /** SELECT columns (or RETURNING after mutation) */
  select(columns = '*', options = {}) {
    if (this._operation === 'insert' || this._operation === 'update' || this._operation === 'upsert') {
      this._returnData = true;
      return this;
    }
    this._operation = 'select';
    this._countExact = options.count === 'exact';

    // Parse foreign key joins: "*, products(title, price)"
    const joinMatch = columns.match(/,?\s*(\w+)\(([^)]+)\)/);
    if (joinMatch) {
      const cleanCols = columns.replace(/,?\s*\w+\([^)]+\)/, '').trim().replace(/,\s*$/, '') || '*';
      this._selectCols = cleanCols;
      this._joins.push({
        table: joinMatch[1],
        columns: joinMatch[2].split(',').map(c => c.trim()),
        fk: `${joinMatch[1].replace(/s$/, '')}_id`,
      });
    } else {
      this._selectCols = columns;
    }
    return this;
  }

  /** WHERE column = value */
  eq(column, value) {
    this._params.push(value);
    this._wheres.push(`${this._pgCol(column)} = $${this._params.length}`);
    return this;
  }

  /** WHERE column != value */
  neq(column, value) {
    this._params.push(value);
    this._wheres.push(`${this._pgCol(column)} != $${this._params.length}`);
    return this;
  }

  /** WHERE NOT (column operator value) */
  not(column, operator, value) {
    if (operator === 'is' && value === null) {
      this._wheres.push(`${this._pgCol(column)} IS NOT NULL`);
    } else if (operator === 'eq') {
      this._params.push(value);
      this._wheres.push(`${this._pgCol(column)} != $${this._params.length}`);
    }
    return this;
  }

  /** WHERE column IS value (typically null) */
  is(column, value) {
    if (value === null) {
      this._wheres.push(`${this._pgCol(column)} IS NULL`);
    } else {
      this._params.push(value);
      this._wheres.push(`${this._pgCol(column)} IS $${this._params.length}`);
    }
    return this;
  }

  /** WHERE column > value */
  gt(column, value) {
    this._params.push(value);
    this._wheres.push(`${this._pgCol(column)} > $${this._params.length}`);
    return this;
  }

  /** WHERE column >= value */
  gte(column, value) {
    this._params.push(value);
    this._wheres.push(`${this._pgCol(column)} >= $${this._params.length}`);
    return this;
  }

  /** WHERE column < value */
  lt(column, value) {
    this._params.push(value);
    this._wheres.push(`${this._pgCol(column)} < $${this._params.length}`);
    return this;
  }

  /** WHERE column <= value */
  lte(column, value) {
    this._params.push(value);
    this._wheres.push(`${this._pgCol(column)} <= $${this._params.length}`);
    return this;
  }

  /** ORDER BY column ASC|DESC */
  order(column, options = {}) {
    const dir = options.ascending === false ? 'DESC' : 'ASC';
    this._orderClauses.push(`${this._pgCol(column)} ${dir}`);
    return this;
  }

  /** LIMIT n */
  limit(n) {
    this._limitVal = n;
    return this;
  }

  /** Return a single row (errors if not found) */
  single() {
    this._singleResult = true;
    this._limitVal = 1;
    return this;
  }

  /** INSERT one or many rows */
  insert(data) {
    this._operation = 'insert';
    this._insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  /** UPDATE rows (use .eq() etc. to target specific rows) */
  update(data) {
    this._operation = 'update';
    this._updateData = data;
    return this;
  }

  /** UPSERT — insert or update on conflict */
  upsert(data, options = {}) {
    this._operation = 'upsert';
    this._insertData = Array.isArray(data) ? data : [data];
    this._upsertConflict = options.onConflict || 'id';
    return this;
  }

  // ─── INTERNAL HELPERS ────────────────────────────────────────────

  /** Prepare a value for Postgres: arrays stay native, objects become JSON */
  _pgVal(val) {
    if (val === null || val === undefined) return val;
    if (Array.isArray(val)) {
      if (val.length === 0) return '{}';
      if (typeof val[0] === 'object' && val[0] !== null) return JSON.stringify(val);
      return val;
    }
    if (typeof val === 'object') return JSON.stringify(val);
    return val;
  }

  /** Convert JSON path notation (metadata->key) to Postgres ->> syntax */
  _pgCol(col) {
    if (col.includes('->')) {
      const parts = col.split('->');
      return `${parts[0]}->>'${parts[1]}'`;
    }
    return `"${col}"`;
  }

  async _execute() {
    try {
      if (this._operation === 'select') return await this._execSelect();
      if (this._operation === 'insert') return await this._execInsert();
      if (this._operation === 'update') return await this._execUpdate();
      if (this._operation === 'upsert') return await this._execUpsert();
      return { data: null, error: new Error('No operation specified') };
    } catch (err) {
      return { data: null, error: err, count: null };
    }
  }

  async _execSelect() {
    let sql;
    const hasJoin = this._joins.length > 0;

    if (hasJoin) {
      const join = this._joins[0];
      const mainCols = this._selectCols === '*'
        ? `"${this._table}".*`
        : this._selectCols.split(',').map(c => `"${this._table}"."${c.trim()}"`).join(', ');
      const joinCols = join.columns.map(c => `"${join.table}"."${c}" AS "${join.table}_${c}"`).join(', ');
      sql = `SELECT ${mainCols}, ${joinCols} FROM "${this._table}" LEFT JOIN "${join.table}" ON "${this._table}"."${join.fk}" = "${join.table}"."id"`;
    } else {
      sql = `SELECT ${this._selectCols === '*' ? '*' : this._selectCols.split(',').map(c => `"${c.trim()}"`).join(', ')} FROM "${this._table}"`;
    }

    if (this._wheres.length) sql += ` WHERE ${this._wheres.join(' AND ')}`;
    if (this._orderClauses.length) sql += ` ORDER BY ${this._orderClauses.join(', ')}`;
    if (this._limitVal != null) sql += ` LIMIT ${this._limitVal}`;

    const result = await this._pool.query(sql, this._params);

    let rows = result.rows;
    if (hasJoin) {
      const join = this._joins[0];
      rows = rows.map(row => {
        const nested = {};
        const main = { ...row };
        join.columns.forEach(c => {
          nested[c] = row[`${join.table}_${c}`];
          delete main[`${join.table}_${c}`];
        });
        main[join.table] = nested;
        return main;
      });
    }

    const data = this._singleResult ? (rows[0] || null) : rows;
    const error = this._singleResult && !rows[0] ? { message: 'Row not found' } : null;

    let countVal = null;
    if (this._countExact) {
      const countSql = `SELECT COUNT(*) FROM "${this._table}"${this._wheres.length ? ` WHERE ${this._wheres.join(' AND ')}` : ''}`;
      const countResult = await this._pool.query(countSql, this._params);
      countVal = parseInt(countResult.rows[0].count);
    }

    return { data, error: error || null, count: countVal };
  }

  async _execInsert() {
    if (!this._insertData.length) return { data: null, error: null };

    const keys = Object.keys(this._insertData[0]);
    const values = [];
    const placeholders = [];

    this._insertData.forEach((row) => {
      const rowPlaceholders = [];
      keys.forEach((key) => {
        values.push(this._pgVal(row[key]));
        rowPlaceholders.push(`$${values.length}`);
      });
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    });

    const quotedKeys = keys.map(k => `"${k}"`).join(', ');
    const sql = `INSERT INTO "${this._table}" (${quotedKeys}) VALUES ${placeholders.join(', ')}${this._returnData ? ' RETURNING *' : ''}`;

    const result = await this._pool.query(sql, values);
    const data = this._returnData ? (this._singleResult ? result.rows[0] || null : result.rows) : null;
    return { data, error: null };
  }

  async _execUpdate() {
    const keys = Object.keys(this._updateData);
    const setClauses = [];

    keys.forEach((key) => {
      const val = this._pgVal(this._updateData[key]);
      this._params.push(val);
      setClauses.push(`"${key}" = $${this._params.length}`);
    });

    const sql = `UPDATE "${this._table}" SET ${setClauses.join(', ')}${this._wheres.length ? ` WHERE ${this._wheres.join(' AND ')}` : ''}${this._returnData ? ' RETURNING *' : ''}`;

    const result = await this._pool.query(sql, this._params);
    const data = this._returnData ? (this._singleResult ? result.rows[0] || null : result.rows) : null;
    return { data, error: null };
  }

  async _execUpsert() {
    if (!this._insertData.length) return { data: null, error: null };

    const keys = Object.keys(this._insertData[0]);
    const values = [];
    const placeholders = [];

    this._insertData.forEach((row) => {
      const rowPlaceholders = [];
      keys.forEach((key) => {
        values.push(this._pgVal(row[key]));
        rowPlaceholders.push(`$${values.length}`);
      });
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    });

    const quotedKeys = keys.map(k => `"${k}"`).join(', ');
    const conflictCols = this._upsertConflict.split(',').map(c => `"${c.trim()}"`).join(', ');
    const updateClauses = keys
      .filter(k => !this._upsertConflict.split(',').map(c => c.trim()).includes(k))
      .map(k => `"${k}" = EXCLUDED."${k}"`)
      .join(', ');

    const sql = `INSERT INTO "${this._table}" (${quotedKeys}) VALUES ${placeholders.join(', ')} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateClauses} RETURNING *`;

    const result = await this._pool.query(sql, values);
    const data = this._singleResult ? result.rows[0] || null : result.rows;
    return { data, error: null };
  }

  /** Make the builder thenable so `await db.from(...).select(...)` works */
  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  catch(fn) {
    return this._execute().catch(fn);
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────

/** Supabase-compatible query builder instance */
export const db = new QueryBuilder(pool);

/** Raw pg pool for direct SQL queries */
export { pool };
