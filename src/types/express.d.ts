import * as express from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export interface UploadMapRequest {
  name?: string;
  description?: string;
  version?: string;
}

export {};
