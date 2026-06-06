/**
 * Scalability Configuration for 100K+ Concurrent Users
 *
 * This file contains recommended settings and infrastructure setup
 * for handling high-load scenarios in the HealWin platform.
 */

export const scalabilityConfig = {
  /**
   * MongoDB Configuration for High Load
   */
  mongodb: {
    // Connection pool size per server instance
    poolSize: 100,

    // Read from secondary replicas for read-heavy operations
    readPreference: "secondaryPreferred",

    // Write concern for data durability
    writeConcern: {
      w: "majority",
      j: true,
    },

    // Replica set configuration
    replicaSet: {
      enabled: true,
      name: "healwin-rs",
      members: 3, // Primary + 2 Secondaries
    },

    // Sharding for horizontal scaling (future)
    sharding: {
      enabled: false, // Enable when single replica set is not enough
      shardKey: { userId: "hashed" },
    },

    // Recommended indexes for high-load queries
    criticalIndexes: [
      { collection: "bookings", index: { status: 1, createdAt: -1 } },
      {
        collection: "bookings",
        index: { userId: 1, status: 1, createdAt: -1 },
      },
      { collection: "bookings", index: { driverId: 1, status: 1 } },
      {
        collection: "drivers",
        index: { status: 1, isOnline: 1, isDeleted: 1 },
      },
      { collection: "driverlocations", index: { location: "2dsphere" } },
      { collection: "users", index: { mobileNumber: 1, isDeleted: 1 } },
    ],
  },

  /**
   * Redis Configuration
   */
  redis: {
    // Use Redis Cluster for high availability
    cluster: {
      enabled: true,
      nodes: 6, // 3 masters + 3 replicas
    },

    // Cache TTLs
    cacheTTL: {
      vehicleTypes: 3600, // 1 hour
      fareConfig: 300, // 5 minutes
      appConfig: 300, // 5 minutes
      userSession: 86400, // 24 hours
      driverLocation: 30, // 30 seconds
    },

    // Rate limiting config
    rateLimiting: {
      enabled: true,
      defaultWindowSeconds: 60,
      defaultMaxRequests: 100,
    },
  },

  /**
   * Application Server Configuration
   */
  server: {
    // Number of instances (use PM2 cluster mode or container orchestration)
    instances: "max", // Use all available CPUs

    // Request timeouts
    requestTimeout: 30000, // 30 seconds

    // Keep-alive settings
    keepAliveTimeout: 65000,
    headersTimeout: 66000,

    // Body parser limits
    bodyLimit: "10mb",

    // Compression
    compression: {
      enabled: true,
      threshold: 1024, // 1KB
    },
  },

  /**
   * Load Balancer Configuration (AWS ALB / nginx)
   */
  loadBalancer: {
    algorithm: "least_outstanding_requests",
    healthCheck: {
      path: "/health",
      interval: 30,
      timeout: 5,
      unhealthyThreshold: 3,
    },
    stickySessions: false, // Stateless with Redis
  },

  /**
   * WebSocket Configuration (for real-time features)
   */
  websocket: {
    adapter: "redis", // Use Redis adapter for multi-instance
    pingInterval: 25000,
    pingTimeout: 5000,
    maxPayload: 1024 * 1024, // 1MB
  },

  /**
   * Queue Configuration (for async processing)
   */
  queue: {
    provider: "bullmq", // Use BullMQ with Redis
    queues: [
      {
        name: "notifications",
        concurrency: 10,
        retries: 3,
      },
      {
        name: "driver-matching",
        concurrency: 50,
        retries: 2,
      },
      {
        name: "fare-calculation",
        concurrency: 20,
        retries: 2,
      },
      {
        name: "invoice-generation",
        concurrency: 5,
        retries: 3,
      },
      {
        name: "email",
        concurrency: 10,
        retries: 3,
      },
    ],
  },

  /**
   * CDN Configuration
   */
  cdn: {
    provider: "cloudfront", // or "cloudflare"
    cacheControl: {
      staticAssets: "public, max-age=31536000", // 1 year
      images: "public, max-age=86400", // 1 day
      api: "no-store", // No caching for API
    },
  },

  /**
   * Monitoring & Observability
   */
  monitoring: {
    apm: {
      provider: "datadog", // or "newrelic", "elastic-apm"
      sampleRate: 0.1, // Sample 10% of requests in production
    },
    logging: {
      level: "info",
      format: "json",
      destination: "cloudwatch", // or "elasticsearch"
    },
    metrics: {
      enabled: true,
      pushGateway: true, // For Prometheus
    },
    alerts: {
      errorRateThreshold: 0.01, // 1%
      latencyP99Threshold: 3000, // 3 seconds
      cpuThreshold: 80, // 80%
      memoryThreshold: 85, // 85%
    },
  },

  /**
   * Auto-scaling Configuration
   */
  autoScaling: {
    enabled: true,
    minInstances: 3,
    maxInstances: 50,
    targetCPU: 70, // Scale up when CPU > 70%
    targetMemory: 75, // Scale up when memory > 75%
    scaleUpCooldown: 180, // 3 minutes
    scaleDownCooldown: 300, // 5 minutes
  },

  /**
   * Database Connection Pooling
   */
  connectionPool: {
    mongodb: {
      minPoolSize: 10,
      maxPoolSize: 100,
      maxIdleTimeMs: 60000,
    },
    redis: {
      minPoolSize: 5,
      maxPoolSize: 50,
    },
  },

  /**
   * Circuit Breaker Configuration
   */
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    resetTimeout: 60000,
  },
};

/**
 * Performance Optimization Checklist
 */
export const performanceChecklist = [
  "✅ Use connection pooling for database connections",
  "✅ Implement Redis caching for frequently accessed data",
  "✅ Add database indexes for common queries",
  "✅ Use projection to fetch only required fields",
  "✅ Implement pagination for list endpoints",
  "✅ Use compression for API responses",
  "✅ Implement rate limiting to prevent abuse",
  "✅ Use async/background processing for non-critical tasks",
  "✅ Implement health checks for load balancers",
  "✅ Use Redis pub/sub for real-time updates",
  "✅ Implement proper error handling and logging",
  "✅ Use CDN for static assets",
  "✅ Monitor performance metrics and set up alerts",
  "✅ Implement graceful shutdown for zero-downtime deployments",
  "⬜ Add read replicas for database",
  "⬜ Implement database sharding when needed",
  "⬜ Add geographic load balancing for global users",
];

export default scalabilityConfig;
