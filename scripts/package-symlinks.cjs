#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const FLAGS_DIR = path.join(ROOT, "flags");
const MANIFEST_PATH = path.join(ROOT, ".pack-symlink-manifest.json");

function walk(dir, onEntry) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, onEntry);
      continue;
    }

    onEntry(fullPath, entry);
  }
}

function materialize() {
  if (!fs.existsSync(FLAGS_DIR)) {
    process.exit(0);
  }

  const symlinks = [];

  walk(FLAGS_DIR, (fullPath) => {
    const stat = fs.lstatSync(fullPath);

    if (!stat.isSymbolicLink()) {
      return;
    }

    const target = fs.readlinkSync(fullPath);
    const targetPath = path.resolve(path.dirname(fullPath), target);

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Symlink target does not exist: ${fullPath} -> ${target}`);
    }

    const data = fs.readFileSync(targetPath);

    fs.unlinkSync(fullPath);
    fs.writeFileSync(fullPath, data);

    symlinks.push({
      path: path.relative(ROOT, fullPath),
      target,
      mode: stat.mode
    });
  });

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ symlinks }, null, 2) + "\n");

  if (symlinks.length > 0) {
    console.log(`Materialized ${symlinks.length} symlink(s) for npm packaging.`);
  }
}

function restore() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    process.exit(0);
  }

  const { symlinks } = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  for (const item of symlinks) {
    const fullPath = path.join(ROOT, item.path);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    fs.symlinkSync(item.target, fullPath);
  }

  fs.unlinkSync(MANIFEST_PATH);

  if (symlinks.length > 0) {
    console.log(`Restored ${symlinks.length} symlink(s) after npm packaging.`);
  }
}

const action = process.argv[2];

if (action === "materialize") {
  materialize();
} else if (action === "restore") {
  restore();
} else {
  console.error("Usage: node scripts/package-symlinks.cjs <materialize|restore>");
  process.exit(1);
}
