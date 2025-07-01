export interface MapMetadata {
  mapId: string;
  name: string;
  basename: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  version: string;
  metadata: {
    bounds: number[];
    center: number[];
    format: string;
    minzoom: number;
    maxzoom: number;
    attribution: string;
  };
  // Legacy fields for backward compatibility
  lastUpdated?: Date;
  size?: number;
  regions?: string[];
  checksum?: string;
  tileChecksums?: {
    [key: string]: string; // key format: "z/x/y"
  };
}

export interface TileUpdate {
  z: number;
  x: number;
  y: number;
  checksum: string;
  data?: Buffer;
}