#!/usr/bin/env node
/**
 * paydirt · gtm-docs — guided Vercel deploy (Phase 1 deploy story, spec D16 door b).
 *
 * Hand-holds the whole path:
 *   1/5 check the Vercel CLI exists and is authenticated
 *   2/5 confirm the project name and link apps/gtm-docs to it
 *   3/5 environment variables — none required for Phase 1 (read-only docs);
 *       optional ones can be set here, values never echoed
 *   4/5 `vercel deploy --prod`
 *   5/5 verify the live URL answers on /docs, then print next steps
 *
 * Safety rules (repo-wide, binding):
 * - The only outbound HTTP this script makes is the step-5 verification, to
 *   the public https deployment URL the Vercel CLI just returned. The host is
 *   validated twice before the request: as a string (scheme, localhost,
 *   `*.local`, IPv4/IPv6 literal ranges) and again after DNS resolution
 *   (loopback / private / link-local / reserved addresses are refused).
 * - Credential VALUES are never printed, logged, or stored. Interactive env
 *   var values are read with echo disabled and piped straight to the Vercel
 *   CLI's stdin. Vercel auth itself lives in the CLI's own config.
 * - Every failure mode exits non-zero with a clear next step.
 *
 * Offline self-test of the URL guard (no network, no side effects):
 *   node scripts/deploy.mjs --self-test-url-guard
 */

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import dns from 'node:dns/promises';
import https from 'node:https';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY_PATH = '/docs';
const VERIFY_TIMEOUT_MS = 30_000;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

/* ------------------------------------------------------------------ */
/* URL guard — shared by the deploy run and the offline self-test      */
/* ------------------------------------------------------------------ */

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function ipv4ToLong(ip) {
  const parts = ip.split('.').map(Number);
  // eslint-disable-next-line no-bitwise -- address math, not flags
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function ipv4InCidr(ip, base, bits) {
  // eslint-disable-next-line no-bitwise -- address math, not flags
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(base) & mask);
}

// Loopback / private / link-local / reserved IPv4 space — all refused.
const IPV4_BLOCKED = [
  ['0.0.0.0', 8], // unspecified + "this network"
  ['10.0.0.0', 8], // private
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. cloud metadata endpoints)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1 (documentation)
  ['192.88.99.0', 24], // 6to4 relay anycast (deprecated)
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2 (documentation)
  ['203.0.113.0', 24], // TEST-NET-3 (documentation)
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved (incl. 255.255.255.255 broadcast)
];

function isBlockedIpv4(ip) {
  return IPV4_BLOCKED.some(([base, bits]) => ipv4InCidr(ip, base, bits));
}

/** Parse an IPv6 literal to a 128-bit BigInt, or null when unparseable. */
function parseIpv6(raw) {
  const s = raw.replace(/^\[/, '').replace(/\]$/, '');
  if (!s.includes(':')) return null;
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const expandV4 = (groups) => {
    const out = [];
    for (const g of groups) {
      if (g.includes('.')) {
        const octets = g.split('.').map(Number);
        if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
        out.push(((octets[0] << 8) | octets[1]).toString(16));
        out.push(((octets[2] << 8) | octets[3]).toString(16));
      } else {
        out.push(g);
      }
    }
    return out;
  };
  const head = halves.length === 2 ? expandV4(halves[0] ? halves[0].split(':') : []) : expandV4(s.split(':'));
  const tail = halves.length === 2 ? expandV4(halves[1] ? halves[1].split(':') : []) : [];
  if (head === null || tail === null) return null;
  const missing = 8 - (head.length + tail.length);
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = halves.length === 2 ? [...head, ...Array(missing).fill('0'), ...tail] : head;
  let value = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    value = (value << 16n) | BigInt(Number.parseInt(g, 16));
  }
  return value;
}

const IPV6_BLOCKED = [
  [parseIpv6('::'), 128], // unspecified
  [parseIpv6('::1'), 128], // loopback
  [parseIpv6('fc00::'), 7], // unique-local
  [parseIpv6('fe80::'), 10], // link-local
  [parseIpv6('ff00::'), 8], // multicast
  [parseIpv6('2001:db8::'), 32], // documentation
];

function isBlockedIpv6(value) {
  if (value === null) return true;
  // IPv4-mapped (::ffff:a.b.c.d): judge the embedded IPv4 instead.
  if ((value >> 32n) === 0xffffn) {
    const low = Number(value & 0xffffffffn);
    const dotted = [(low >>> 24) & 255, (low >>> 16) & 255, (low >>> 8) & 255, low & 255].join('.');
    return isBlockedIpv4(dotted);
  }
  return IPV6_BLOCKED.some(([prefix, bits]) => {
    const shift = BigInt(128 - bits);
    return (value >> shift) === (prefix >> shift);
  });
}

