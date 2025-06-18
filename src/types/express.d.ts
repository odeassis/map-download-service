import * as express from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export { };
