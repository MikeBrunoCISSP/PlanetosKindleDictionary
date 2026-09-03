import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";

// Connection/queues are created lazily so merely importing this module
// (e.g. from a route in a test) doesn't open a Redis connection.
let connection: Redis | undefined;
let dictionaryBuildQueue: Queue | undefined;
let maintenanceQueue: Queue | undefined;

function getConnection(): Redis {
  // BullMQ requires maxRetriesPerRequest: null on the ioredis connection it's given.
  connection ??= new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
  });
  return connection;
}

export function getDictionaryBuildQueue(): Queue {
  dictionaryBuildQueue ??= new Queue("dictionary-build", { connection: getConnection() });
  return dictionaryBuildQueue;
}

export function getMaintenanceQueue(): Queue {
  maintenanceQueue ??= new Queue("maintenance", { connection: getConnection() });
  return maintenanceQueue;
}

export async function closeQueues(): Promise<void> {
  await dictionaryBuildQueue?.close();
  await maintenanceQueue?.close();
  await connection?.quit();
}
