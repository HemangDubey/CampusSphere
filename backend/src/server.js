const http = require('http');
const config = require('./config');
const { createApp } = require('./app');

function createServer() {
  return http.createServer(createApp());
}

if (require.main === module) {
  createServer().listen(config.port, () => console.log(`CampusSphere running at http://localhost:${config.port}`));
}
module.exports = { createServer };
