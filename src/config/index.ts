import dotenv from "dotenv";

dotenv.config();

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is missing`);
  }
  return value;
};

const optional = (key: string, defaultValue: string = ""): string => {
  return process.env[key] || defaultValue;
};

const config = {
  env: process.env.NODE_ENV || "development",

  server: {
    port: Number(process.env.PORT) || 4000,
    requestTimeout: Number(process.env.REQUEST_TIMEOUT) || 30000,
  },

  database: {
    url: required("DB_URL"),
    options: {
      maxPoolSize: Number(process.env.DB_POOL_SIZE) || 100,
      minPoolSize: Number(process.env.DB_MIN_POOL_SIZE) || 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Standalone MongoDB deployments (no replica set) reject retryable
      // writes — the driver default of retryWrites=true makes every write
      // fail with "This MongoDB deployment does not support retryable
      // writes." Default to false so writes work on standalone; set
      // DB_RETRY_WRITES=true once the deployment is a replica set.
      retryWrites: process.env.DB_RETRY_WRITES === "true",
    },
  },

  auth: {
    jwtSecret: required("JWTSECRET"),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "30d",
    masterOtp: process.env.MASTER_OTP || "1234",
  },

  jwt: {
    secret: required("JWTSECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
    adminExpiresIn: process.env.JWT_ADMIN_EXPIRES_IN || "8h",
  },

  redis: {
    url: required("REDIS_URL"),
  },

  aws: {
    bucket: required("BUCKET"),
    region: required("REGION"),
    accessKeyId: required("ACCESSKEY"),
    secretAccessKey: required("SECRETACCESSKEY"),
  },

  cors: {
    origin: optional("CORS_ORIGIN", "*"),
  },

  // Coin system configuration
  coins: {
    earnRate: Number(process.env.COIN_EARN_RATE) || 2, // Coins per 100 rupees spent
    conversionRate: Number(process.env.COIN_CONVERSION_RATE) || 1, // 1 coin = 1 rupee
    expiryDays: Number(process.env.COIN_EXPIRY_DAYS) || 365,
    minTransferToWallet: Number(process.env.COIN_MIN_WALLET_TRANSFER) || 100,
    minBankTransfer: Number(process.env.COIN_MIN_BANK_TRANSFER) || 500,
    maxDiscountPercent: Number(process.env.COIN_MAX_DISCOUNT_PERCENT) || 10,
  },

  // Fare calculation defaults
  fare: {
    baseFare: Number(process.env.DEFAULT_BASE_FARE) || 50,
    perKmRate: Number(process.env.DEFAULT_PER_KM_RATE) || 15,
    perMinuteRate: Number(process.env.DEFAULT_PER_MINUTE_RATE) || 2,
    gstPercentage: Number(process.env.GST_PERCENTAGE) || 18,
    surgeThreshold: Number(process.env.SURGE_THRESHOLD) || 0.8, // 80% driver utilization
    maxSurgeMultiplier: Number(process.env.MAX_SURGE_MULTIPLIER) || 2.5,
    waitingChargePerMinute: Number(process.env.WAITING_CHARGE_PER_MINUTE) || 3,
    freeWaitingMinutes: Number(process.env.FREE_WAITING_MINUTES) || 5,
  },

  // Driver/attendant payout per completed dispatch (earnings).
  driverPayout: {
    basePerTrip: Number(process.env.DRIVER_BASE_PER_TRIP) || 100,
    perKm: Number(process.env.DRIVER_PER_KM) || 12,
    // An attendant on a trip earns this % of the equivalent driver payout.
    attendantSharePct: Number(process.env.ATTENDANT_SHARE_PCT) || 60,
  },

  // SMS/OTP Configuration
  sms: {
    provider: optional("SMS_PROVIDER", "twilio"),
    twilioAccountSid: optional("TWILIO_ACCOUNT_SID"),
    twilioAuthToken: optional("TWILIO_AUTH_TOKEN"),
    twilioPhoneNumber: optional("TWILIO_PHONE_NUMBER"),
  },

  // IVR escalation (automated SOS phone-tree). Falls back to "log" — which
  // records intended calls without dialling — when no provider is configured.
  ivr: {
    provider: optional("IVR_PROVIDER", "log"), // "exotel" | "log"
    exotelSid: optional("EXOTEL_SID"),
    exotelApiKey: optional("EXOTEL_API_KEY"),
    exotelApiToken: optional("EXOTEL_API_TOKEN"),
    exotelCallerId: optional("EXOTEL_CALLER_ID"),
    exotelSubdomain: optional("EXOTEL_SUBDOMAIN", "api.exotel.com"),
  },

  // Payment gateway
  payment: {
    razorpayKeyId: optional("RAZORPAY_KEY_ID"),
    razorpayKeySecret: optional("RAZORPAY_KEY_SECRET"),
    webhookSecret: optional("PAYMENT_WEBHOOK_SECRET"),
  },

  // Push notifications
  notifications: {
    firebaseCredentials: optional("FIREBASE_CREDENTIALS_PATH"),
    apnKeyId: optional("APN_KEY_ID"),
    apnTeamId: optional("APN_TEAM_ID"),
  },

  // MQTT Configuration (for real-time driver notifications)
  mqtt: {
    url: optional("MQTT_URL", "mqtt://localhost:1883"),
    username: optional("MQTT_USERNAME"),
    password: optional("MQTT_PASSWORD"),
  },

  // Booking dispatch configuration
  bookingDispatch: {
    initialSearchRadiusKm: Number(process.env.INITIAL_SEARCH_RADIUS_KM) || 5,
    maxSearchRadiusKm: Number(process.env.MAX_SEARCH_RADIUS_KM) || 15,
    radiusIncrementKm: Number(process.env.RADIUS_INCREMENT_KM) || 3,
    requestTimeoutSeconds: Number(process.env.BOOKING_REQUEST_TIMEOUT) || 30,
    maxDriversToNotify: Number(process.env.MAX_DRIVERS_TO_NOTIFY) || 10,
  },

  // Google Maps API
  maps: {
    apiKey: optional("GOOGLE_MAPS_API_KEY"),
  },

  googleMaps: {
    apiKey: optional("GOOGLE_MAPS_API_KEY"),
  },

  // SMTP Email Configuration
  smtp: {
    host: optional("SMTP_HOST", "smtp.gmail.com"),
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: optional("SMTP_USER", "hr@healwin.in"),
    pass: optional("SMTP_PASS", "dyzc bnix uxdi jbwh"),
    fromEmail: optional("SMTP_FROM_EMAIL", "hr@healwin.in"),
    fromName: optional("SMTP_FROM_NAME", "Healwin HR"),
    hrEmail: optional("SMTP_HR_EMAIL", "hr@healwin.in"),
    hrEmails: optional("SMTP_HR_EMAILS", ""),
    acknowledgementCcEmails: optional("SMTP_ACK_CC_EMAILS", ""),
    companyName: optional("SMTP_COMPANY_NAME", "Healwin"),
  },

  // SMTP configuration dedicated for OTP emails
  smtpOtp: {
    host: optional("SMTP_OTP_HOST", optional("SMTP_HOST", "smtp.gmail.com")),
    port: Number(process.env.SMTP_OTP_PORT) || Number(process.env.SMTP_PORT) || 587,
    secure:
      process.env.SMTP_OTP_SECURE === "true" ||
      process.env.SMTP_SECURE === "true",
    user: optional("SMTP_OTP_USER", optional("SMTP_USER", "hr@healwin.in")),
    pass: optional("SMTP_OTP_PASS", optional("SMTP_PASS", "dyzc bnix uxdi jbwh")),
    fromEmail: optional(
      "SMTP_OTP_FROM_EMAIL",
      optional("SMTP_FROM_EMAIL", "hr@healwin.in"),
    ),
    fromName: optional(
      "SMTP_OTP_FROM_NAME",
      optional("SMTP_FROM_NAME", "Healwin OTP"),
    ),
    companyName: optional(
      "SMTP_OTP_COMPANY_NAME",
      optional("SMTP_COMPANY_NAME", "Healwin"),
    ),
  },
};

export default config;
