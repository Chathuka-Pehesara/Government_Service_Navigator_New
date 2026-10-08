#!/usr/bin/env node
// Pretty test runner used by the Makefiles (see test/README.md).
//
//   node test/runner.mjs dotnet --title T --subtitle S --project P [--filter F] [--config C] [--verbosity V] [--quiet 1]
//   node test/runner.mjs npm    --title T --subtitle S --dir D [--quiet 1]
//
// Each test is listed as it finishes, grouped by test class (or file and describe block).
// --quiet 1 shows only the spinner and the result line; --verbosity normal streams the raw output.
//   node test/runner.mjs reset | summary | help
//
// Plain Node with no dependencies, so it works the same under cmd.exe, PowerShell and sh.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SUMMARY_FILE = path.join(here, ".make-results.json");

// ---- Styling ----

const tty = process.stdout.isTTY && !process.env.NO_COLOR && !process.env.CI;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  bold: paint("1"), dim: paint("2"),
  red: paint("31"), green: paint("32"), yellow: paint("33"),
  blue: paint("34"), magenta: paint("35"), cyan: paint("36"), gray: paint("90"),
};
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const pad = (s, n) => s + " ".repeat(Math.max(0, n - strip(s).length));
const WIDTH = 64;

function box(lines, color = c.cyan, title = "") {
  console.log(title
    ? color("╭─ ") + c.bold(title) + color(` ${"─".repeat(WIDTH - title.length - 3)}╮`)
    : color(`╭${"─".repeat(WIDTH)}╮`));
  for (const line of lines) {
    if (line === "---") console.log(color(`├${"─".repeat(WIDTH)}┤`));
    else console.log(`${color("│")}  ${pad(line, WIDTH - 2)}${color("│")}`);
  }
  console.log(color(`╰${"─".repeat(WIDTH)}╯`));
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

// A spinner on the last line; log() prints a line above it without breaking the animation
function spinner(label) {
  if (!tty) {
    console.log(c.gray(`  ${label}...`));
    return { stop() {}, log: (line) => console.log(line), label() {} };
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const start = Date.now();
  let i = 0;
  const clear = () => process.stdout.write("\r\x1b[2K");
  const draw = () =>
    process.stdout.write(`\r\x1b[2K  ${c.cyan(frames[i++ % frames.length])} ${label} ${c.gray(seconds(Date.now() - start))}`);
  draw();
  const timer = setInterval(draw, 80);
  return {
    stop() {
      clearInterval(timer);
      clear();
    },
    log(line) {
      clear();
      process.stdout.write(line + "\n");
      draw();
    },
    label(text) {
      label = text;
    },
  };
}

// ---- Arguments ----

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) opts[rest[i].slice(2)] = rest[i + 1], i++;
  }
  return { command, opts };
}

// ---- Running a suite ----

