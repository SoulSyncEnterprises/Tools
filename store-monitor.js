/**
 * ═══════════════════════════════════════════════════════════════════
 *  STORE MONITOR — Daily Health Checks & Alert System
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Automated health checks for orders, products, and ads. Flags
 *  issues with red/yellow/green severity levels and saves alerts
 *  to your database.
 *
 *  REQUIRED ENV VARS:
 *    DATABASE_URL=postgresql://user:pass@host:5432/dbname
 *    DATABASE_SSL=true|false   (optional)
 *
 *  REQUIRED PACKAGES:
 *    npm install pg dotenv
 *
 *  REQUIRED DB TABLES:
 *    - tracked_orders (shopify_order_id, fulfillment_status, ordered_at, store_id)
 *    - products (store_id, status, optimized_description, description_score)
 *    - price_comparisons (product_id, recommendation, checked_at)
 *    - ad_copies (store_id, status)
 *    - monitoring_alerts (store_id, alert_type, severity, message, details, acknowledged, created_at)
 *
 *  USAGE:
 *    import { runDailyCheck, checkOrderHealth, checkProductHealth,
 *             checkAdHealth, getAlerts, acknowledgeAlert } from './store-monitor.js';
 *
 *    // Run full daily health check
 *    const report = await runDailyCheck('my-store');
 *    // Returns: { store, timestamp, red: 2, yellow: 3, green: 1, alerts: [...] }
 *
 *    // Check specific areas
 *    const orderAlerts = await checkOrderHealth('my-store');
 *    const productAlerts = await checkProductHealth('my-store');
 *    const adAlerts = await checkAdHealth('my-store');
 *
 *    // Get recent alerts
 *    const alerts = await getAlerts('my-store', { severity: 'red' });
 *
 *    // Acknowledge an alert
 *    await acknowledgeAlert(alertId);
 *
 *  ALERT SEVERITIES:
 *    red    — critical issues requiring immediate action
 *    yellow — warnings to investigate soon
 *    green  — everything healthy
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import pg from 'pg';

// ─── DATABASE ─────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.warn('[store-monitor] DATABASE_URL is required — all queries will fail without it');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 5,
});

function log(level, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${ts} [${level}] ${msg}`);
}

// ─── DAILY CHECK ──────────────────────────────────────────────────

/**
 * Run the full daily health check — orders, products, and ads.
 *
 * @param {string} storeId — your store identifier
 * @returns {object} — { store, timestamp, red, yellow, green, alerts }
 */
