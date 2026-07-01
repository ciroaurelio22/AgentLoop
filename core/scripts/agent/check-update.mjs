#!/usr/bin/env node
/**
 * Check for Agent Loop kit updates (throttled; safe to call from hooks).
 *
 * Usage:
 *   node scripts/agent/check-update.mjs [--json] [--force]
 *   node scripts/agent/check-update.mjs --snooze 7
 *   node scripts/agent/check-update.mjs --dismiss
 *   node scripts/agent/check-update.mjs --hook
 */
import { checkForUpdate } from './lib/update-check.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const force = args.includes('--force');
const hook = args.includes('--hook');

let snoozeDays = null;
const snoozeIdx = args.indexOf('--snooze');
if (snoozeIdx >= 0 && args[snoozeIdx + 1]) {
  snoozeDays = Number(args[snoozeIdx + 1]);
}

const result = await checkForUpdate({
  force,
  hook,
  snoozeDays: Number.isFinite(snoozeDays) ? snoozeDays : undefined,
  dismiss: args.includes('--dismiss'),
});

if (hook) {
  if (result.updateAvailable && result.notice) {
    process.stdout.write(`${result.notice}\n`);
  }
  process.exit(0);
}

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.reason === 'throttled') {
  console.log('Check skipped (interval not elapsed). Use --force to check now.');
  process.exit(0);
}

if (result.updateAvailable) {
  console.log(result.message);
  console.log('Run: pnpm agent:update');
  process.exit(0);
}

if (result.snoozedUntil) {
  console.log(`Snoozed until ${result.snoozedUntil}`);
  process.exit(0);
}

if (result.dismissedVersion) {
  console.log(`Dismissed remote v${result.dismissedVersion}`);
  process.exit(0);
}

console.log(result.remote ? `Up to date (v${result.local})` : 'No update check performed.');
process.exit(0);
