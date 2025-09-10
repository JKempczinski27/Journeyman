// src/config/adobeConfig.js
// Adobe Analytics configuration for Journeyman game

const ADOBE_CONFIG = {
  development: {
    reportSuiteId: process.env.REACT_APP_ADOBE_DEV_REPORT_SUITE_ID || 'your-dev-rsid',
    trackingServer: process.env.REACT_APP_ADOBE_DEV_TRACKING_SERVER || 'your-dev-tracking-server.sc.omtrdc.net',
    visitorNamespace: 'journeyman-dev',
    enabled: process.env.NODE_ENV === 'development'
  },
  production: {
    reportSuiteId: process.env.REACT_APP_ADOBE_PROD_REPORT_SUITE_ID || 'your-prod-rsid',
    trackingServer: process.env.REACT_APP_ADOBE_PROD_TRACKING_SERVER || 'your-prod-tracking-server.sc.omtrdc.net',
    visitorNamespace: 'journeyman-prod',
    enabled: process.env.NODE_ENV === 'production'
  }
};

// Get current environment config
const currentConfig = process.env.NODE_ENV === 'production' 
  ? ADOBE_CONFIG.production 
  : ADOBE_CONFIG.development;

// Event mapping for Journeyman game
export const JOURNEYMAN_EVENTS = {
  GAME_START: 'event1',
  GAME_COMPLETE: 'event2', 
  GUESS_SUBMITTED: 'event3',
  CORRECT_GUESS: 'event4',
  WRONG_GUESS: 'event5',
  GAME_QUIT: 'event6',
  MODE_SELECTED: 'event7',
  SOCIAL_SHARE: 'event8',
  PLAYER_REGISTRATION: 'event9',
  NEXT_PLAYER: 'event10'
};

// Props and eVars mapping
export const ADOBE_VARIABLES = {
  props: {
    PLAYER_NAME: 'prop1',
    GAME_MODE: 'prop2', 
    CURRENT_PLAYER: 'prop3',
    SCORE: 'prop4',
    DURATION: 'prop5',
    DEVICE_TYPE: 'prop6',
    GUESS_COUNT: 'prop7'
  },
  eVars: {
    PLAYER_EMAIL: 'eVar1',
    GAME_MODE: 'eVar2',
    SESSION_ID: 'eVar3',
    DIFFICULTY: 'eVar4',
    DEVICE_TYPE: 'eVar5',
    COMPLETION_STATUS: 'eVar6'
  }
};

export default currentConfig;