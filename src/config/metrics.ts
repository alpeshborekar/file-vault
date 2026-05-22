import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
  Summary,
} from 'prom-client';

//Registry 

export const register = new Registry();

// Default Node.js metrics: event loop lag, memory, CPU, GC
collectDefaultMetrics({
  register,
  prefix: 'fv_node_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

//HTTP metrics 

export const httpRequestsTotal = new Counter({
  name:       'fv_http_requests_total',
  help:       'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers:  [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name:       'fv_http_request_duration_seconds',
  help:       'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers:  [register],
});

//Upload metrics 

export const uploadsTotal = new Counter({
  name:       'fv_uploads_total',
  help:       'Total file uploads',
  labelNames: ['type', 'deduplicated'],
  registers:  [register],
});

export const uploadBytesTotal = new Counter({
  name:      'fv_upload_bytes_total',
  help:      'Total bytes uploaded',
  registers: [register],
});

export const uploadDurationSeconds = new Histogram({
  name:       'fv_upload_duration_seconds',
  help:       'File upload duration in seconds',
  labelNames: ['type'],
  buckets:    [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers:  [register],
});

export const dedupHitsTotal = new Counter({
  name:      'fv_dedup_hits_total',
  help:      'Number of uploads that were deduplicated',
  registers: [register],
});

//File metrics 

export const deletionsTotal = new Counter({
  name:      'fv_deletions_total',
  help:      'Total file soft-deletions',
  registers: [register],
});

export const downloadsTotal = new Counter({
  name:       'fv_downloads_total',
  help:       'Total download URL generations',
  labelNames: ['via'],
  registers:  [register],
});

//Queue metrics 

export const jobsProcessedTotal = new Counter({
  name:       'fv_jobs_processed_total',
  help:       'Total BullMQ jobs processed',
  labelNames: ['queue', 'result'],
  registers:  [register],
});

export const jobDurationSeconds = new Histogram({
  name:       'fv_job_duration_seconds',
  help:       'BullMQ job processing duration in seconds',
  labelNames: ['queue', 'stage'],
  buckets:    [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers:  [register],
});

export const queueDepth = new Gauge({
  name:       'fv_queue_depth',
  help:       'Current number of jobs in the processing queue',
  labelNames: ['queue', 'state'],
  registers:  [register],
});

//Cache metrics 

export const cacheHitsTotal = new Counter({
  name:      'fv_cache_hits_total',
  help:      'Redis cache hits',
  registers: [register],
});

export const cacheMissesTotal = new Counter({
  name:      'fv_cache_misses_total',
  help:      'Redis cache misses',
  registers: [register],
});

export const cacheHitRatio = new Summary({
  name:          'fv_cache_hit_ratio',
  help:          'Rolling cache hit ratio (1=hit, 0=miss)',
  percentiles:   [0.5, 0.9, 0.99],
  maxAgeSeconds: 60,
  ageBuckets:    5,
  registers:     [register],
});

//auth metrics 

export const authAttemptsTotal = new Counter({
  name:       'fv_auth_attempts_total',
  help:       'Total authentication attempts',
  labelNames: ['result'],
  registers:  [register],
});

//Storage aggregates 

export const totalStorageUsedBytes = new Gauge({
  name:      'fv_storage_used_bytes_total',
  help:      'Total storage bytes used across all users',
  registers: [register],
});

export const activeUsersGauge = new Gauge({
  name:      'fv_active_users_total',
  help:      'Total registered users',
  registers: [register],
});