/**
 * ═══════════════════════════════════════════════════════════════════
 *  CRON SCHEDULER — Automated Job Orchestration Framework
 * ═══════════════════════════════════════════════════════════════════
 *
 *  A lightweight cron scheduler framework for running e-commerce
 *  automation tasks on a schedule. Register jobs, start/stop the
 *  scheduler, manually trigger jobs, and log results.
 *
 *  REQUIRED PACKAGES:
 *    npm install cron dotenv
 *
 *  OPTIONAL ENV VARS:
 *    TIMEZONE=America/New_York         (default timezone for cron)
 *    DATABASE_URL=postgresql://...     (for logging to DB)
 *    DATABASE_SSL=true|false
 *
 *  USAGE:
 *    import { registerJob, startScheduler, stopScheduler,
 *             getSchedulerStatus, runJobNow } from './cron-scheduler.js';
 *
 *    // Register jobs with cron expressions
 *    registerJob('Product Sync', '0 *\/6 * * *', async () => {
 *      // Runs every 6 hours
 *      const result = await syncProducts();
 *      return { synced: result.length };
 *    });
 *
 *    registerJob('Daily Health Check', '30 6 * * *', async () => {
 *      // Runs daily at 6:30 AM
 *      return await runDailyCheck();
 *    });
 *
 *    registerJob('Weekly Price Sweep', '0 5 * * 1', async () => {
 *      // Runs every Monday at 5 AM
 *      return await compareAllPrices();
 *    });
 *
 *    // Start all registered jobs
 *    startScheduler();
 *
 *    // Check status of all jobs
 *    const status = getSchedulerStatus();
 *    // Returns: [{ name, schedule, running, next_run }]
 *
 *    // Manually trigger a job
 *    await runJobNow('Product Sync');
 *
 *    // Stop all jobs
 *    stopScheduler();
 *
 *  CRON EXPRESSION CHEAT SHEET:
 *    ┌──────── second (0-59) [optional]
 *    │ ┌────── minute (0-59)
 *    │ │ ┌──── hour (0-23)
 *    │ │ │ ┌── day of month (1-31)
 *    │ │ │ │ ┌ month (1-12)
 *    │ │ │ │ │ ┌ day of week (0-7, Sun=0 or 7)
 *    │ │ │ │ │ │
 *    * * * * * *
 *
 *    Examples:
 *    '0 6 * * *'      — Daily at 6:00 AM
 *    '30 6 * * *'     — Daily at 6:30 AM
 *    '0 *\/6 * * *'   — Every 6 hours
 *    '0 *\/12 * * *'  — Every 12 hours
 *    '0 5 * * 1'      — Every Monday at 5 AM
 *    '0 9 1 * *'      — 1st of every month at 9 AM
 *    '0 21 * * *'     — Daily at 9 PM
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import { CronJob } from 'cron';

// ─── CONFIG ───────────────────────────────────────────────────────

const TIMEZONE = process.env.TIMEZONE || 'America/New_York';

// Optional: database logging (pg pool)
let pool = null;
if (process.env.DATABASE_URL) {
  const pg = await import('pg');
  pool = new pg.default.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 3,
  });
}

function log(level, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${ts} [${level}] ${msg}`);
}

// ─── JOB REGISTRY ─────────────────────────────────────────────────

const jobs = [];

/**
 * Register a cron job.
 *
 * @param {string} name — human-readable job name
 * @param {string} cronTime — cron expression (e.g., '0 6 * * *')
 * @param {Function} task — async function to execute
 */
export function registerJob(name, cronTime, task) {
  const job = new CronJob(cronTime, async () => {
    const startTime = Date.now();
    log('info', `[CRON] Starting: ${name}`);

    try {
      const result = await task();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      log('info', `[CRON] Completed: ${name} (${duration}s)`);

      // Optional DB logging
      if (pool) {
        await pool.query(
          `INSERT INTO automation_logs (task_name, status, duration_seconds, result_summary)
           VALUES ($1, $2, $3, $4)`,
          [name, 'success', parseFloat(duration),
           typeof result === 'object' ? JSON.stringify(result).substring(0, 1000) : String(result)]
        ).catch(() => {});
      }

      return result;
    } catch (err) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      log('error', `[CRON] Failed: ${name} (${duration}s) — ${err.message}`);

      if (pool) {
        await pool.query(
          `INSERT INTO automation_logs (task_name, status, duration_seconds, error)
           VALUES ($1, $2, $3, $4)`,
          [name, 'failed', parseFloat(duration), err.message]
        ).catch(() => {});
      }
    }
  }, null, false, TIMEZONE);

  jobs.push({ name, cronTime, job, task });
  return job;
}

// ─── SCHEDULER CONTROL ────────────────────────────────────────────

/**
 * Start all registered jobs.
 */
export function startScheduler() {
  log('info', `\nStarting Scheduler — ${jobs.length} jobs registered:`);
  jobs.forEach(({ name, cronTime }) => {
    log('info', `  ${name.padEnd(35)} ${cronTime}`);
  });
  log('info', '');

  jobs.forEach(({ job }) => job.start());
}

/**
 * Stop all running jobs.
 */
export function stopScheduler() {
  jobs.forEach(({ name, job }) => {
    job.stop();
    log('info', `Stopped: ${name}`);
  });
}

/**
 * Get status of all registered jobs.
 *
 * @returns {object[]} — [{ name, schedule, running, next_run }]
 */
export function getSchedulerStatus() {
  return jobs.map(({ name, cronTime, job }) => ({
    name,
    schedule: cronTime,
    running: job.running,
    next_run: job.nextDate()?.toISO() || null,
  }));
}

/**
 * Manually trigger a job by name (partial match supported).
 *
 * @param {string} jobName — full or partial job name
 */
export async function runJobNow(jobName) {
  const found = jobs.find(j => j.name.toLowerCase().includes(jobName.toLowerCase()));
  if (!found) {
    throw new Error(`Job not found: ${jobName}. Available: ${jobs.map(j => j.name).join(', ')}`);
  }

  log('info', `Manual trigger: ${found.name}`);
  return found.task();
}

export { jobs };
