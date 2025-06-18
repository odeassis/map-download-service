import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import router from './routes/mapRoutes';

dotenv.config();

const logger = pino({
  level: 'info',
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const port = process.env.PORT || 5045;
const app = express();

// Middleware to add request ID and structured logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  logger.info({
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
  }, 'Incoming request');

  next();
});

app.use(express.json());
app.use(router);

app.listen(port, () => {
  logger.info({ port }, 'Server is running');
});

