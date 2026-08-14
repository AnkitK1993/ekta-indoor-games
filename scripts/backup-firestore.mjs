// Snapshots every collection this app writes to (events, matches,
// pendingPlayers, playerPayments) into a single timestamped JSON file under
// data-backups/. Read-only against Firestore -- never writes anything back.
//
// Auth: set FIREBASE_SERVICE_ACCOUNT_KEY to the full JSON contents of a
// service account key with Firestore read access (roles/datastore.viewer is
// enough). Locally you can instead set GOOGLE_APPLICATION_CREDENTIALS to a
// key file path.
//
// Usage: node backup-firestore.mjs [output-dir]   (defaults to ../data-backups)

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ID = "ekta-indoor-games-80208";
const COLLECTIONS = ["events", "matches", "pendingPlayers", "playerPayments"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(
  __dirname,
  process.argv[2] || "../data-backups",
);

function credentialFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) return cert(JSON.parse(raw));
  return applicationDefault(); // falls back to GOOGLE_APPLICATION_CREDENTIALS
}

// Firestore Timestamps aren't JSON-serializable as-is; store them as ISO
// strings. Nothing in index.html reads updatedAt as a Timestamp (write-only
// field), so this round-trips safely through restore-firestore.mjs.
function serializeValue(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeValue(v);
    return out;
  }
  return value;
}

async function main() {
  initializeApp({ credential: credentialFromEnv(), projectId: PROJECT_ID });
  const db = getFirestore();

  const backup = { exportedAt: new Date().toISOString(), projectId: PROJECT_ID };
  let totalDocs = 0;

  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    backup[name] = snap.docs.map((d) => ({
      id: d.id,
      ...serializeValue(d.data()),
    }));
    totalDocs += backup[name].length;
    console.log(`  ${name}: ${backup[name].length} docs`);
  }

  await mkdir(outDir, { recursive: true });
  const stamp = backup.exportedAt.replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `backup-${stamp}.json`);
  await writeFile(outPath, JSON.stringify(backup, null, 2) + "\n");
  console.log(`Wrote ${outPath} (${totalDocs} docs total)`);

  // Keep the last 30 snapshots so the repo doesn't grow unbounded -- at
  // every-4-hours this is roughly 5 days of history, generous for a 2-day
  // event plus the run-up to it.
  const KEEP = 30;
  const existing = (await readdir(outDir))
    .filter((f) => /^backup-.*\.json$/.test(f))
    .sort();
  const stale = existing.slice(0, Math.max(0, existing.length - KEEP));
  for (const f of stale) {
    await import("node:fs/promises").then((fs) => fs.unlink(path.join(outDir, f)));
    console.log(`Pruned old backup ${f}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
