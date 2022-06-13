import * as OpenApiValidator from 'express-openapi-validator';
import { DbSyncRewardsProvider } from './DbSyncRewardProvider/DbSyncRewards';
import { HttpService } from '../Http';
import { Logger, dummyLogger } from 'ts-log';
import { RewardsProvider } from '@cardano-sdk/core';
import { ServiceNames } from '../Program';
import { providerHandler } from '../util';
import express from 'express';
import path from 'path';

export interface RewardServiceDependencies {
  logger?: Logger;
  rewardsProvider: DbSyncRewardsProvider;
}

export class RewardsHttpService extends HttpService {
  #rewardsProvider: RewardsProvider;
  private constructor({ logger = dummyLogger, rewardsProvider }: RewardServiceDependencies, router: express.Router) {
    super(ServiceNames.Rewards, router, logger);
    this.#rewardsProvider = rewardsProvider;
  }
  async healthCheck() {
    return this.#rewardsProvider.healthCheck();
  }
  static create({ logger = dummyLogger, rewardsProvider }: RewardServiceDependencies) {
    const router = express.Router();
    const apiSpec = path.join(__dirname, 'openApi.json');
    router.use(
      OpenApiValidator.middleware({
        apiSpec,
        ignoreUndocumented: true,
        validateRequests: true,
        validateResponses: true
      })
    );
    router.post(
      '/account-balance',
      providerHandler(rewardsProvider.rewardAccountBalance.bind(rewardsProvider))(
        HttpService.routeHandler(logger),
        logger
      )
    );
    router.post(
      '/history',
      providerHandler(rewardsProvider.rewardsHistory.bind(rewardsProvider))(HttpService.routeHandler(logger), logger)
    );
    return new RewardsHttpService({ logger, rewardsProvider }, router);
  }
}