import express, { Application } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import Controller from './main.controller';
import DataService from './services/postgres';
import errorHandler from './middleware/errorHandler';
import routeToFrontEnd from './utils/routeToFrontEnd';

class App {
  public app: Application;

  public controller: Controller;

  constructor() {
    this.app = express();
    this.controller = new Controller(new DataService());
    this.setConfig();
  }

  private setConfig(): void {
    const { app } = this;
    app.use(helmet());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cors());
    app.use(cookieParser());
    app.use(
      morgan(':method :url :status :res[content-length] - :response-time ms')
    );
    app.use('/api', this.controller.router);
    routeToFrontEnd(app);
    app.use(errorHandler);
  }
}

export default new App().app;
