import './webext-api.js';
import * as server from './server-connection.mjs';
import { createCommandRelay } from './command-relay.mjs';
import './background.js';
globalThis.cakeServer = server;
globalThis.cakeCommands = createCommandRelay(browser.runtime);
