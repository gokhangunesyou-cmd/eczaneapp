import { DatabaseSync, StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface SqliteD1Meta {
  changes: number;
  last_row_id: number;
  [key: string]: unknown;
}

export interface SqliteD1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: SqliteD1Meta;
}

export class SqlitePreparedStatement {
  private stmt: StatementSync;
  private boundValues: unknown[] = [];

  constructor(
    private rawDb: DatabaseSync,
    private sql: string,
    boundValues: unknown[] = [],
  ) {
    this.stmt = rawDb.prepare(sql);
    this.boundValues = boundValues;
  }

  bind(...values: unknown[]): SqlitePreparedStatement {
    return new SqlitePreparedStatement(this.rawDb, this.sql, values);
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const row = this.stmt.get(...(this.boundValues as any[])) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) {
      return (row[colName] ?? null) as T;
    }
    return { ...row } as T;
  }

  async all<T = Record<string, unknown>>(): Promise<SqliteD1Result<T>> {
    const rows = this.stmt.all(...(this.boundValues as any[])) as Record<string, unknown>[];
    return {
      results: rows.map((r) => ({ ...r })) as T[],
      success: true,
      meta: { changes: 0, last_row_id: 0 },
    };
  }

  async run<T = Record<string, unknown>>(): Promise<SqliteD1Result<T>> {
    const res = this.stmt.run(...(this.boundValues as any[]));
    return {
      results: [] as T[],
      success: true,
      meta: {
        changes: res.changes,
        last_row_id: Number(res.lastInsertRowid),
      },
    };
  }

  // Internal execution method for batch transactions
  _execute(): SqliteD1Result<any> {
    const trimmed = this.sql.trim().toUpperCase();
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA')) {
      const rows = this.stmt.all(...(this.boundValues as any[])) as Record<string, unknown>[];
      return {
        results: rows.map((r) => ({ ...r })),
        success: true,
        meta: { changes: 0, last_row_id: 0 },
      };
    } else {
      const res = this.stmt.run(...(this.boundValues as any[]));
      return {
        results: [],
        success: true,
        meta: {
          changes: res.changes,
          last_row_id: Number(res.lastInsertRowid),
        },
      };
    }
  }
}

export class SqliteD1Adapter {
  constructor(private rawDb: DatabaseSync) {}

  prepare(sql: string): SqlitePreparedStatement {
    return new SqlitePreparedStatement(this.rawDb, sql);
  }

  async batch<T = unknown>(statements: SqlitePreparedStatement[]): Promise<SqliteD1Result<T>[]> {
    this.rawDb.exec('BEGIN TRANSACTION');
    try {
      const results: SqliteD1Result<T>[] = [];
      for (const stmt of statements) {
        results.push(stmt._execute() as SqliteD1Result<T>);
      }
      this.rawDb.exec('COMMIT');
      return results;
    } catch (err) {
      try {
        this.rawDb.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    const start = Date.now();
    this.rawDb.exec(sql);
    return {
      count: 1,
      duration: Date.now() - start,
    };
  }
}

/**
 * Otomatik veritabanı migration mekanizması.
 * migrations/ dizinindeki *.sql dosyalarını sırayla okur ve henüz uygulanmamış olanları çalıştırır.
 */
export function applyMigrations(rawDb: DatabaseSync, migrationsDir: string) {
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  if (!fs.existsSync(migrationsDir)) {
    console.warn(`Migrations dizini bulunamadı: ${migrationsDir}`);
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const getStmt = rawDb.prepare('SELECT id FROM _migrations WHERE name = ?');
  const insertStmt = rawDb.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of files) {
    const alreadyApplied = getStmt.get(file);
    if (!alreadyApplied) {
      console.log(`[Migration] Çalıştırılıyor: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      rawDb.exec('BEGIN TRANSACTION');
      try {
        rawDb.exec(sql);
        insertStmt.run(file);
        rawDb.exec('COMMIT');
        console.log(`[Migration] Tamamlandı: ${file}`);
      } catch (err) {
        try {
          rawDb.exec('ROLLBACK');
        } catch {
          // ignore
        }
        console.error(`[Migration] HATA (${file}):`, err);
        throw err;
      }
    }
  }
}

/**
 * SQLite veritabanı bağlantısı ve D1 uyumlu adaptör oluşturur.
 */
export function createSqliteDb(dbPath: string, migrationsDir: string) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const rawDb = new DatabaseSync(dbPath);
  rawDb.exec('PRAGMA journal_mode = WAL;');
  rawDb.exec('PRAGMA foreign_keys = ON;');

  applyMigrations(rawDb, migrationsDir);

  return new SqliteD1Adapter(rawDb);
}
