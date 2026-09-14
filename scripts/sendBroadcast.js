require('dotenv').config();
const { broadcastSocialUpdate } = require('../utils/emailBroadcast');

broadcastSocialUpdate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });