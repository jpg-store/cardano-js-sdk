const path = require('path');

module.exports = {
  config: {
    autoCompileOpts: {
      autoCompile: true,
      tsNodeOpts: {
        project: 'test/web-extension/tsconfig.json',
        transpileOnly: true
      }
    },
    bail: 0,
    baseUrl: 'http://localhost:4567',
    capabilities: [
      {
        acceptInsecureCerts: true,
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: [
            `--load-extension=${path.join(__dirname, 'dist')}`,
            '--disable-gpu',
            '--no-sandbox',
            '--enable-automation',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-web-security',
            '--allow-insecure-localhost'
          ]
        },
        maxInstances: 1
      }
    ],
    connectionRetryCount: 3,
    connectionRetryTimeout: 120_000,
    exclude: [],
    filesToWatch: [path.join(__dirname, 'dist')],
    framework: 'mocha',
    logLevel: 'info',
    maxInstances: 1,
    mochaOpts: {
      timeout: 60_000,
      ui: 'bdd'
    },
    reporters: ['spec'],
    services: [
      [
        'static-server',
        {
          folders: [
            { mount: '/', path: path.join(__dirname, 'dapp/build') },
            { mount: '/cip95-cardano-wallet-connector', path: path.join(__dirname, 'dapp-cip95/build') }
          ]
        }
      ],
      'chromedriver'
    ],
    specs: ['./**/*.spec.ts'],
    waitforTimeout: 10_000
  }
};