/**
 * Validate a hostname string. Returns null when acceptable, or a reason.
 * DNS names are accepted here and their resolved addresses are checked
 * separately before any request (see resolvedAddressesArePublic).
 */
function checkHostname(rawHost) {
  if (!rawHost) return 'empty hostname';
  const host = rawHost.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return `refusing local hostname "${rawHost}"`;
  }
  if (IPV4_RE.test(host)) {
    if (host.split('.').some((part) => Number(part) > 255)) return `invalid IPv4 literal "${rawHost}"`;
    return isBlockedIpv4(host) ? `refusing non-public IPv4 address ${rawHost}` : null;
  }
  if (host.includes(':')) {
    return isBlockedIpv6(parseIpv6(host)) ? `refusing non-public IPv6 address ${rawHost}` : null;
  }
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(host) && !/^[a-z0-9]+$/.test(host)) {
    return `invalid hostname "${rawHost}"`;
  }
  return null;
}

/**
 * Validate a deployment URL before any request is made to it.
 * https-only; no embedded credentials; hostname passes checkHostname.
 * Returns { url } or { error }.
 */
function validateDeployUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: `"${raw}" is not a valid URL` };
  }
  if (url.protocol !== 'https:') return { error: `refusing non-https URL "${raw}" — https only` };
  if (url.username || url.password) return { error: 'refusing URL with embedded credentials' };
  const hostProblem = checkHostname(url.hostname);
  if (hostProblem) return { error: hostProblem };
  return { url };
}

/** Resolve a hostname and refuse unless every address is public. */
async function resolvedAddressesArePublic(hostname) {
  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    return { error: `DNS lookup failed for ${hostname} (${err.code ?? err.message})` };
  }
  if (records.length === 0) return { error: `${hostname} resolved to no addresses` };
  for (const { address, family } of records) {
    const blocked = family === 4 ? isBlockedIpv4(address) : isBlockedIpv6(parseIpv6(address));
    if (blocked) return { error: `${hostname} resolves to non-public address ${address} — refusing` };
  }
  return { records };
}

/** GET a URL and resolve with { status } or { error }. 2xx/3xx is success. */
function httpsStatus(url, timeoutMs) {
  return new Promise((settle) => {
    const req = https.request(
      url,
      { method: 'GET', timeout: timeoutMs, headers: { 'user-agent': 'paydirt-gtm-docs-deploy-verify' } },
      (res) => {
        res.resume(); // drain the body
        settle({ status: res.statusCode ?? 0 });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`no response within ${timeoutMs}ms`)));
    req.on('error', (err) => settle({ error: err.message }));
    req.end();
  });
}

/* ------------------------------------------------------------------ */
/* Offline self-test — proves the URL guard rejects unsafe targets     */
/* ------------------------------------------------------------------ */

function selfTestUrlGuard() {
  const mustReject = [
    'http://gtm-docs.vercel.app', // non-https scheme
    'https://localhost/docs',
    'https://localhost:3000/docs',
    'https://app.local/docs',
    'https://127.0.0.1/docs',
    'https://127.8.8.8/docs', // loopback /8
    'https://0.0.0.0/docs',
    'https://10.1.2.3/docs',
    'https://172.16.0.9/docs',
    'https://172.31.255.255/docs',
    'https://192.168.1.4/docs',
    'https://169.254.169.254/docs', // link-local (cloud metadata)
    'https://192.0.2.10/docs', // TEST-NET-1
    'https://198.51.100.7/docs', // TEST-NET-2
    'https://203.0.113.7/docs', // TEST-NET-3
    'https://224.0.0.1/docs', // multicast
    'https://240.0.0.1/docs', // reserved
    'https://[::1]/docs',
    'https://[::]/docs',
    'https://[fe80::1]/docs',
    'https://[fc00::1]/docs',
    'https://[fd12::345]/docs',
    'https://[ff02::1]/docs',
    'https://[2001:db8::5]/docs',
    'https://[::ffff:192.168.0.1]/docs', // IPv4-mapped private
    'https://user:secret@gtm-docs.vercel.app', // embedded credentials
    'not a url',
  ];
  const mustAccept = [
    'https://gtm-docs.vercel.app',
    'https://gtm-docs-abc123.vercel.app/docs',
    'https://docs.example.com/docs',
    'https://8.8.8.8/', // public IP literal — allowed by address class
  ];
  let failed = 0;
  for (const raw of mustReject) {
    const { error } = validateDeployUrl(raw);
    if (!error) {
      failed += 1;
      console.error(`FAIL — should have rejected: ${raw}`);
    }
  }
  for (const raw of mustAccept) {
    const { error } = validateDeployUrl(raw);
    if (error) {
      failed += 1;
      console.error(`FAIL — should have accepted: ${raw} (${error})`);
    }
  }
  const total = mustReject.length + mustAccept.length;
  if (failed > 0) {
    console.error(`url-guard self-test: ${failed}/${total} cases failed`);
    return 1;
  }
  console.log(`url-guard self-test: ${total}/${total} cases passed`);
  return 0;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

function step(message) {
  console.log(`\n==> ${message}`);
}

function info(message) {
  console.log(`    ${message}`);
}

/** Print a failure with guidance and exit non-zero. */
function fail(message, guidance) {
  console.error(`\n✗ ${message}`);
  if (guidance) {
    console.error(`  Next step: ${guidance}`);
  }
  process.exit(1);
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: APP_ROOT, encoding: 'utf8', ...options });
  return {
    code: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    error: result.error,
  };
}

