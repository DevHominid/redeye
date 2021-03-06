import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import app from './app';
import { HttpError } from './errors';
import router from './router';
import { logger } from './config/winston';
import DatabaseUtils from './utils/database';
import type { Config, Database, EnvConfig, ProxyEnv } from './types';

class Server {
  configId: string;

  database: Database | undefined;

  port: number;

  proxy: ProxyEnv | undefined;

  server: http.Server | null;

  constructor(config: EnvConfig) {
    this.configId = config.id;
    this.database = config.database;
    this.port = config.port ? parseInt(config.port, 10) : 8080;
    this.proxy = config.proxy;
    this.server = null;
  }

  init = async (): Promise<void> => {
    // Init server
    const server = http.createServer(app);

    // Set env config
    app.set('proxy', this.proxy);

    // Get & set JSON config
    try {
      const config = this.getConfiguration();
      app.set('config', config);
    } catch (err) {
      logger.error(
        `JSON configuration not found
        ${(err as Error).message}`,
      );
    }

    // Connect Database
    if (this.database) {
      await DatabaseUtils.initDB(app, this.database);
    }

    // Mount routing middleware
    app.use(router(app));

    // Init error handling
    app.use(
      (
        err: Error | HttpError,
        req: Request,
        res: Response,
        // NOTE: next is required for express error handling to function
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        next: NextFunction,
      ) => {
        let error = { ...err } as HttpError;
        if (!('status' in err)) {
          error = new HttpError(500, err.message);
        }
        logger.error(
          `Error: ${error.status} -
          Message: ${err.message}`,
        );
        res.status(error.status).send(err.message);
      },
    );

    this.server = server;
  };

  getConfiguration = (): Config => {
    const jsonPath = path.join(
      __dirname,
      '..',
      'json',
      `${this.configId}.json`,
    );
    const config = JSON.parse(fs.readFileSync(jsonPath).toString()) as Config;

    return config;
  };

  listen = (): void => {
    this.server?.listen(this.port, () =>
      logger.info(`RedEye listening on port ${this.port}!`),
    );
  };
}

export default Server;
