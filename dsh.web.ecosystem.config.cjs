// pm2 app definition for the dsh web host.
//
// Use:
//   pm2 startOrRestart C:\deepseek-harness\dsh.web.ecosystem.config.cjs
//   pm2 describe dsh
//   pm2 logs dsh --lines 50
//
// Secrets: DSH_GITHUB_WEBHOOK_SECRET is read from DSH_WEB_ENV_FILE
// (defaults to ~/.dsh/secret.env, one KEY=VALUE per line) at pm2 start time.
// It is not committed to this file so the webhook HMAC secret stays out of
// git history. Put the same value in the GitHub repo webhook "secret" field.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadEnvFile(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key.length > 0) env[key] = value;
  }
  return env;
}

const secretFile = process.env.DSH_WEB_ENV_FILE || path.join(os.homedir(), '.dsh', 'secret.env');
const fileEnv = loadEnvFile(secretFile);

module.exports = {
  apps: [
    {
      name: 'dsh',
      cwd: 'C:\\deepseek-harness',
      script: 'apps\\cli\\src\\bin.ts',
      interpreter: 'C:\\Users\\amo31\\nodejs\\node.exe',
      node_args: '--import tsx/esm',
      args: 'web --no-open',
      autorestart: true,
      merge_logs: true,
      max_memory_restart: '1G',
      env: {
        DSH_GITHUB_WEBHOOK_SECRET: fileEnv.DSH_GITHUB_WEBHOOK_SECRET || '',
        // Optional overrides (defaults shown in comments):
        // DSH_GITHUB_WEBHOOK_PORT: '3081',
        // DSH_GITHUB_REVIEW_WORKSPACE: 'C:\\deepseek-harness',
      },
    },
  ],
};
