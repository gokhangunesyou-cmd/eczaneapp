#!/usr/bin/env node
/**
 * PreToolUse hook — Bash çağrılarını çalıştırmadan önce denetler.
 *
 * Exit 0  → komut geçer
 * Exit 2  → komut ENGELLENİR, stderr Claude'a geri verilir
 *
 * Engellenenler (CLAUDE.md kuralları):
 *   1. `--remote` içeren wrangler komutları        (prod veriye dokunur)
 *   2. `wrangler d1 delete` ve `wrangler delete`   (geri dönüşü yok)
 *   3. `rm -rf` / `rm -fr` / `rm -r -f`            (toplu silme)
 *   4. `.dev.vars` ve `.env*` üzerinde okuma/yazma (secret'lara dokunma yasağı)
 *   5. `wrangler deploy` (dry-run hariç), `wrangler secret put`, `wrangler versions
 *      deploy`, `wrangler rollback`                (prod deploy kullanıcının işi)
 *
 * Engellenen her komut kullanıcının kendisi tarafından çalıştırılmak üzere
 * Claude'a geri bildirilir.
 *
 * stdin: { tool_name, tool_input: { command, ... }, ... }
 */

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const raw = await readStdin();

let command;
try {
  command = JSON.parse(raw)?.tool_input?.command;
} catch {
  process.exit(0);
}
if (typeof command !== 'string' || command.trim() === '') process.exit(0);

/** Yorum satırlarını at — `# rm -rf yapma` engellenmesin. */
const cmd = command
  .split('\n')
  .map((line) => line.replace(/(^|\s)#.*$/, ''))
  .join('\n');

const SECRET_FILE = String.raw`\.dev\.vars|\.env(\.[A-Za-z0-9_.-]+)?`;

const RULES = [
  {
    id: 'wrangler-remote',
    test: /\bwrangler\b[^\n]*\s--remote\b/,
    reason: '`--remote` bayrağı production Cloudflare kaynaklarına dokunur.',
  },
  {
    id: 'wrangler-delete',
    test: /\bwrangler\b[^\n]*\b(d1|kv|r2|queues|vectorize)?\s*\bdelete\b/,
    reason: 'Cloudflare kaynağı silme geri alınamaz.',
  },
  {
    id: 'wrangler-deploy',
    test: /\bwrangler\b[^\n]*\b(deploy|publish|rollback)\b/,
    predicate: (c) => !/--dry-run\b/.test(c),
    reason: 'Production deploy kullanıcının kendi çalıştıracağı bir iştir.',
  },
  {
    id: 'wrangler-secret',
    test: /\bwrangler\b[^\n]*\bsecret\b[^\n]*\b(put|delete|bulk)\b/,
    reason: 'Secret değerini yalnızca kullanıcı girebilir.',
  },
  {
    id: 'rm-rf',
    test: /\brm\b[^\n]*(\s-[A-Za-z]*r[A-Za-z]*\s*-[A-Za-z]*f|\s-[A-Za-z]*f[A-Za-z]*\s*-[A-Za-z]*r|\s-[A-Za-z]*(rf|fr)[A-Za-z]*)\b/,
    reason: 'Özyinelemeli zorla silme geri alınamaz.',
  },
  {
    id: 'secret-file-write',
    test: new RegExp(
      String.raw`(>>?\s*[^\s|;&]*(${SECRET_FILE})\b` +
        String.raw`|\b(tee|truncate|touch|mv|cp|rm|shred|install)\b[^\n]*(${SECRET_FILE})\b` +
        String.raw`|\bsed\b[^\n]*-i[^\n]*(${SECRET_FILE})\b)`,
    ),
    reason: '`.dev.vars` ve `.env*` dosyalarına yazılamaz, taşınamaz, silinemez.',
  },
  {
    id: 'secret-file-read',
    test: new RegExp(
      String.raw`\b(cat|bat|less|more|head|tail|xxd|od|strings|nl|awk|grep|rg|source|\.)\b[^\n]*(${SECRET_FILE})\b`,
    ),
    reason: '`.dev.vars` ve `.env*` dosyalarının içeriği okunamaz.',
  },
];

const hits = RULES.filter((r) => r.test.test(cmd) && (r.predicate ? r.predicate(cmd) : true));

if (hits.length === 0) process.exit(0);

const lines = [
  'ENGELLENDİ — bu komut proje kuralları gereği çalıştırılamaz.',
  '',
  `  komut: ${command.trim().split('\n')[0].slice(0, 160)}`,
  '',
  ...hits.map((h) => `  • [${h.id}] ${h.reason}`),
  '',
  'Yapılacak: komutu çalıştırmayı deneme, kurala takılmayan bir yol ara.',
  'Gerçekten bu komut gerekiyorsa kullanıcıya söyle, o kendisi çalıştırsın.',
  'Kurallar: CLAUDE.md · Denetim: scripts/guard-bash.mjs',
];

process.stderr.write(lines.join('\n') + '\n');
process.exit(2);
