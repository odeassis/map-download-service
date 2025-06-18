# Map Download API

A simple Node.js service for downloading map files and retrieving map metadata. This service uses structured logging with request IDs for tracking and monitoring.

## Features

- **Structured Logging**: Uses Pino for structured logging with request IDs
- **Two Simple Routes**: Download maps and get map metadata
- **Error Handling**: Proper error handling with structured logging
- **TypeScript**: Full TypeScript support with proper type definitions

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   ```
2. Navigate to the project directory:
   ```
   cd map-download-api
   ```
3. Install dependencies:
   ```
   npm install
   ```

## Usage

To start the development server:

```
npm run dev
```

To build and start production server:

```
npm run build
npm start
```

The API will be available at `http://localhost:5045` (or your configured PORT).

## API Endpoints

### 1. Download Map

- **Endpoint**: `GET /map/:map_id/download`
- **Description**: Downloads the map file corresponding to the provided map ID
- **Parameters**:
  - `map_id`: The unique identifier for the map
- **Response**: Returns the map file as `application/octet-stream`
- **Headers**:
  - `Content-Disposition`: attachment; filename=map-{map_id}.mbtiles
  - `X-Request-ID`: Unique request identifier for tracking

### 2. Get Map Metadata

- **Endpoint**: `GET /map/:map_id/metadata`
- **Description**: Returns metadata information for the specified map ID
- **Parameters**:
  - `map_id`: The unique identifier for the map
- **Response**: JSON object containing map metadata
- **Headers**:
  - `X-Request-ID`: Unique request identifier for tracking

## Environment Variables

- `PORT`: Server port (default: 5045)
- `STORAGE_BASE_PATH`: Base path for map storage (default: src/archives/maps)

## Map Storage Structure

```
archives/
  maps/
    {map_id}.mbtiles          # Map tile files
    metadata/
      {map_id}.json          # Map metadata files
```

## Logging

All requests are logged with structured logging including:

- Request ID for tracing
- Request method and URL
- User agent
- Action-specific logging (download start/progress/completion, metadata retrieval)
- Error logging with detailed context

## Contributing

Feel free to submit issues or pull requests for improvements.
