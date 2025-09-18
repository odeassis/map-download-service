/**
 * Utility functions for calculating and formatting metrics for upload/download operations
 */

export interface TransferMetrics {
  bytesTransferred: number;
  totalSize: number;
  progress: number;
  speed: number;
  speedFormatted: string;
  elapsedTime: number;
  estimatedTimeRemaining?: number;
  throughput?: number;
}

export class MetricsCalculator {
  /**
   * Calculate transfer metrics
   */
  static calculateTransferMetrics(
    bytesTransferred: number,
    totalSize: number,
    startTime: number,
    currentTime: number = Date.now()
  ): TransferMetrics {
    const elapsedTime = (currentTime - startTime) / 1000; // in seconds
    const progress = Math.round((bytesTransferred / totalSize) * 100);
    const speedBytesPerSecond =
      elapsedTime > 0 ? bytesTransferred / elapsedTime : 0;
    const speedMBPerSecond = speedBytesPerSecond / (1024 * 1024);

    // Estimate time remaining
    let estimatedTimeRemaining: number | undefined;
    if (speedBytesPerSecond > 0 && progress < 100) {
      const remainingBytes = totalSize - bytesTransferred;
      estimatedTimeRemaining = remainingBytes / speedBytesPerSecond;
    }

    return {
      bytesTransferred,
      totalSize,
      progress,
      speed: speedMBPerSecond,
      speedFormatted: this.formatSpeed(speedMBPerSecond),
      elapsedTime,
      estimatedTimeRemaining,
      throughput: speedBytesPerSecond,
    };
  }

  /**
   * Format file size in human readable format
   */
  static formatFileSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Format speed in human readable format
   */
  static formatSpeed(mbPerSecond: number): string {
    if (mbPerSecond >= 1024) {
      return `${(mbPerSecond / 1024).toFixed(2)} GB/s`;
    } else if (mbPerSecond >= 1) {
      return `${mbPerSecond.toFixed(2)} MB/s`;
    } else {
      return `${(mbPerSecond * 1024).toFixed(2)} KB/s`;
    }
  }

  /**
   * Format time duration in human readable format
   */
  static formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const remainingMinutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${remainingMinutes}m`;
    }
  }

  /**
   * Check if progress should be logged (at specific intervals)
   */
  static shouldLogProgress(
    progress: number,
    lastLoggedProgress: number,
    logInterval: number = 10
  ): boolean {
    return (
      Math.floor(progress / logInterval) >
      Math.floor(lastLoggedProgress / logInterval)
    );
  }

  /**
   * Calculate network efficiency metrics
   */
  static calculateNetworkMetrics(
    bytesTransferred: number,
    elapsedTime: number,
    packetCount?: number
  ): {
    throughputMbps: number;
    avgPacketSize?: number;
    packetsPerSecond?: number;
  } {
    const throughputBps = bytesTransferred / elapsedTime;
    const throughputMbps = (throughputBps * 8) / (1024 * 1024); // Convert to Mbps

    const result: any = { throughputMbps };

    if (packetCount && packetCount > 0) {
      result.avgPacketSize = bytesTransferred / packetCount;
      result.packetsPerSecond = packetCount / elapsedTime;
    }

    return result;
  }
}
