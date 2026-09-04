/**
 * CI benchmark runner.
 *
 * Runs the existing `BenchmarkSuite`, evaluates it against absolute budgets and
 * (when present) a stored baseline, writes CI artifacts, and exits non-zero on a
 * gate violation. This is what turns the benchmarks from advisory into enforced.
 *
 * Usage:
 *   npm run benchmark            # run + gate, human-readable output
 *   npm run benchmark:ci         # run + gate + artifacts, fails the job
 *   npm run benchmark -- --update-baseline   # record a new baseline
 *
 * Flags:
 *   --iterations <n>      measured iterations (default 10)
 *   --warmup <n>          discarded warmup runs (default 3)
 *   --cpu-only            skip GPU timestamp path
 *   --out <dir>           artifact directory (default .benchmarks)
 *   --baseline <file>     baseline JSON (default <out>/baseline.json)
 *   --update-baseline     overwrite the baseline from this run
 *   --no-fail             report violations but exit 0
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BenchmarkSuite,
  toJUnitXml,
  toJsonSummary,
  toMarkdownTable,
  type RegressionBaseline,
} from '../src/testing/performance/localized-edit-benchmark.js';
import {
  baselineFromSummary,
  evaluateBenchmarkGates,
  formatGateResult,
} from '../src/testing/performance/benchmark-gates.js';

interface Args {
  iterations: number;
  warmup: number;
  cpuOnly: boolean;
  out: string;
  baseline: string | null;
  updateBaseline: boolean;
  fail: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    iterations: 10,
    warmup: 3,
    cpuOnly: false,
    out: '.benchmarks',
    baseline: null,
    updateBaseline: false,
    fail: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--iterations') args.iterations = Number(argv[++i]);
    else if (a === '--warmup') args.warmup = Number(argv[++i]);
    else if (a === '--cpu-only') args.cpuOnly = true;
    else if (a === '--out') args.out = String(argv[++i]);
    else if (a === '--baseline') args.baseline = String(argv[++i]);
    else if (a === '--update-baseline') args.updateBaseline = true;
    else if (a === '--no-fail') args.fail = false;
  }
  return args;
}

function loadBaseline(path: string): RegressionBaseline | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as RegressionBaseline;
    if (!parsed.cpuMeanMs) return null;
    return {
      cpuMeanMs: parsed.cpuMeanMs,
      gpuMeanMs: parsed.gpuMeanMs ?? {},
      label: parsed.label ?? path,
    };
  } catch {
    console.warn(`[benchmark] ignoring unreadable baseline at ${path}`);
    return null;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });
  const baselinePath = args.baseline ?? join(args.out, 'baseline.json');

  console.log(
    `[benchmark] iterations=${args.iterations} warmup=${args.warmup} cpuOnly=${args.cpuOnly}`,
  );

  const suite = new BenchmarkSuite({
    config: { iterations: args.iterations, warmupRuns: args.warmup, cpuOnly: args.cpuOnly },
  });
  const summary = await suite.run();

  const baseline = loadBaseline(baselinePath);
  if (baseline) console.log(`[benchmark] comparing against baseline '${baseline.label}'`);
  else console.log('[benchmark] no baseline found — absolute budgets only');

  const gate = evaluateBenchmarkGates(summary, {}, baseline);

  writeFileSync(join(args.out, 'summary.json'), toJsonSummary(summary), 'utf8');
  writeFileSync(
    join(args.out, 'junit.xml'),
    toJUnitXml(summary, gate.regression ?? undefined),
    'utf8',
  );
  writeFileSync(
    join(args.out, 'summary.md'),
    `${toMarkdownTable(summary)}\n\n\`\`\`\n${formatGateResult(gate)}\n\`\`\`\n`,
    'utf8',
  );
  writeFileSync(
    join(args.out, 'gates.json'),
    JSON.stringify(
      {
        passed: gate.passed,
        violations: gate.violations,
        evaluated: gate.evaluated,
        skipped: gate.skipped,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(formatGateResult(gate));
  console.log(`[benchmark] artifacts written to ${args.out}`);

  if (args.updateBaseline) {
    const label = process.env['GITHUB_SHA'] ?? new Date().toISOString();
    writeFileSync(
      join(baselinePath),
      JSON.stringify(baselineFromSummary(summary, label), null, 2),
      'utf8',
    );
    console.log(`[benchmark] baseline updated (${label})`);
  }

  if (!gate.passed && args.fail) process.exitCode = 1;
}

void main().catch((err: unknown) => {
  console.error('[benchmark] failed:', err);
  process.exitCode = 1;
});
