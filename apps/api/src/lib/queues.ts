import { Queue } from "bullmq";
import { Redis } from "ioredis";

// Lazily initialized for the same reason as apps/api/src/lib/storage.ts:
// a module-top-level process.env read in an ESM module can run before
// index.ts's/worker.ts's own dotenv.config() call takes effect.
let connection: Redis | undefined;
let dictionaryBuildQueue: Queue | undefined;
let maintenanceQueue: Queue | undefined;

function getConnection(): Redis {
  // BullMQ requires maxRetriesPerRequest: null on the ioredis connection it's given.
  connection ??= new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
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
