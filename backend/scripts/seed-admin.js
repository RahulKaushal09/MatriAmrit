#!/usr/bin/env node
/* =====================================================================
   Seed or reset an admin account.

     npm run seed:admin                 # reads ADMIN_USERNAME / ADMIN_PASSWORD
     npm run seed:admin -- bunny s3cret # or takes them as arguments

   Safe to re-run: an existing username has its password reset rather
   than being duplicated, and every outstanding session for it is
   retired. The plaintext password is never written anywhere - only a
   bcrypt hash reaches the database.
   ===================================================================== */
'use strict';

const env = require('../src/config/env');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const Admin = require('../src/models/Admin');

const MIN_PASSWORD = 8;

async function main() {
  const [argUsername, argPassword] = process.argv.slice(2);

  const username = (argUsername || process.env.ADMIN_USERNAME || '').toLowerCase().trim();
  const password = argPassword || process.env.ADMIN_PASSWORD || '';

  if (!username || !password) {
    console.error(
      '\n✗ Nothing to seed.\n' +
      '  Set ADMIN_USERNAME and ADMIN_PASSWORD in backend/.env, or pass them:\n' +
      '    npm run seed:admin -- <username> <password>\n'
    );
    process.exit(1);
  }

  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    console.error('\n✗ A username is 3-40 characters of a-z, 0-9, dot, underscore or hyphen.\n');
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD) {
    console.error(`\n✗ Choose a password of at least ${MIN_PASSWORD} characters.\n`);
    process.exit(1);
  }

  await connectDatabase();

  const passwordHash = await Admin.hashPassword(password);
  const existing = await Admin.findOne({ username });

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.active = true;
    existing.failedAttempts = 0;
    existing.lockedUntil = null;
    /* Any session opened with the old password stops working now. */
    existing.revokeExistingTokens();
    await existing.save();
    console.log(`\n✓ Password reset for "${username}" (${existing.role}). Existing sessions signed out.\n`);
  } else {
    /* The first account created is the owner; anyone seeded later is
       staff until an owner promotes them. */
    const isFirst = (await Admin.countDocuments()) === 0;
    const admin = await Admin.create({
      username,
      passwordHash,
      role: isFirst ? 'owner' : 'staff',
      name: null,
    });
    console.log(`\n✓ Admin "${admin.username}" created as ${admin.role}.\n`);
  }

  if (env.NODE_ENV === 'production' && process.env.ADMIN_PASSWORD) {
    console.log('  Now remove ADMIN_PASSWORD from .env - it is not needed again.\n');
  }

  await disconnectDatabase();
}

main().catch(async err => {
  console.error('\n✗ Could not seed the admin:', err.message, '\n');
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
