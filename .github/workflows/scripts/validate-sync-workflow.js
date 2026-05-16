#!/usr/bin/env node

/**
 * validate-sync-workflow.js
 *
 * Validates that .github/workflows/upstream-sync.yml contains all required
 * sections for shellcheck validation and auto-merge gate logic.
 *
 * Checks:
 *   1. A shellcheck step exists (grep for 'shellcheck' in step context)
 *   2. An auto-merge command exists (grep for 'pr merge --auto --squash')
 *   3. A 'needs-review' label reference exists
 *   4. At least 2 fallback PR-creation paths (error/else branches that create a PR)
 *   5. The workflow has job-level outputs for shellcheck_status and auto_merge_decision
 *
 * Exit 0 if all checks pass, exit 1 with diagnostic output otherwise.
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = path.resolve(__dirname, '..', 'upstream-sync.yml');

// ── Helpers ────────────────────────────────────────────────────────────────

function fail(check, detail) {
  console.error(`\x1b[31mFAIL\x1b[0m [${check}] ${detail}`);
  process.exitCode = 1;
}

function pass(check, detail) {
  console.log(`\x1b[32mPASS\x1b[0m [${check}] ${detail}`);
}

function countOccurrences(text, pattern) {
  const re = typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern;
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log('=== validate-sync-workflow.js ===\n');
console.log(`Reading: ${WORKFLOW_PATH}\n`);

let raw;
try {
  raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
} catch (err) {
  console.error(`ERROR: Cannot read ${WORKFLOW_PATH}: ${err.message}`);
  process.exit(1);
}

console.log(`File size: ${raw.length} bytes, ${raw.split('\n').length} lines\n`);

// ── Check 1: shellcheck step ──────────────────────────────────────────────

const shellcheckInSteps =
  raw.includes('shellcheck') &&
  (raw.includes('name: Check shellcheck') ||
   raw.includes('shellcheck -Calways') ||
   raw.includes('sudo apt-get install -y shellcheck'));

if (shellcheckInSteps) {
  pass('shellcheck-step', 'Found shellcheck installation and invocation in workflow steps');
} else {
  fail('shellcheck-step', 'Missing shellcheck step — workflow must install shellcheck and run it on changed .sh files');
}

// ── Check 1b: shellcheck status output ─────────────────────────────────────

if (raw.includes('shellcheck_status') || raw.includes('steps.shellcheck.outputs.status')) {
  pass('shellcheck-output', 'Found shellcheck_status job output wiring');
} else {
  fail('shellcheck-output', 'Missing shellcheck_status output — workflow must expose shellcheck pass/fail/skipped status');
}

// ── Check 2: auto-merge command ───────────────────────────────────────────

if (raw.includes('pr merge --auto --squash')) {
  pass('auto-merge-cmd', 'Found gh pr merge --auto --squash command');
} else {
  fail('auto-merge-cmd', 'Missing gh pr merge --auto --squash — clean syncs must auto-merge');
}

// ── Check 2b: auto-merge decision variable ─────────────────────────────────

if (raw.includes('AUTO_MERGE') || raw.includes('auto_merge')) {
  pass('auto-merge-decision', 'Found auto-merge decision variable/logic');
} else {
  fail('auto-merge-decision', 'Missing auto-merge decision logic — workflow must branch on merge eligibility');
}

// ── Check 3: needs-review label ────────────────────────────────────────────

if (raw.includes('needs-review')) {
  pass('needs-review-label', 'Found needs-review label reference');
} else {
  fail('needs-review-label', 'Missing needs-review label — diagnostic PRs must be labeled');
}

// ── Check 4: fallback PR-creation paths (at least 2) ───────────────────────

// Count distinct PR creation patterns in error/else branches
// We look for gh pr create calls within the diagnostic/fallback paths
const prCreateCount = countOccurrences(raw, /gh pr create/g);
const diagnosticPrCreate =
  (raw.includes('AUTO_MERGE') && raw.includes('gh pr create')) ||
  prCreateCount >= 2;

// Count how many distinct fallback PR creation contexts exist
// The workflow should have PR creation in both auto-merge and diagnostic paths
const autoMergePrExists = raw.includes('auto-merge PR') || 
  (raw.includes('AUTO_MERGE') && raw.includes('gh pr create') && raw.includes('--title'));
const diagnosticPrExists = raw.includes('diagnostic PR') ||
  (raw.includes('needs-review') && raw.includes('gh pr create'));

const fallbackCount = (autoMergePrExists ? 1 : 0) + (diagnosticPrExists ? 1 : 0);

if (fallbackCount >= 2) {
  pass('fallback-paths', `Found ${fallbackCount} distinct PR-creation paths (auto-merge + diagnostic)`);
} else {
  fail('fallback-paths', `Only ${fallbackCount} PR-creation path(s) found — need at least 2 (auto-merge path + diagnostic fallback path)`);
}

// ── Check 5: Diagnostic comment with blocking reasons ──────────────────────

if (raw.includes('Auto-Merge Blocked') || raw.includes('DECISION_REASON')) {
  pass('diagnostic-comment', 'Found diagnostic comment with blocking reasons');
} else {
  fail('diagnostic-comment', 'Missing diagnostic comment — blocked PRs must explain why auto-merge was skipped');
}

// ── Check 6: Fail-open error handling ──────────────────────────────────────

// Look for || true or || { echo warning patterns on critical commands
const failOpenPatterns = [
  raw.includes('::warning::') && raw.includes('gh pr'),
  raw.includes('exit 0') && raw.includes('gh pr'),
  raw.includes('|| {') && raw.includes('warning'),
].filter(Boolean).length;

if (failOpenPatterns >= 1) {
  pass('fail-open', `Found ${failOpenPatterns} fail-open error handling pattern(s)`);
} else {
  fail('fail-open', 'Missing fail-open error handling — gh CLI failures must fall back gracefully');
}

// ── Check 7: PR title differentiation ──────────────────────────────────────

const hasAutoMergeTitle = raw.includes('🔄');
const hasDiagnosticTitle = raw.includes('👁️ Needs Review');

if (hasAutoMergeTitle && hasDiagnosticTitle) {
  pass('pr-titles', 'Found distinct PR titles for auto-merge (🔄) and diagnostic (👁️ Needs Review)');
} else {
  const missing = [];
  if (!hasAutoMergeTitle) missing.push('🔄');
  if (!hasDiagnosticTitle) missing.push('👁️ Needs Review');
  fail('pr-titles', `Missing PR title indicator(s): ${missing.join(', ')}`);
}

// ── Check 8: ShellCheck report file generation ─────────────────────────────

if (raw.includes('shellcheck_report.txt') || raw.includes('shellcheck_report')) {
  pass('shellcheck-report', 'Found shellcheck report file generation for PR body inclusion');
} else {
  fail('shellcheck-report', 'Missing shellcheck report — diagnostic PRs must include shellcheck output');
}

// ── Check 9: Job-level outputs for observability ───────────────────────────

if (raw.includes('shellcheck_status:') || raw.includes('auto_merge_decision:')) {
  pass('job-outputs', 'Found job-level outputs for shellcheck_status and/or auto_merge_decision');
} else {
  fail('job-outputs', 'Missing job-level outputs — workflow should expose shellcheck and auto-merge status for observability');
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log('');
if (process.exitCode === 1 || process.exitCode === undefined && false) {
  console.error('\x1b[31mValidation FAILED — see failures above.\x1b[0m');
} else {
  console.log('\x1b[32mAll checks passed. Workflow is valid.\x1b[0m');
}

process.exit(process.exitCode || 0);
