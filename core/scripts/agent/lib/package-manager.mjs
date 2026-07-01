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
  /** @type {{ file: string; manager: 'pnpm' | 'npm' | 'yarn' | 'bun' }[]} */
  const found = [];
  for (const { file, manager } of LOCKFILES) {
    if (existsSync(join(root, file))) found.push({ file, manager });
  }

  const readPackageManagerField = () => {
    const pkgPath = join(root, 'package.json');
    if (!existsSync(pkgPath)) return null;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const field = String(pkg.packageManager ?? '').split('@')[0].trim();
      return ['pnpm', 'npm', 'yarn', 'bun'].includes(field) ? field : null;
    } catch {
      return null;
    }
  };

  if (found.length > 1) {
    const fromField = readPackageManagerField();
    if (fromField) return fromField;
  }
  if (found.length >= 1) return found[0].manager;

  const fromField = readPackageManagerField();
  if (fromField) return fromField;

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
  if (pkg === '.') return pmRun(manager, step);

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
  switch (manager) {
    case 'npm':
      return `npm run ${script}`;
    case 'yarn':
      return `yarn run ${script}`;
    case 'bun':
      return `bun run ${script}`;
    case 'pnpm':
    default:
      return `pnpm run ${script}`;
  }
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
      return ['yarn', 'exec', ...args];
    case 'bun':
      return ['bunx', ...args];
    case 'npm':
    default:
      return ['npx', ...args];
  }
}
