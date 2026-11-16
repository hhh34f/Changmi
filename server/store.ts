import fs from 'node:fs/promises';
import path from 'node:path';
import type { StoreDatabase, WorkspaceConfig } from '../src/types';
import { DEFAULT_HOURLY_RATE } from '../src/utils/payroll';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'changmi-db.json');

function createSeedDatabase(): StoreDatabase {
  const workspace: WorkspaceConfig = {
    formId: '',
    spreadsheetId: '',
    webhookSecret: 'changmi-2026-secret',
    lastSyncedAt: null,
  };

  return {
    storeName: 'Quán Mì Cay Changmi',
    defaultHourlyRate: DEFAULT_HOURLY_RATE,
    employees: [],
    attendance: [],
    adjustments: [],
    workspace,
  };
}

let writeQueue: Promise<void> = Promise.resolve();

export async function readDatabase(): Promise<StoreDatabase> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as StoreDatabase;
    // Ensure legacy records have attendance status defaulted cleanly
    parsed.attendance = (parsed.attendance ?? []).map((r) => ({
      ...r,
      status: r.status ?? 'present',
    }));
    return parsed;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      const seeded = createSeedDatabase();
      await writeDatabase(seeded);
      return seeded;
    }
    throw err;
  }
}

export async function writeDatabase(data: StoreDatabase): Promise<void> {
  const run = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmpPath = `${DB_PATH}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, DB_PATH);
  });
  writeQueue = run.catch(() => {});
  await run;
}

export async function updateDatabase<T>(
  mutator: (db: StoreDatabase) => T | Promise<T>
): Promise<{ db: StoreDatabase; result: T }> {
  const db = await readDatabase();
  const result = await mutator(db);
  await writeDatabase(db);
  return { db, result };
}
