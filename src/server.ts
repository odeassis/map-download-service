import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import pino from "pino";
import { v4 as uuidv4 } from "uuid";
import router from "./routes/mapRoutes";
import { swaggerSpec, swaggerUi, swaggerUiOptions } from "./config/swagger";

dotenv.config();

const logger = pino({
  level: "info",
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
  res.setHeader("X-Request-ID", requestId);

  logger.info(
    {
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.get("User-Agent"),
    },
    "Incoming request"
  );

  next();
});

app.use(express.json());

// Swagger documentation endpoint
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, swaggerUiOptions)
);

// API documentation JSON endpoint
app.get("/swagger.json", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Health check endpoint for Docker
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Root endpoint with API information
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    service: "Map Download Service API",
    version: "1.0.0",
    description:
      "A comprehensive API for managing and serving map files in MBTiles format",
    endpoints: {
      documentation: "/api-docs",
      swagger_json: "/swagger.json",
      health: "/health",
    },
    timestamp: new Date().toISOString(),
  });
});

app.use(router);

app.listen(port, () => {
  logger.info({ port }, "Server is running");
});
