#!/usr/bin/env node
/**
 * PostToolUse hook — Write|Edit sonrası çalışır.
 *
 * Yazılan dosyayı prettier ile biçimlendirir, JS/TS ise eslint --fix uygular.
 * Biçimlendirme hiçbir koşulda tool çağrısını engellemez: her yoldan exit 0.
 * Hata olursa stderr'e yazar, Claude görür ama iş durmaz.
 *
 * stdin: { tool_name, tool_input: { file_path, ... }, ... }
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

/** Bu dosyalara asla dokunulmaz — CLAUDE.md kuralı. */
const FORBIDDEN = /(^|\/)(\.dev\.vars|\.env(\.[^/]*)?)$/;

const PRETTIER_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css|md|ya?ml|html)$/i;
const ESLINT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

/** Üretilen dosyalar biçimlendirilmez; kaynağı değişince yeniden üretilirler. */
const GENERATED = [/src\/shared\/api-types\.d\.ts$/, /^dist\//, /^node_modules\//];

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function bin(name) {
  const p = path.join(PROJECT_ROOT, 'node_modules', '.bin', name);
  return existsSync(p) ? p : null;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: PROJECT_ROOT, encoding: 'utf8' });
  if (r.status !== 0 && r.stderr) {
    process.stderr.write(`[format-fix] ${path.basename(cmd)}: ${r.stderr.trim()}\n`);
  }
}

const raw = await readStdin();

let filePath;
try {
  filePath = JSON.parse(raw)?.tool_input?.file_path;
} catch {
  process.exit(0); // gövde beklenen şekilde değilse sessizce çık
}

if (!filePath) process.exit(0);

const abs = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
const rel = path.relative(PROJECT_ROOT, abs);

if (FORBIDDEN.test(rel)) process.exit(0);
if (GENERATED.some((re) => re.test(rel))) process.exit(0);
if (rel.startsWith('..')) process.exit(0); // proje dışı
if (!existsSync(abs)) process.exit(0);
if (!PRETTIER_EXT.test(abs)) process.exit(0);

// Bağımlılıklar henüz kurulmadıysa hiçbir şey yapma (npx ile indirmeye kalkma).
const prettier = bin('prettier');
if (!prettier) process.exit(0);

run(prettier, ['--write', '--log-level', 'warn', abs]);

if (ESLINT_EXT.test(abs)) {
  const eslint = bin('eslint');
  if (eslint) run(eslint, ['--fix', '--no-warn-ignored', abs]);
}

process.exit(0);
