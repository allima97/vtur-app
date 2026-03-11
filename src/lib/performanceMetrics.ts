/**
 * Performance Metrics Collector
 * Collects and persists real-time performance data from NetMetrics
 * Stores in localStorage for historical comparison and admin dashboard
 */

export type MetricsSnapshot = {
  timestamp: number;
  screen: string;
  totalRequests: number;
  bffRequests: number;
  supabaseRequests: number;
  avgTTFBMs: number;
  topEndpoints: Array<{
    url: string;
    count: number;
    avgDurationMs: number;
  }>;
};

export type HistoricalData = {
  recordingStarted: number;
  recordingEnded?: number;
  snapshots: MetricsSnapshot[];
};

export type PerformanceSummary = {
  totalSnapshots: number;
  avgTotalRequests: number;
  avgBffRequests: number;
  avgSupabaseRequests: number;
  avgTTFBMs: number;
  maxTotalRequests: number;
  minTotalRequests: number;
  recordingDurationMs: number;
};

const STORAGE_KEY = "sgtur:perf_metrics";
const MAX_SNAPSHOTS = 2000;

export class PerformanceMetricsCollector {
  private isRecording = false;
  private recordingInterval: ReturnType<typeof setInterval> | null = null;
  private snapshotBuffer: MetricsSnapshot[] = [];
  private recordingStartTime = 0;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Start recording performance metrics
   */
  startRecording(): void {
    if (this.isRecording) return;

    this.isRecording = true;
    this.recordingStartTime = Date.now();
    this.snapshotBuffer = [];

    // Record every 5 seconds
    this.recordingInterval = setInterval(() => {
      this.recordSnapshot();
    }, 5000);

    console.log("Performance recording started");
  }

  /**
   * Stop recording and persist to localStorage
   */
  stopRecording(): void {
    if (!this.isRecording) return;

    this.isRecording = false;
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }

    this.saveToStorage();
    console.log("Performance recording stopped");
  }

  /**
   * Record a single snapshot from NetMetrics
   */
  recordSnapshot(snapshot?: MetricsSnapshot): void {
    if (!snapshot) {
      // If no snapshot provided, try to get from window
      const data = (window as any).__sgtur_perf_snapshot;
      if (!data) return;
      snapshot = data;
    }

    if (this.snapshotBuffer.length >= MAX_SNAPSHOTS) {
      this.snapshotBuffer.shift(); // Remove oldest
    }

    this.snapshotBuffer.push(snapshot);
  }

  /**
   * Get current recording status
   */
  isRecordingActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get number of recorded snapshots
   */
  getSnapshotCount(): number {
    return this.snapshotBuffer.length;
  }

  /**
   * Get all recorded snapshots
   */
  getSnapshots(): MetricsSnapshot[] {
    return [...this.snapshotBuffer];
  }

  /**
   * Get aggregated summary of historical data
   */
  getSummary(): PerformanceSummary | null {
    if (this.snapshotBuffer.length === 0) return null;

    const totalRequests = this.snapshotBuffer.map((s) => s.totalRequests);
    const bffRequests = this.snapshotBuffer.map((s) => s.bffRequests);
    const sbRequests = this.snapshotBuffer.map(
      (s) => s.supabaseRequests
    );
    const ttfbs = this.snapshotBuffer.map((s) => s.avgTTFBMs);

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avg = (arr: number[]) => (arr.length > 0 ? sum(arr) / arr.length : 0);

    return {
      totalSnapshots: this.snapshotBuffer.length,
      avgTotalRequests: Math.round(avg(totalRequests)),
      avgBffRequests: Math.round(avg(bffRequests)),
      avgSupabaseRequests: Math.round(avg(sbRequests)),
      avgTTFBMs: Math.round(avg(ttfbs)),
      maxTotalRequests: Math.max(...totalRequests),
      minTotalRequests: Math.min(...totalRequests),
      recordingDurationMs: Date.now() - this.recordingStartTime,
    };
  }

  /**
   * Get metrics by screen
   */
  getMetricsByScreen(): Record<string, PerformanceSummary> {
    const grouped: Record<string, MetricsSnapshot[]> = {};

    for (const snapshot of this.snapshotBuffer) {
      if (!grouped[snapshot.screen]) {
        grouped[snapshot.screen] = [];
      }
      grouped[snapshot.screen].push(snapshot);
    }

    const result: Record<string, PerformanceSummary> = {};
    for (const [screen, snapshots] of Object.entries(grouped)) {
      const totalRequests = snapshots.map((s) => s.totalRequests);
      const bffRequests = snapshots.map((s) => s.bffRequests);
      const sbRequests = snapshots.map((s) => s.supabaseRequests);
      const ttfbs = snapshots.map((s) => s.avgTTFBMs);

      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
      const avg = (arr: number[]) =>
        arr.length > 0 ? sum(arr) / arr.length : 0;

      result[screen] = {
        totalSnapshots: snapshots.length,
        avgTotalRequests: Math.round(avg(totalRequests)),
        avgBffRequests: Math.round(avg(bffRequests)),
        avgSupabaseRequests: Math.round(avg(sbRequests)),
        avgTTFBMs: Math.round(avg(ttfbs)),
        maxTotalRequests: Math.max(...totalRequests),
        minTotalRequests: Math.min(...totalRequests),
        recordingDurationMs: Date.now() - this.recordingStartTime,
      };
    }

    return result;
  }

  /**
   * Clear all recorded data
   */
  clearData(): void {
    this.snapshotBuffer = [];
    this.stopRecording();
    localStorage.removeItem(STORAGE_KEY);
    console.log("Performance data cleared");
  }

  /**
   * Save snapshots to localStorage
   */
  private saveToStorage(): void {
    try {
      const data: HistoricalData = {
        recordingStarted: this.recordingStartTime,
        recordingEnded: Date.now(),
        snapshots: this.snapshotBuffer,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("Failed to save performance metrics:", err);
    }
  }

  /**
   * Load snapshots from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: HistoricalData = JSON.parse(stored);
        this.snapshotBuffer = data.snapshots || [];
        this.recordingStartTime = data.recordingStarted || Date.now();
      }
    } catch (err) {
      console.error("Failed to load performance metrics:", err);
      this.snapshotBuffer = [];
    }
  }

  /**
   * Export data as JSON
   */
  exportAsJSON(): string {
    const data: HistoricalData = {
      recordingStarted: this.recordingStartTime,
      recordingEnded: Date.now(),
      snapshots: this.snapshotBuffer,
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import data from JSON
   */
  importFromJSON(jsonString: string): boolean {
    try {
      const data: HistoricalData = JSON.parse(jsonString);
      this.snapshotBuffer = data.snapshots || [];
      this.recordingStartTime = data.recordingStarted || Date.now();
      this.saveToStorage();
      return true;
    } catch (err) {
      console.error("Failed to import performance metrics:", err);
      return false;
    }
  }
}

// Singleton instance
export const performanceMetrics = new PerformanceMetricsCollector();
