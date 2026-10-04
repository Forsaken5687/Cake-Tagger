import '../webext-api.js';
import * as server from './server-connection.mjs';
import './background.js';
globalThis.cakeServer = server;
