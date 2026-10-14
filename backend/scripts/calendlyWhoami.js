// Prints the Calendly account identity so you can copy the exact values into
// backend/.env. Also verifies the token works and that events are readable.
//
// Usage:  npm run calendly:whoami
// (set CALENDLY_API_ENABLED=true and CALENDLY_API_TOKEN in .env first)
require('dotenv').config();

const { calendlyConfigured, resolveScope } = require('../services/calendlyService');

async function main() {
  if (!calendlyConfigured()) {
    console.error('❌ Calendly is not configured.');
    console.error('   Set these in backend/.env and re-run:');
    console.error('     CALENDLY_API_ENABLED=true');
    console.error('     CALENDLY_API_TOKEN=<your personal access token>');
    process.exit(1);
  }

  try {
    const scope = await resolveScope();
    console.log('\n✅ Calendly token is valid. Copy these into backend/.env:\n');
    console.log(`CALENDLY_USER_URI=${scope.userUri || ''}`);
    console.log(`CALENDLY_ORGANIZATION=${scope.organization || ''}`);
    console.log(`\n   (discovered via ${scope.source === 'env' ? 'your .env values' : 'GET /users/me'})`);

    if (scope.organization) {
      console.log('\nℹ️  CALENDLY_ORGANIZATION is set, so "Check Calendly" matches bookings');
      console.log('   made with ANY team member — recommended. You can leave');
      console.log('   CALENDLY_USER_URI blank if you prefer auto-discovery.');
    } else {
      console.log('\nℹ️  No organization was returned for this token. Matching will be');
      console.log('   limited to events hosted by the user above.');
    }
    console.log('');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Could not talk to Calendly:', err.message);
    console.error('   Check that CALENDLY_API_TOKEN is a valid Personal Access Token');
    console.error('   (Calendly → Settings → Integrations → API & Webhooks).\n');
    process.exit(1);
  }
}

main();