function run(cmd, args, { cwd, live, shell = false, onLine }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell, env: { ...process.env, FORCE_COLOR: live && tty ? "1" : "0" } });
    let output = "";
    let partial = "";
    const collect = (chunk) => {
      output += chunk;
      if (live) process.stdout.write(chunk);
      if (onLine) {
        const lines = (partial + chunk).split(/\r?\n/);
        partial = lines.pop();
        lines.forEach(onLine);
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (err) => resolve({ code: 1, output: output + String(err) }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

function parseDotnet(output) {
  // Minimal verbosity: "Passed!  - Failed: 0, Passed: 21, Skipped: 0, Total: 21"
  const m = output.match(/(?:Passed|Failed)!\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+),\s+Total:\s+(\d+)/);
  if (m) return { failed: +m[1], passed: +m[2], skipped: +m[3], expected: 0, total: +m[4] };

  // Normal verbosity: a "Total tests: 21" block with a line per non-zero count
  const block = output.slice(output.search(/^Total tests:/m));
  const total = block.match(/^Total tests:\s+(\d+)/m);
  if (!total) return null;
  const count = (word) => +(block.match(new RegExp(`^\\s*${word}:\\s+(\\d+)`, "m")) || [0, 0])[1];
  return { failed: count("Failed"), passed: count("Passed"), skipped: count("Skipped"), expected: 0, total: +total[1] };
}

function parseVitest(output) {
  const line = strip(output).split(/\r?\n/).find((l) => /^\s*Tests\s+\d/.test(l));
  if (!line) return null;
  const count = (word) => +(line.match(new RegExp(`(\\d+) ${word}`)) || [0, 0])[1];
  const r = { passed: count("passed"), failed: count("failed"), skipped: count("skipped") + count("todo"), expected: count("expected fail") };
  r.total = r.passed + r.failed + r.skipped + r.expected;
  return r;
}

// ---- One line per test ----

// dotnet (console logger, normal verbosity): "  Passed Namespace.Class.Method(args) [12 ms]"
function parseDotnetTest(line) {
  const m = line.match(/^\s+(Passed|Failed|Skipped)\s+(\S.*?)\s+\[(.+?)\]\s*$/);
  if (!m) return null;
  const [, status, fullName, time] = m;
  const paren = fullName.indexOf("(");
  const base = paren >= 0 ? fullName.slice(0, paren) : fullName;
  const args = paren >= 0 ? fullName.slice(paren) : "";
  const parts = base.split(".");
  return {
    status: { Passed: "pass", Failed: "fail", Skipped: "skip" }[status],
    group: parts.at(-2) ?? "",
    name: parts.at(-1) + args,
    time: time.replace(/\s/g, ""),
  };
}

// vitest (verbose reporter): " ✓ ../test/web/file.test.ts > describe > test name 3ms"
function parseVitestTest(line) {
  const m = strip(line).match(/^\s*([✓×↓])\s+(\S.*?)(?:\s+(\d+ms))?\s*$/);
  if (!m || !m[2].includes(" > ")) return null;
  const segments = m[2].split(" > ");
  segments[0] = path.basename(segments[0]);
  return {
    status: { "✓": "pass", "×": "fail", "↓": "skip" }[m[1]],
    group: segments.slice(0, -1).join(" › "),
    name: segments.at(-1),
    time: m[3] ?? "",
  };
}

function testLine(t) {
  const mark = { pass: c.green("✔"), fail: c.red("✖"), skip: c.yellow("○") }[t.status];
  const width = (process.stdout.columns || 120) - 16;
  const name = t.name.length > width ? t.name.slice(0, width - 1) + "…" : t.name;
  const text = t.status === "fail" ? c.red(name) : t.status === "skip" ? c.yellow(name) : name;
  return `    ${mark} ${text}  ${c.gray(t.time)}`;
}

function failureDetails(output, kind) {
  const lines = strip(output).split(/\r?\n/);
  if (kind === "dotnet") {
    // Keep each "Failed <test>" block and any build errors
    const keep = [];
    let inBlock = false;
    for (const l of lines) {
      if (/^\s*Failed\s+\S/.test(l) && !/Failed!/.test(l)) inBlock = true;
      else if (/^\s*(Passed|Skipped)\s+\S/.test(l) || /(Passed|Failed)!|^Test Run|^\[xUnit/.test(l)) inBlock = false;
      if (inBlock || /\berror\b/i.test(l)) keep.push(l);
    }
    return keep.length ? keep : lines.slice(-40);
  }
  const start = lines.findIndex((l) => /FAIL|Failed Tests/.test(l));
  return start >= 0 ? lines.slice(start, start + 80) : lines.slice(-40);
}

async function runSuite(kind, o) {
  const live = ["normal", "detailed", "diagnostic"].includes(o.verbosity);
  const list = !live && o.quiet !== "1";
  const info = kind === "dotnet"
    ? `${path.basename(o.project)}  ${c.gray("·")}  ${o.config ?? "Release"}${o.filter ? `  ${c.gray("·")}  filtered` : ""}`
    : `Vitest  ${c.gray("·")}  ${o.dir}`;

  console.log();
  box([`${c.bold(c.magenta("▶"))} ${c.bold(o.title)}${o.subtitle ? c.gray("  -  ") + o.subtitle : ""}`, c.gray(info)]);

  let cmd, args, shell = false;
  if (kind === "dotnet") {
    cmd = "dotnet";
    // Listing needs the per-test lines, which the console logger prints from "normal" up
    const verbosity = list ? "normal" : o.verbosity ?? "minimal";
    args = ["test", o.project, "--configuration", o.config ?? "Release", "--logger", `console;verbosity=${verbosity}`];
    if (o.filter) args.push("--filter", o.filter);
  } else {
    // npm is a .cmd file on Windows, so it needs a shell
    cmd = `npm --prefix "${o.dir}" test${list ? " -- --reporter=verbose" : ""}`;
    args = [];
    shell = true;
  }

  const started = Date.now();
  const spin = live ? { stop() {} } : spinner(list ? "Building" : "Building and running tests");
  const parseTest = kind === "dotnet" ? parseDotnetTest : parseVitestTest;
  let group = null;
  let done = 0;
  const onLine = list
    ? (line) => {
        const t = parseTest(line);
        if (!t) return;
        if (t.group !== group) {
          group = t.group;
          spin.log(`  ${c.bold(c.cyan(group))}`);
        }
        spin.log(testLine(t));
        spin.label(`Running tests  ${c.gray(`${++done} done`)}`);
      }
    : undefined;
  const { code, output } = await run(cmd, args, { cwd: process.cwd(), live, shell, onLine });
  spin.stop();
  const ms = Date.now() - started;

  const r = (kind === "dotnet" ? parseDotnet : parseVitest)(output);
  const ok = code === 0 && r && r.failed === 0;

  if (list && done > 0) console.log();
  if (!ok) {
    console.log(`  ${c.red(c.bold("✖ " + (r ? "Tests failed" : "Could not run the tests (build error?)")))}`);
    for (const l of failureDetails(output, kind)) console.log(c.gray("  │ ") + l);
  }

  const parts = r
    ? [
        c.green(`✔ ${r.passed} passed`),
        r.failed ? c.red(`✖ ${r.failed} failed`) : c.gray("✖ 0 failed"),
        r.skipped ? c.yellow(`○ ${r.skipped} skipped`) : null,
        r.expected ? c.blue(`◆ ${r.expected} expected fail`) : null,
      ].filter(Boolean)
    : [c.red("no results")];
  const badge = ok ? paint("42;30;1")(" PASS ") : paint("41;37;1")(" FAIL ");
  console.log(`  ${badge}  ${parts.join(c.gray("  ·  "))}  ${c.gray("in " + seconds(ms))}`);
  console.log();

  record({ title: o.title, ok, ms, ...(r ?? { passed: 0, failed: 0, skipped: 0, expected: 0, total: 0 }) });
  process.exitCode = ok ? 0 : 1;
}

// ---- Summary across suites (make test) ----

function readResults() {
  try { return JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf8")); } catch { return null; }
}

function record(result) {
  const results = readResults();
  if (!results) return; // only collected between "reset" and "summary"
  results.push(result);
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(results));
}

function summary() {
  const results = readResults() ?? [];
  try { fs.unlinkSync(SUMMARY_FILE); } catch {}
  if (!results.length) return;

  const sum = (k) => results.reduce((n, r) => n + r[k], 0);
  const allOk = results.every((r) => r.ok);
  const nameWidth = Math.max(...results.map((r) => r.title.length)) + 2;

  const rows = results.map((r) => {
    const mark = r.ok ? c.green("✔") : c.red("✖");
    const counts = [
      c.green(`${String(r.passed).padStart(4)} passed`),
      r.failed ? c.red(`${r.failed} failed`) : "",
      r.skipped ? c.yellow(`${r.skipped} skipped`) : "",
      r.expected ? c.blue(`${r.expected} expected fail`) : "",
    ].filter(Boolean).join("  ");
    return `${mark}  ${pad(c.bold(r.title), nameWidth)}${pad(counts, 40)}${c.gray(seconds(r.ms).padStart(6))}`;
  });

  const verdict = allOk ? c.bold(c.green("ALL SUITES PASSED")) : c.bold(c.red("SOME SUITES FAILED"));
  const totals = `${sum("passed")} passed  ·  ${sum("failed")} failed  ·  ${sum("skipped")} skipped  ·  ${seconds(sum("ms"))}`;

  console.log();
  box([...rows, "---", verdict, c.gray(totals)], allOk ? c.green : c.red, "Summary");
  console.log();
  process.exitCode = allOk ? 0 : 1;
}

// ---- make help ----

function help() {
  const t = (name, desc) => `${c.cyan(pad(name, 21))}${desc}`;
  console.log();
  box([
    c.bold("Government Service Navigator  -  tests"),
    "---",
    c.magenta("Agents"),
    t("make test-agent1", "Agent 1  -  Intake & Planning"),
    t("make test-agent2", "Agent 2  -  Eligibility & Document"),
    t("make test-agent3", "Agent 3  -  Action/Tool"),
    t("make test-agent4", "Agent 4  -  Validation & Safety"),
    t("make test-agents", "all agent and tool tests"),
    "",
    c.magenta("Backend"),
    t("make test-backend1", "Backend 1  -  Service catalog"),
    t("make test-backend2", "Backend 2  -  Citizen applications"),
    t("make test-backend3", "Backend 3  -  Verification"),
    t("make test-backend4", "Backend 4  -  Payments & finance"),
    t("make test-backend", "all API tests (Backend.Tests)"),
    "",
    c.magenta("Frontend"),
    t("make test-frontend", "web dashboard tests (Vitest)"),
    t("make web-install", "install the web dependencies"),
    "",
    t("make test", "every suite, with a summary"),
    "---",
    c.gray("Options: CONFIG=Debug|Release  VERBOSITY=normal  QUIET=1"),
  ], c.cyan, "make help");
  console.log();
}

// ---- Entry ----

const { command, opts } = parseArgs(process.argv.slice(2));
switch (command) {
  case "dotnet":
  case "npm":
    await runSuite(command, opts);
    break;
  case "reset":
    fs.writeFileSync(SUMMARY_FILE, "[]");
    break;
  case "summary":
    summary();
    break;
  default:
    help();
}
