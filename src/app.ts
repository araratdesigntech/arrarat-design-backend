// Import all the dependencies
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv-safe';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import colors from 'colors';

// handle unhandled rejection error
import '@src/middlewares/errors/unhandledRejection';

// Import Routes
import api from '@src/api';

// Import Middleware
import { errorHandlerMiddleware, notFoundMiddleware } from '@src/middlewares';
// Import Api Docs
const swaggerDocument = YAML.load(`${process.cwd()}/swagger/swagger.yaml`);
// const swaggerDocument = YAML.load('./docs/swagger.yaml');

// Access Environment variables
dotenv.config();

colors.enable();

// Initialize app with express
const app: express.Application | undefined = express();

// Load App Middleware
app.use(morgan('dev'));
app.use(helmet());

const corsOptions = {
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'https://arrarat-designs.onrender.com',
  ],
  methods: 'GET, PUT, POST, DELETE, OPTIONS',
  credentials: true,
};

app.use(cors(corsOptions));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
  })
);

// Serve all static files inside public directory.
app.use('/static', express.static('public'));

// Routes which Should handle the requests
app.use('/api/v1', api);
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

export default app;
