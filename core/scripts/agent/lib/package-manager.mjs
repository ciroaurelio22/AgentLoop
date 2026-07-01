import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCKFILES = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'bun.lock', manager: 'bun' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'package-lock.json', manager: 'npm' },
];

/**
 * Detect package manager from lockfiles and package.json#packageManager.
 * @param {string} [root]
 * @returns {'pnpm' | 'npm' | 'yarn' | 'bun'}
 */
export function detectPackageManager(root = process.cwd()) {
  for (const { file, manager } of LOCKFILES) {
    if (existsSync(join(root, file))) return manager;
  }

  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const field = String(pkg.packageManager ?? '').split('@')[0].trim();
      if (['pnpm', 'npm', 'yarn', 'bun'].includes(field)) return field;
    } catch {
      /* ignore */
    }
  }

  return 'npm';
}

/**
 * @param {{ verify?: { packageManager?: string } }} cfg
 * @param {string} [root]
 */
export function resolvePackageManager(cfg, root = process.cwd()) {
  const configured = cfg?.verify?.packageManager?.trim();
  if (configured && configured !== 'auto') return configured;
  return detectPackageManager(root);
}

/**
 * @param {string} manager
 * @param {string} pkg  '.' for repo root
 * @param {string} step lint | typecheck | test
 */
export function verifyCommand(manager, pkg, step) {
  if (pkg === '.') return `${manager} run ${step}`;

  switch (manager) {
    case 'pnpm':
      return `pnpm --filter ${pkg} run ${step}`;
    case 'yarn':
      return `yarn workspace ${pkg} run ${step}`;
    case 'bun':
      return `bun run ${step} --filter ${pkg}`;
    case 'npm':
    default:
      return `npm run ${step} --workspace=${pkg}`;
  }
}

/**
 * @param {string} manager
 * @param {string} script  npm script name without "run"
 */
export function pmRun(manager, script) {
  if (manager === 'npm') return `npm run ${script}`;
  return `${manager} ${script}`;
}

/**
 * @param {string} manager
 * @param {string[]} args
 */
export function execCommand(manager, args) {
  switch (manager) {
    case 'pnpm':
      return ['pnpm', 'exec', ...args];
    case 'yarn':
      return ['yarn', ...args];
    case 'bun':
      return ['bunx', ...args];
    case 'npm':
    default:
      return ['npx', ...args];
  }
}
