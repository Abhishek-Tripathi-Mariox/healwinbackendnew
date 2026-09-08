/**
 * Add newly-shipped permissions to the roles already stored in the database.
 *
 * A role's permissions are a LIST STORED ON THE ROLE DOCUMENT. Adding a
 * permission to the code does not touch existing roles, and the admin sidebar
 * hides any module whose permission the signed-in role does not hold — for
 * every role including Super Admin. So a new module is invisible until its
 * permission is granted, which is what this fixes.
 *
 * Deliberately ADD-ONLY. `npm run seed:roles` overwrites each default role's
 * permission list wholesale, which silently discards anything tweaked in the
 * role editor; this only ever adds, so customisations survive.
 *
 * Super Admin is always brought to the full set — "all permissions" is its
 * definition, not a policy choice.
 *
 * Usage:
 *   npm run sync:roles            # report what is missing, change nothing
 *   npm run sync:roles -- --apply # actually add them
 */
import mongoose from "mongoose";
import config from "../config";
import { Role, PERMISSIONS, DEFAULT_ROLES } from "../models/role.model";

const run = async () => {
  const apply = process.argv.includes("--apply");
  await mongoose.connect(config.database.url);

  const ALL = Object.values(PERMISSIONS) as string[];
  const byName = new Map<string, string[]>();
  for (const def of Object.values(DEFAULT_ROLES) as any[]) {
    byName.set(def.name, def.permissions as string[]);
  }

  const roles = await Role.find();
  let changed = 0;

  for (const role of roles) {
    const current = new Set<string>(role.permissions || []);
    // Super Admin gets everything; any other known role gets whatever its
    // definition lists that it does not already hold.
    const target =
      role.name === DEFAULT_ROLES.SUPER_ADMIN.name
        ? ALL
        : byName.get(role.name) || [];
    const toAdd = target.filter((p) => !current.has(p));
    // Permissions deleted from the code but still stored on the role. These
    // have to go: the Role model validates every entry against the current
    // list, so a stale one makes the document unsaveable. Reported by name
    // rather than dropped quietly.
    const stale = [...current].filter((p) => !ALL.includes(p));

    if (toAdd.length === 0 && stale.length === 0) {
      console.log(`  ⏭️  ${role.name} — already up to date (${current.size})`);
      continue;
    }
    if (toAdd.length) {
      console.log(
        `  ${apply ? "✅" : "•"} ${role.name} — ${apply ? "adding" : "would add"} ${toAdd.length}: ${toAdd.join(", ")}`,
      );
    }
    if (stale.length) {
      console.log(
        `  ${apply ? "🗑 " : "•"} ${role.name} — ${apply ? "dropping" : "would drop"} ${stale.length} removed from the code: ${stale.join(", ")}`,
      );
    }
    if (apply) {
      role.permissions = [...current, ...toAdd].filter((p) => ALL.includes(p));
      await role.save();
    }
    changed += 1;
  }

  console.log(
    apply
      ? `\n✅ ${changed} role(s) updated. Sign out and back in — the menu is built from the permissions in your token.`
      : `\n${changed} role(s) would change. Re-run with --apply to write them.`,
  );
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error("❌ sync failed:", e);
  process.exit(1);
});
