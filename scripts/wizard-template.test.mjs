import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const template = readFileSync(
  new URL("../skills/engineering/wizard/template.sh", import.meta.url),
  "utf8",
).replace('run_wizard "$@"; exit', "");

function run(body) {
  const cwd = mkdtempSync(join(tmpdir(), "wizard-test-"));
  try {
    return spawnSync("bash", ["-c", `${template}\n${body}`], {
      cwd,
      encoding: "utf8",
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function succeeds(body) {
  const result = run(body);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("capture helpers assign names that previously collided with local variables", () => {
  succeeds(`
    for destination in key prompt current input s e p rc; do
      ask "$destination" "Value:" <<< 'visible'
      [[ "\${!destination}" == visible ]]
      ask_secret "$destination" "Secret:" <<< 'hidden'
      [[ "\${!destination}" == hidden ]]
    done
    for destination in key value tmp sq; do
      write_env "$destination" 'saved'
      [[ "\${!destination}" == saved ]]
      [[ "$(_existing "$destination")" == saved ]]
    done
  `);
});

test("write_env preserves existing content on a read error", () => {
  const result = run(`
    printf 'KEEP=original\\n' > "$ENV_FILE"
    # Simulate grep's read-error status without depending on runner privileges.
    grep() { return 2; }
    write_env NEW replacement
  `);
  assert.notEqual(result.status, 0);
  // Check preservation within a fresh run, catching the expected failure.
  succeeds(`
    printf 'KEEP=original\\n' > "$ENV_FILE"
    grep() { return 2; }
    if write_env NEW replacement; then exit 1; fi
    [[ "$(cat "$ENV_FILE")" == KEEP=original ]]
  `);
});

test("write_env still creates, replaces, and retains unrelated entries", () => {
  succeeds(`
    write_env TOKEN first
    write_env TOKEN second
    write_env OTHER third
    [[ "$(cat "$ENV_FILE")" == $'TOKEN=\\'second\\'\\nOTHER=\\'third\\'' ]]
    [[ "$(_existing TOKEN)" == second ]]
    ask TOKEN 'Keep current:' <<< ''
    [[ "$TOKEN" == second ]]
    ask_secret TOKEN 'Keep current:' <<< ''
    [[ "$TOKEN" == second ]]
    if ask MISSING 'EOF:' < /dev/null; then exit 1; fi
    if ask_secret MISSING 'EOF:' < /dev/null; then exit 1; fi
  `);
});
