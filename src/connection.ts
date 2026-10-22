/**
 * MySQL connection management for Multiple MySQL MCP server
 * Manages connection pools for multiple MySQL instances
 */

import mysql from 'mysql2/promise';
import { MySQLInstanceConfig } from './types.js';

const DEFAULT_PORT = 3306;
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_CONNECTION_LIMIT = 10;
const DEFAULT_QUEUE_LIMIT = 0;
const DEFAULT_ROW_LIMIT = 1000;

// Map of instance name -> connection pool
const pools: Map<string, mysql.Pool> = new Map();

/**
 * Create a MySQL connection pool for a given instance config
 */
export function createConnectionPool(config: MySQLInstanceConfig): mysql.Pool {
  console.error(`[Setup] Creating MySQL connection pool for instance: ${config.name}`);

  try {
    const poolConfig: mysql.PoolOptions = {
      host: config.host,
      port: config.port ?? DEFAULT_PORT,
      user: config.user,
      waitForConnections: true,
      connectionLimit: config.connectionLimit ?? DEFAULT_CONNECTION_LIMIT,
      queueLimit: config.queueLimit ?? DEFAULT_QUEUE_LIMIT,
      connectTimeout: config.connectTimeout ?? DEFAULT_TIMEOUT,
      dateStrings: true,
    };

    if (config.password !== undefined) {
      poolConfig.password = config.password;
    }

    if (config.database) {
      poolConfig.database = config.database;
    }

    if (config.idleTimeout !== undefined) {
      poolConfig.idleTimeout = config.idleTimeout;
    }

    if (config.maxIdle !== undefined) {
      poolConfig.maxIdle = config.maxIdle;
    }

    return mysql.createPool(poolConfig);
  } catch (error) {
    console.error(`[Error] Failed to create connection pool for instance ${config.name}:`, error);
    throw error;
  }
}

/**
 * Initialize all connection pools from config
 * If one instance fails to create a pool, it is skipped and others continue.
 */
export function initializePools(instances: MySQLInstanceConfig[]): void {
  for (const instance of instances) {
    try {
      const pool = createConnectionPool(instance);
      pools.set(instance.name, pool);
      console.error(`[Setup] Pool created for instance: ${instance.name} (${instance.host}:${instance.port})`);
    } catch (error) {
      console.error(`[Warning] Failed to create pool for instance "${instance.name}", skipping:`, error);
    }
  }

  if (pools.size === 0) {
    throw new Error('No MySQL instance pools were successfully created');
  }
}

/**
 * Get a connection pool by instance name
 */
export function getPool(instanceName: string): mysql.Pool {
  const pool = pools.get(instanceName);
  if (!pool) {
    throw new Error(`Unknown instance: "${instanceName}". Use list_instances to see available instances.`);
  }
  return pool;
}

/**
 * Get all instance names
 */
export function getInstanceNames(): string[] {
  return Array.from(pools.keys());
}

const HEALTH_CHECK_TIMEOUT = 3000; // 3 seconds for availability check

/**
 * Check if a pool is available by attempting to get a connection with a short timeout
 */
export async function isPoolAvailable(pool: mysql.Pool): Promise<boolean> {
  try {
    const connection = await Promise.race([
      pool.getConnection(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_TIMEOUT)
      ),
    ]);
    connection.release();
    return true;
  } catch {
    return false;
  }
}

/**
 * Close all connection pools
 */
export async function closeAllPools(): Promise<void> {
  for (const [name, pool] of pools.entries()) {
    console.error(`[Shutdown] Closing pool for instance: ${name}`);
    await pool.end();
  }
  pools.clear();
}

/**
 * Execute a query on a specific instance with error handling and logging
 */
export async function executeQuery(
  pool: mysql.Pool,
  sql: string,
  params: any[] = [],
  database?: string,
  timezone?: string
): Promise<{ rows: any; fields: mysql.FieldPacket[] }> {
  console.error(`[Query] Executing: ${sql}`);

  let connection: mysql.PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    // Enforce read-only at the session level
    await connection.query(`SET SESSION TRANSACTION READ ONLY`);

    if (timezone) {
      console.error(`[Query] Setting session time_zone = '${timezone}'`);
      await connection.query(`SET time_zone = ?`, [timezone]);
    }

    if (database) {
      console.error(`[Query] Using database: ${database}`);
      await connection.query(`USE \`${database}\``);
    }

    const [rows, fields] = await Promise.race([
      connection.query(sql, params),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), DEFAULT_TIMEOUT);
      }),
    ]);

    const limitedRows = Array.isArray(rows) && rows.length > DEFAULT_ROW_LIMIT
      ? rows.slice(0, DEFAULT_ROW_LIMIT)
      : rows;

    console.error(`[Query] Success: ${Array.isArray(rows) ? rows.length : 1} rows returned`);

    return { rows: limitedRows, fields };
  } catch (error) {
    console.error('[Error] Query execution failed:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
