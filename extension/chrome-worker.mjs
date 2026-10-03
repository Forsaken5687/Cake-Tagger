import '../webext-api.js';
import { handleSettings } from './settings-background.mjs';
import './background.js';
globalThis.cakeSettingsHandler = message => handleSettings(browser, message);
