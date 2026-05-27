/**
 * Configuration loader for Multiple MySQL MCP server
 * Supports loading instance configurations from a JSON file
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MultiMySQLConfig, MySQLInstanceConfig } from './types.js';

const DEFAULT_PORT = 3306;

/**
 * Load configuration from a JSON file
 * The file path is specified via the MYSQL_CONFIG_FILE environment variable
 */
export function loadConfig(): MySQLInstanceConfig[] {
  const configFilePath = process.env.MYSQL_CONFIG_FILE;

  if (!configFilePath) {
    throw new Error(
      'MYSQL_CONFIG_FILE environment variable is required. ' +
      'It should point to a JSON file containing MySQL instance configurations.'
    );
  }

  const absolutePath = resolve(configFilePath);
  console.error(`[Config] Loading configuration from: ${absolutePath}`);

  let fileContent: string;
  try {
    fileContent = readFileSync(absolutePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read config file "${absolutePath}": ${(error as Error).message}`);
  }

  let config: MultiMySQLConfig;
  try {
    config = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Failed to parse config file "${absolutePath}": ${(error as Error).message}`);
  }

  // Validate config structure
  if (!config.instances || !Array.isArray(config.instances)) {
    throw new Error('Config file must contain an "instances" array');
  }

  if (config.instances.length === 0) {
    throw new Error('Config file must contain at least one instance');
  }

  // Validate and normalize each instance
  const names = new Set<string>();
  const instances: MySQLInstanceConfig[] = [];

  for (let i = 0; i < config.instances.length; i++) {
    const inst = config.instances[i];

    if (!inst.name || typeof inst.name !== 'string') {
      throw new Error(`Instance at index ${i} must have a "name" field`);
    }

    if (names.has(inst.name)) {
      throw new Error(`Duplicate instance name: "${inst.name}"`);
    }
    names.add(inst.name);

    if (!inst.host || typeof inst.host !== 'string') {
      throw new Error(`Instance "${inst.name}" must have a "host" field`);
    }

    if (!inst.user || typeof inst.user !== 'string') {
      throw new Error(`Instance "${inst.name}" must have a "user" field`);
    }

    instances.push({
      name: inst.name,
      description: inst.description,
      host: inst.host,
      port: inst.port ?? DEFAULT_PORT,
      user: inst.user,
      password: inst.password,
      database: inst.database,
      connectionLimit: inst.connectionLimit,
      queueLimit: inst.queueLimit,
      connectTimeout: inst.connectTimeout,
      idleTimeout: inst.idleTimeout,
      maxIdle: inst.maxIdle,
    });
  }

  console.error(`[Config] Loaded ${instances.length} instance(s): ${instances.map(i => i.name).join(', ')}`);
  return instances;
}
