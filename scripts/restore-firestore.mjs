// Restores Firestore from a backup JSON file produced by backup-firestore.mjs.
// DESTRUCTIVE: for each of the 4 collections present in the backup file, this
// deletes every existing doc in that collection, then rewrites the docs from
// the backup -- the same "wipe and rewrite" semantics as the app's own
// admin Import/Override screen, just covering all 4 collections (that
// screen only covers events/matches/pendingPlayers, not playerPayments).
//
// Meant to be run locally by an admin, not from CI -- keep the service
// account key used here (needs write access, e.g. roles/datastore.user)
// off GitHub Actions; the backup workflow's key only needs read access.
//
// Usage:
//   node restore-firestore.mjs ../data-backups/backup-2026-08-15T12-00-00-000Z.json --confirm
//
// Auth: same as backup-firestore.mjs (FIREBASE_SERVICE_ACCOUNT_KEY env var,
// or GOOGLE_APPLICATION_CREDENTIALS pointing at a local key file).

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ID = "ekta-indoor-games-80208";
const COLLECTIONS = ["events", "matches", "pendingPlayers", "playerPayments"];
const BATCH_LIMIT = 500; // Firestore's per-batch write cap

function credentialFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) return cert(JSON.parse(raw));
  return applicationDefault();
}

async function commitInChunks(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

async function main() {
  const filePath = process.argv[2];
  const confirmed = process.argv.includes("--confirm");
  if (!filePath) {
    console.error("Usage: node restore-firestore.mjs <backup-file.json> --confirm");
    process.exit(1);
  }

  const backup = JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  const present = COLLECTIONS.filter((name) => Array.isArray(backup[name]));

  console.log(`Backup file: ${filePath}`);
  console.log(`Exported at: ${backup.exportedAt || "unknown"}`);
  for (const name of present) {
    console.log(`  ${name}: ${backup[name].length} docs will replace whatever is currently in Firestore`);
  }
  if (!present.length) {
    console.error("Backup file has none of the expected collections -- nothing to restore.");
    process.exit(1);
  }

  if (!confirmed) {
    console.log("\nDry run only (pass --confirm to actually write). No changes made.");
    return;
  }

  initializeApp({ credential: credentialFromEnv(), projectId: PROJECT_ID });
  const db = getFirestore();

  for (const name of present) {
    const col = db.collection(name);
    const existing = await col.get();
    console.log(`Deleting ${existing.size} existing docs in "${name}"...`);
    await commitInChunks(
      db,
      existing.docs.map((d) => (batch) => batch.delete(d.ref)),
    );

    console.log(`Writing ${backup[name].length} docs into "${name}"...`);
    await commitInChunks(
      db,
      backup[name].map(({ id, ...fields }) => (batch) =>
        batch.set(col.doc(id), fields),
      ),
    );
  }

  console.log("\nRestore complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
