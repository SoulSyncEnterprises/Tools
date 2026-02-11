/**
 * PostgreSQL + Drizzle ORM Integration (Standalone)
 *
 * ABOUT:
 *   Drizzle ORM is a lightweight, type-safe TypeScript ORM for SQL databases.
 *   Combined with PostgreSQL, it gives you a fully type-checked database layer
 *   where your queries, inserts, and schema are all validated at compile time —
 *   meaning you catch errors before your code even runs. This tool sets up the
 *   database connection, defines table schemas (users, API credentials, etc.),
 *   auto-generates TypeScript types and Zod validation schemas from your tables,
 *   and provides ready-to-use CRUD helper functions. It also includes the
 *   drizzle-kit config for syncing your schema to the database with one command.
 *
 * USE CASES:
 *   - Type-safe database queries in TypeScript projects
 *   - Store users, credentials, logs, and app data in PostgreSQL
 *   - Auto-generate insert/select types from your schema
 *   - Validate API request bodies using Zod schemas derived from your tables
 *   - Sync schema changes to your database without writing SQL migrations
 *
 * DEPENDENCIES:
 *   npm install drizzle-orm postgres drizzle-zod zod
 *   npm install -D drizzle-kit
 *
 * ENVIRONMENT VARIABLES:
 *   DATABASE_URL  - PostgreSQL connection string
 *                   (e.g. postgresql://user:pass@host:5432/dbname?sslmode=require)
 *
 * SETUP:
 *   1. Define your schema (see example below)
 *   2. Run `npx drizzle-kit push` to sync schema to database
 *   3. Use the `db` object for queries
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pgTable, text, varchar, timestamp, jsonb, boolean, integer, decimal } from 'drizzle-orm/pg-core';
import { sql, eq, and } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// ─── Database Connection ─────────────────────────────────────────────────────

export interface DatabaseConfig {
  connectionString: string;
  ssl?: boolean;          // Default: true
  maxConnections?: number; // Default: 1
  idleTimeout?: number;    // Default: 20
  connectTimeout?: number; // Default: 60
}

/**
 * Create a database connection and Drizzle instance
 */
export function createDatabase(config: DatabaseConfig) {
  const client = postgres(config.connectionString, {
    ssl: config.ssl !== false ? 'require' : undefined,
    max: config.maxConnections || 1,
    idle_timeout: config.idleTimeout || 20,
    connect_timeout: config.connectTimeout || 60,
  });

  const db = drizzle(client);

  return { client, db };
}

// ─── Example Schema ──────────────────────────────────────────────────────────
// Copy and modify these table definitions for your own project

export const users = pgTable('users', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const apiCredentials = pgTable('api_credentials', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar('user_id').references(() => users.id).notNull(),
  service: text('service').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  encryptedSecret: text('encrypted_secret'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Generated Types & Schemas ───────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertApiCredentialSchema = createInsertSchema(apiCredentials).omit({ id: true, createdAt: true, updatedAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type ApiCredential = typeof apiCredentials.$inferSelect;
export type InsertApiCredential = z.infer<typeof insertApiCredentialSchema>;

// ─── CRUD Helpers ────────────────────────────────────────────────────────────

/**
 * Example CRUD operations using Drizzle ORM
 * These show the patterns you'd use in your own project
 */
export function createCrudHelpers(db: ReturnType<typeof drizzle>) {
  return {
    // Users
    async createUser(data: InsertUser) {
      const [user] = await db.insert(users).values(data).returning();
      return user;
    },

    async getUserById(id: string) {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return user || null;
    },

    async getUserByEmail(email: string) {
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return user || null;
    },

    // API Credentials
    async storeCredential(data: InsertApiCredential) {
      const [cred] = await db.insert(apiCredentials).values(data).returning();
      return cred;
    },

    async getCredentials(userId: string, service?: string) {
      let query = db.select().from(apiCredentials).where(
        service
          ? and(eq(apiCredentials.userId, userId), eq(apiCredentials.service, service))
          : eq(apiCredentials.userId, userId)
      );
      return query;
    },
  };
}

// ─── Drizzle Kit Config ──────────────────────────────────────────────────────
/*
Create a file called `drizzle.config.ts` in your project root:

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './your-schema-file.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

Then run: npx drizzle-kit push
*/

// ─── Usage Example ───────────────────────────────────────────────────────────
/*
// Connect to database
const { db } = createDatabase({
  connectionString: process.env.DATABASE_URL!,
});

// Create CRUD helpers
const crud = createCrudHelpers(db);

// Create a user
const user = await crud.createUser({
  username: 'johndoe',
  name: 'John Doe',
  email: 'john@example.com',
  password: 'hashed_password_here',
  updatedAt: new Date(),
});

// Store encrypted API credentials
await crud.storeCredential({
  userId: user.id,
  service: 'spotify',
  encryptedKey: 'encrypted_client_id',
  encryptedSecret: 'encrypted_client_secret',
});

// Query credentials
const spotifyCreds = await crud.getCredentials(user.id, 'spotify');
console.log('Spotify credentials:', spotifyCreds);

// Direct Drizzle queries (for custom operations)
const allUsers = await db.select().from(users);
*/
