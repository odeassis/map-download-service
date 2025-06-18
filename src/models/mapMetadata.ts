export interface MapMetadata {
  mapId: string;
  version: string;
  lastUpdated: Date;
  size: number;
  regions: string[];
  checksum: string;
  tileChecksums: {
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