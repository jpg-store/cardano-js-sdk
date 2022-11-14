import * as envalid from 'envalid';

export const getEnv = (override: NodeJS.ProcessEnv = {}) =>
  envalid.cleanEnv(
    { ...process.env, ...override },
    {
      ASSET_PROVIDER: envalid.str(),
      ASSET_PROVIDER_PARAMS: envalid.json({ default: {} }),
      CHAIN_HISTORY_PROVIDER: envalid.str(),
      CHAIN_HISTORY_PROVIDER_PARAMS: envalid.json({ default: {} }),
      DB_SYNC_CONNECTION_STRING: envalid.str(),
      KEY_MANAGEMENT_PARAMS: envalid.json({ default: {} }),
      KEY_MANAGEMENT_PROVIDER: envalid.str(),
      LOGGER_MIN_SEVERITY: envalid.str({ default: 'info' }),
      NETWORK_INFO_PROVIDER: envalid.str(),
      NETWORK_INFO_PROVIDER_PARAMS: envalid.json({ default: {} }),
      OGMIOS_SERVER_URL: envalid.str(),
      REWARDS_PROVIDER: envalid.str(),
      REWARDS_PROVIDER_PARAMS: envalid.json({ default: {} }),
      STAKE_POOL_PROVIDER: envalid.str(),
      STAKE_POOL_PROVIDER_PARAMS: envalid.json({ default: {} }),
      TX_SUBMIT_PROVIDER: envalid.str(),
      TX_SUBMIT_PROVIDER_PARAMS: envalid.json({ default: {} }),
      UTXO_PROVIDER: envalid.str(),
      UTXO_PROVIDER_PARAMS: envalid.json({ default: {} })
    }
  );

export const env = getEnv();