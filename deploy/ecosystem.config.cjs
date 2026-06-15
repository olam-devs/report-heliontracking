/** PM2 on VPS — replaces helion-report-portal on port 3002 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'helion-fleet-reporter',
      cwd: path.join(__dirname, '..'),
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '7G',
      node_args: '--max-old-space-size=8192',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
  ],
};
