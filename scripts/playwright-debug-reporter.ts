/**
 * Writes NDJSON lines for debug session 8e4dc2 on every test completion.
 * Runs in the Playwright runner process (stable __dirname); independent of test helpers.
 */
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

const SESSION_ID = '8e4dc2';

function resolveProjectRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'playwright.config.ts'))) return cwd;
  const fromReporterFile = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(fromReporterFile, 'playwright.config.ts'))) return fromReporterFile;
  return cwd;
}

const PROJECT_ROOT = resolveProjectRoot();
const LOG_PATHS = [
  path.join(PROJECT_ROOT, '.cursor', `debug-${SESSION_ID}.log`),
  path.join(PROJECT_ROOT, 'reports', `debug-${SESSION_ID}.log`),
];

function appendNdjson(payload: Record<string, unknown>): void {
  const line = JSON.stringify({ sessionId: SESSION_ID, timestamp: Date.now(), ...payload });
  for (const p of LOG_PATHS) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.appendFileSync(p, `${line}\n`);
    } catch {
      /* ignore */
    }
  }
}

export default class PlaywrightDebugReporter implements Reporter {
  onBegin(_config: FullConfig, _suite: Suite): void {
    appendNdjson({
      hypothesisId: 'reporter',
      location: 'scripts/playwright-debug-reporter.ts:onBegin',
      message: 'playwright run started',
      data: { projectRoot: PROJECT_ROOT, cwd: process.cwd(), dirname: __dirname },
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const err = result.error?.message ?? '';
    appendNdjson({
      hypothesisId: 'reporter',
      location: 'scripts/playwright-debug-reporter.ts:onTestEnd',
      message: `test ${result.status}`,
      data: {
        titlePath: test.titlePath(),
        status: result.status,
        durationMs: result.duration,
        errorSnippet: err ? err.slice(0, 1200) : null,
      },
    });
  }
}