export async function runDailyCheck(storeId) {
  log('info', `Running daily health check for ${storeId}...`);

  const [orderAlerts, productAlerts, adAlerts] = await Promise.all([
    checkOrderHealth(storeId),
    checkProductHealth(storeId),
    checkAdHealth(storeId),
  ]);

  const allAlerts = [...orderAlerts, ...productAlerts, ...adAlerts];

  // Save alerts to DB
  if (allAlerts.length > 0) {
    for (const alert of allAlerts) {
      await pool.query(
        `INSERT INTO monitoring_alerts (store_id, alert_type, severity, message, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [storeId, alert.alert_type, alert.severity, alert.message, JSON.stringify(alert.details)]
      );
    }
  }

  const summary = {
    store: storeId,
    timestamp: new Date().toISOString(),
    red: allAlerts.filter(a => a.severity === 'red').length,
    yellow: allAlerts.filter(a => a.severity === 'yellow').length,
    green: allAlerts.filter(a => a.severity === 'green').length,
    alerts: allAlerts,
  };

  log('info', `Health check complete: ${summary.red} red, ${summary.yellow} yellow, ${summary.green} green`);
  return summary;
}

// ─── ORDER HEALTH ─────────────────────────────────────────────────

/**
 * Check order health — unfulfilled orders, stale shipments.
 *
 * @param {string} storeId
 * @returns {object[]} — array of alert objects
 */
export async function checkOrderHealth(storeId) {
  const alerts = [];
  const now = new Date();
  const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Unfulfilled orders older than 2 days
  const { rows: unfulfilled } = await pool.query(
    `SELECT order_number FROM tracked_orders
     WHERE store_id = $1 AND fulfillment_status = 'unfulfilled' AND ordered_at < $2`,
    [storeId, twoDaysAgo]
  );

  if (unfulfilled.length > 0) {
    alerts.push({
      alert_type: 'order_health',
      severity: unfulfilled.length >= 5 ? 'red' : 'yellow',
      message: `${unfulfilled.length} orders unfulfilled for 2+ days`,
      details: { orders: unfulfilled.slice(0, 5).map(o => o.order_number) },
    });
  }

  // Orders older than 30 days still not fulfilled
  const { rows: stale } = await pool.query(
    `SELECT COUNT(*) as count FROM tracked_orders
     WHERE store_id = $1 AND fulfillment_status != 'fulfilled' AND ordered_at < $2`,
    [storeId, thirtyDaysAgo]
  );

  if (parseInt(stale[0].count) > 0) {
    alerts.push({
      alert_type: 'order_health',
      severity: 'red',
      message: `${stale[0].count} orders older than 30 days still not fulfilled`,
      details: { count: parseInt(stale[0].count) },
    });
  }

  if (alerts.length === 0) {
    alerts.push({ alert_type: 'order_health', severity: 'green', message: 'All orders healthy', details: {} });
  }

  return alerts;
}

// ─── PRODUCT HEALTH ───────────────────────────────────────────────

/**
 * Check product health — unoptimized descriptions, low scores, pricing issues.
 *
 * @param {string} storeId
 * @returns {object[]} — array of alert objects
 */
export async function checkProductHealth(storeId) {
  const alerts = [];

  // Unoptimized products
  const { rows: unopt } = await pool.query(
    `SELECT COUNT(*) as count FROM products
     WHERE store_id = $1 AND status = 'active' AND optimized_description IS NULL`,
    [storeId]
  );

  const unoptimized = parseInt(unopt[0].count);
  if (unoptimized > 0) {
    alerts.push({
      alert_type: 'product_health',
      severity: unoptimized >= 10 ? 'yellow' : 'green',
      message: `${unoptimized} products without optimized descriptions`,
      details: { count: unoptimized },
    });
  }

  // Low-scoring products
  const { rows: lowScored } = await pool.query(
    `SELECT title, description_score FROM products
     WHERE store_id = $1 AND status = 'active' AND description_score < 4`,
    [storeId]
  );

  if (lowScored.length > 0) {
    alerts.push({
      alert_type: 'product_health',
      severity: 'yellow',
      message: `${lowScored.length} products scored below 4/10`,
      details: { products: lowScored.map(p => ({ title: p.title, score: p.description_score })) },
    });
  }

  // Overpriced products (join through products to filter by store)
  const { rows: overpriced } = await pool.query(
    `SELECT COUNT(*) as count FROM price_comparisons pc
     JOIN products p ON pc.product_id = p.id
     WHERE p.store_id = $1 AND pc.recommendation = 'raise'`,
    [storeId]
  );

  if (parseInt(overpriced[0]?.count) > 0) {
    alerts.push({
      alert_type: 'product_health',
      severity: 'yellow',
      message: `${overpriced[0].count} products flagged for price review`,
      details: { count: parseInt(overpriced[0].count) },
    });
  }

  if (alerts.length === 0) {
    alerts.push({ alert_type: 'product_health', severity: 'green', message: 'All products healthy', details: {} });
  }

  return alerts;
}

// ─── AD HEALTH ────────────────────────────────────────────────────

/**
 * Check ad health — no active ads, all paused.
 *
 * @param {string} storeId
 * @returns {object[]} — array of alert objects
 */
export async function checkAdHealth(storeId) {
  const alerts = [];

  const { rows: counts } = await pool.query(
    `SELECT status, COUNT(*) as count FROM ad_copies
     WHERE store_id = $1 GROUP BY status`,
    [storeId]
  );

  const statusMap = {};
  counts.forEach(r => { statusMap[r.status] = parseInt(r.count); });

  const active = statusMap.active || 0;
  const paused = statusMap.paused || 0;
  const total = Object.values(statusMap).reduce((a, b) => a + b, 0);

  if (total === 0) {
    alerts.push({
      alert_type: 'ad_health', severity: 'yellow',
      message: 'No ad copies generated yet', details: {},
    });
  } else if (active === 0 && paused > 0) {
    alerts.push({
      alert_type: 'ad_health', severity: 'yellow',
      message: 'No active ads running — all paused', details: { paused },
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      alert_type: 'ad_health', severity: 'green',
      message: `Ads healthy: ${active} active, ${paused} paused`,
      details: { active, paused },
    });
  }

  return alerts;
}

// ─── GET ALERTS ───────────────────────────────────────────────────

/**
 * Get recent alerts from the database.
 *
 * @param {string} storeId
 * @param {object} options — { severity, acknowledged, limit }
 * @returns {object[]}
 */
export async function getAlerts(storeId, options = {}) {
  const { severity = null, acknowledged = false, limit = 50 } = options;

  let sql = `SELECT * FROM monitoring_alerts WHERE store_id = $1`;
  const params = [storeId];
  let paramIdx = 2;

  if (severity) {
    sql += ` AND severity = $${paramIdx++}`;
    params.push(severity);
  }
  if (!acknowledged) {
    sql += ` AND (acknowledged = false OR acknowledged IS NULL)`;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
  params.push(limit);

  const { rows } = await pool.query(sql, params);
  return rows;
}

// ─── ACKNOWLEDGE ALERT ────────────────────────────────────────────

/**
 * Mark an alert as acknowledged.
 *
 * @param {string|number} alertId
 */
export async function acknowledgeAlert(alertId) {
  const { rows } = await pool.query(
    `UPDATE monitoring_alerts SET acknowledged = true WHERE id = $1 RETURNING *`,
    [alertId]
  );
  return rows[0] || null;
}

export { pool };