function ask(rl, question) {
  return new Promise((resolveAnswer) => {
    rl.question(question, (answer) => resolveAnswer(answer.trim()));
  });
}

async function confirm(rl, question, fallback = true) {
  const suffix = fallback ? '[Y/n]' : '[y/N]';
  const answer = await ask(rl, `${question} ${suffix} `);
  if (answer === '') return fallback;
  return /^[yY]/.test(answer);
}

/**
 * Ask for a secret value without echoing it. The value exists only in the
 * returned string and is piped straight to the Vercel CLI — never printed,
 * logged, or written anywhere.
 */
function askHidden(rl, prompt) {
  return new Promise((resolveAnswer) => {
    const original = rl._writeToOutput.bind(rl);
    rl._writeToOutput = () => {}; // mute the echo — values are never displayed
    rl.question(prompt, (answer) => {
      rl._writeToOutput = original;
      rl.write('\n');
      resolveAnswer(answer.trim());
    });
  });
}

/* ------------------------------------------------------------------ */
/* The guided deploy                                                   */
/* ------------------------------------------------------------------ */

async function main() {
  if (process.argv.includes('--self-test-url-guard')) {
    process.exit(selfTestUrlGuard());
  }

  console.log('paydirt · gtm-docs — guided Vercel deploy');
  console.log('App root:', APP_ROOT);

  let pkg;
  try {
    pkg = JSON.parse(await readFile(resolve(APP_ROOT, 'package.json'), 'utf8'));
  } catch (err) {
    fail(`Could not read package.json in ${APP_ROOT} (${err.message})`, 'run this script from a clone of the paydirt repo');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const closeAndExit = (code) => {
    rl.close();
    process.exit(code);
  };

  /* 1/5 — Vercel CLI available + authenticated */
  step('1/5 Checking the Vercel CLI…');
  const version = run('vercel', ['--version']);
  if (version.error || version.code !== 0) {
    fail('The Vercel CLI was not found on your PATH.', 'install it with `npm install -g vercel` (or `brew install vercel`), then re-run this script');
  }
  info(`Found: ${stripAnsi(version.stdout).trim().split('\n').pop()}`);
  const whoami = run('vercel', ['whoami']);
  if (whoami.code !== 0) {
    fail('You are not logged in to Vercel.', 'run `vercel login`, complete the browser flow, then re-run this script');
  }
  info(`Signed in as ${stripAnsi(whoami.stdout).trim()}`);

  /* 2/5 — project name + link */
  step('2/5 Project — confirming the name and linking the app…');
  const suggested = typeof pkg.name === 'string' && pkg.name.length > 0 ? pkg.name : 'gtm-docs';
  const nameInput = await ask(rl, `Vercel project name [${suggested}]: `);
  const projectName = nameInput === '' ? suggested : nameInput;
  if (!PROJECT_NAME_PATTERN.test(projectName)) {
    fail(`"${projectName}" is not a valid Vercel project name (lowercase letters, digits, hyphens).`, 're-run and choose a name like `gtm-docs`');
  }
  const link = run('vercel', ['link', '--yes', '--project', projectName]);
  if (link.code !== 0) {
    fail(
      `Could not link this directory to the Vercel project "${projectName}".\n${stripAnsi(link.stderr).trim()}`,
      'create or select the project first with `vercel link` inside apps/gtm-docs (add `--scope <team>` if you have multiple teams), then re-run this script',
    );
  }
  info(`Linked apps/gtm-docs to project "${projectName}"`);

  /* 3/5 — environment variables */
  step('3/5 Environment variables…');
  info('None are required: this Phase 1 deploy is a read-only docs instance —');
  info('the content ships inside the build, so there is nothing to configure.');
  info('(Phase 3 adds an optional database-backed store; at that point this');
  info(' step will accept a user-supplied DATABASE_URL.)');
  if (await confirm(rl, 'Set any environment variables anyway?', false)) {
    for (;;) {
      const envName = await ask(rl, 'Env var NAME (uppercase, blank to finish): ');
      if (envName === '') break;
      if (!ENV_NAME_PATTERN.test(envName)) {
        info(`"${envName}" does not match the env-var name pattern (uppercase letters, digits, underscores) — skipped.`);
        continue;
      }
      const envValue = await askHidden(rl, `Value for ${envName} (input hidden, never displayed): `);
      if (envValue === '') {
        info('Empty value — skipped.');
        continue;
      }
      // Value goes straight to the CLI's stdin; it is never printed or stored.
      const added = run('vercel', ['env', 'add', envName, 'production'], { input: `${envValue}\n` });
      if (added.code !== 0) {
        info(`Vercel rejected ${envName}: ${stripAnsi(added.stderr).trim()}`);
        info('If it already exists, update it in the Vercel dashboard or remove it with `vercel env rm`.');
      } else {
        info(`Set ${envName} for the production environment (value not shown).`);
      }
    }
  }

  /* 4/5 — deploy */
  step('4/5 Deploying to production…');
  if (!(await confirm(rl, `Deploy apps/gtm-docs to Vercel project "${projectName}" now?`, true))) {
    fail('Deploy cancelled at your request.', 're-run this script when you are ready');
  }
  const deploy = run('vercel', ['deploy', '--prod', '--yes']);
  if (deploy.code !== 0) {
    fail(
      `The deploy failed.\n${stripAnsi(deploy.stderr).trim()}`,
      'inspect the build output above; `vercel inspect <deployment-url>` and `vercel logs <deployment-url>` dig deeper',
    );
  }
  const deployText = stripAnsi(`${deploy.stdout}\n${deploy.stderr}`);
  const urls = deployText.match(/https:\/\/[^\s'")]+/g) ?? [];
  const deploymentUrl = urls.at(-1);
  if (!deploymentUrl) {
    fail(
      'The deploy reported success but no deployment URL was found in the output.',
      'find the URL with `vercel ls`, then verify it serves /docs',
    );
  }
  info(`Deployed: ${deploymentUrl}`);

  /* 5/5 — verify the live URL */
  step(`5/5 Verifying the deployment answers on ${VERIFY_PATH}…`);
  const check = validateDeployUrl(deploymentUrl);
  if (check.error) fail(`The CLI returned a URL this script refuses to contact: ${check.error}`, 'inspect the deploy output with `vercel inspect` and re-run');
  const verifyUrl = new URL(VERIFY_PATH, check.url);
  const dnsCheck = await resolvedAddressesArePublic(verifyUrl.hostname);
  if (dnsCheck.error) fail(dnsCheck.error, 'check the deployment URL; a custom domain may still be propagating');
  info(`Host ${verifyUrl.hostname} resolved to ${dnsCheck.records.length} public address(es) — requesting ${verifyUrl.href}`);
  const response = await httpsStatus(verifyUrl, VERIFY_TIMEOUT_MS);
  if (response.error) {
    fail(`Could not reach ${verifyUrl.href}: ${response.error}`, 'the deployment may still be warming up — retry in a minute, or check `vercel logs <deployment-url>`');
  }
  if (response.status >= 200 && response.status < 300) {
    info(`HTTP ${response.status} on ${verifyUrl.href} — deployment verified.`);
  } else if (response.status < 400) {
    info(`HTTP ${response.status} (redirect) on ${verifyUrl.href} — deployment is live.`);
  } else {
    fail(
      `${verifyUrl.href} answered HTTP ${response.status}, not a healthy 2xx/3xx.`,
      'check the deployment logs with `vercel logs <deployment-url>`, fix, and redeploy',
    );
  }

  console.log(`
Done. Your read-only docs instance is live:
  ${verifyUrl.href}

Next steps:
  - Open the flagship board: ${new URL('/docs/systems/icp-pipeline', check.url).href}
  - Deployed instances are read-only by design — clone the repo and run
    \`pnpm --filter gtm-docs dev\` to edit boards in the /studio canvas;
    changes reach the deployed site on your next deploy.
`);

  closeAndExit(0);
}

main().catch((err) => {
  console.error(`\n✗ Unexpected failure: ${err?.stack ?? err}`);
  process.exit(1);
});
