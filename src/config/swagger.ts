import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Kothe Map Download Service API",
      version: "1.0.0",
      description: "A API for managing and serving map files in MBTiles format",
      contact: {
        name: "API Support",
        email: "support@mapservice.com",
      },
      license: {
        name: "ISC",
        url: "https://opensource.org/licenses/ISC",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
      {
        url: "https://api.mapservice.com",
        description: "Production server",
      },
    ],
    components: {
      schemas: {
        MapMetadata: {
          type: "object",
          required: [
            "mapId",
            "name",
            "basename",
            "description",
            "createdAt",
            "updatedAt",
            "version",
            "metadata",
          ],
          properties: {
            mapId: {
              type: "string",
              format: "uuid",
              description: "Unique identifier for the map",
              example: "b56e23d1-76e5-4a3a-9268-82c93cb49a01",
            },
            name: {
              type: "string",
              description: "Human-readable name of the map",
              example: "City Navigation Map",
            },
            basename: {
              type: "string",
              description: "Filename of the map file",
              example: "b56e23d1-76e5-4a3a-9268-82c93cb49a01.mbtiles",
            },
            description: {
              type: "string",
              description: "Detailed description of the map",
              example: "High-resolution city map with street-level detail",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "ISO timestamp when the map was created",
              example: "2025-09-17T10:30:00.000Z",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "ISO timestamp when the map was last updated",
              example: "2025-09-17T10:30:00.000Z",
            },
            version: {
              type: "string",
              description: "Version number of the map",
              example: "1.2.0",
            },
            metadata: {
              type: "object",
              properties: {
                bounds: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 4,
                  maxItems: 4,
                  description: "Bounding box [west, south, east, north]",
                  example: [-180, -85, 180, 85],
                },
                center: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 3,
                  maxItems: 3,
                  description: "Center point [longitude, latitude, zoom]",
                  example: [0, 0, 2],
                },
                format: {
                  type: "string",
                  description: "Map format",
                  example: "mbtiles",
                },
                minzoom: {
                  type: "integer",
                  minimum: 0,
                  description: "Minimum zoom level",
                  example: 0,
                },
                maxzoom: {
                  type: "integer",
                  maximum: 22,
                  description: "Maximum zoom level",
                  example: 18,
                },
                attribution: {
                  type: "string",
                  description: "Attribution text for the map data",
                  example: "Map data upload",
                },
              },
              required: [
                "bounds",
                "center",
                "format",
                "minzoom",
                "maxzoom",
                "attribution",
              ],
            },
            size: {
              type: "integer",
              description: "File size in bytes",
              example: 1048576,
            },
            checksum: {
              type: "string",
              description: "MD5 checksum of the map file",
              example: "a1b2c3d4e5f6789012345678901234567",
            },
            tileChecksums: {
              type: "object",
              additionalProperties: {
                type: "string",
              },
              description: "Checksums for individual tiles",
              example: {
                "0/0/0": "abc123",
                "1/0/0": "def456",
              },
            },
          },
        },
        UploadRequest: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Custom name for the map",
              example: "My Custom Map",
            },
            description: {
              type: "string",
              description: "Description of the map",
              example: "A detailed map of the downtown area",
            },
            version: {
              type: "string",
              description: "Version number for the map",
              example: "1.0.0",
            },
          },
        },
        UploadResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "Map uploaded successfully",
            },
            mapId: {
              type: "string",
              format: "uuid",
              example: "b56e23d1-76e5-4a3a-9268-82c93cb49a01",
            },
            metadata: {
              $ref: "#/components/schemas/MapMetadata",
            },
            requestId: {
              type: "string",
              description: "Unique request identifier",
              example: "req_12345",
            },
          },
        },
        LatestVersionResponse: {
          type: "object",
          properties: {
            mapId: {
              type: "string",
              format: "uuid",
              example: "b56e23d1-76e5-4a3a-9268-82c93cb49a01",
            },
            version: {
              type: "string",
              example: "1.2.0",
            },
            uploadTime: {
              type: "string",
              format: "date-time",
              description: "ISO timestamp when the map was uploaded",
              example: "2025-09-18T10:30:00.000Z",
            },
            mapName: {
              type: "string",
              description: "Name of the uploaded map",
              example: "City Navigation Map",
            },
            metadata: {
              $ref: "#/components/schemas/MapMetadata",
            },
            requestId: {
              type: "string",
              example: "req_12345",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Error message",
              example: "Map not found",
            },
            details: {
              type: "string",
              description: "Additional error details",
              example: "The specified map ID does not exist",
            },
            requestId: {
              type: "string",
              description: "Unique request identifier",
              example: "req_12345",
            },
          },
          required: ["error"],
        },
      },
      parameters: {
        MapId: {
          name: "map_id",
          in: "path",
          required: true,
          schema: {
            type: "string",
            format: "uuid",
          },
          description: "Unique identifier for the map",
          example: "b56e23d1-76e5-4a3a-9268-82c93cb49a01",
        },
      },
      responses: {
        BadRequest: {
          description: "Bad request - invalid input",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
        InternalServerError: {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Maps",
        description: "Operations related to map management and download",
      },
    ],
  },
  apis: ["./src/controllers/*.ts", "./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
export const swaggerUiOptions = {
  explorer: true,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
  },
};

export { swaggerUi };
