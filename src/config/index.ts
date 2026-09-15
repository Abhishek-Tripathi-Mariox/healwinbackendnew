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
      /**
       * Index building is a deploy step, not a boot step.
       *
       * Mongoose defaults this to true, so every process start asks MongoDB to
       * build every declared index. On small data that is a harmless no-op; on
       * a hundred-thousand-row collection a newly added index builds while the
       * app is coming up — and with several workers, all of them ask at once.
       * Run `npm run migrate:indexes` as part of deployment instead.
       *
       * Left on outside production so local schema changes take effect without
       * remembering to run the migration.
       */
      autoIndex: process.env.DB_AUTO_INDEX
        ? process.env.DB_AUTO_INDEX === "true"
        : process.env.NODE_ENV !== "production",
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

  // Help & Support contact — surfaced to the apps so Call/Email buttons work.
  support: {
    helplineNumber: optional("call_helpline_number"),
    email: optional("support_email"),
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
    // Fallback patient-cancellation charge when a VehicleType has no
    // `cancellationFee` set. Only applied once an ambulance is assigned.
    defaultCancellationCharge: Number(process.env.DEFAULT_CANCELLATION_CHARGE) || 150,
  },

  // Appointment scheduling — working hours used to generate consultation / lab
  // time slots (IST). Per-doctor overrides can come later from doctorProfile.
  clinic: {
    workStartHour: Number(process.env.CLINIC_START_HOUR) || 9,
    workEndHour: Number(process.env.CLINIC_END_HOUR) || 18,
    slotMinutes: Number(process.env.CLINIC_SLOT_MINUTES) || 30,
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
  // Telephony — MyOperator handles both the IVR and click-to-call.
  ivr: {
    // MyOperator OBD (outbound dialer) API. Rings the agent first, then
    // bridges to the customer. `callType` defaults to a peer-to-peer bridge;
    // check the MyOperator dashboard (Manage → API integration) for the exact
    // value your account expects if calls don't connect.
    myOperatorApiUrl: optional("MYOPERATOR_API_URL", "https://obd-api.myoperator.co/obd-api-v1"),
    myOperatorApiKey: optional("MYOPERATOR_API_KEY"), // x-api-key header
    myOperatorCompanyId: optional("MYOPERATOR_COMPANY_ID"),
    myOperatorSecretToken: optional("MYOPERATOR_SECRET_TOKEN"),
    myOperatorCallType: optional("MYOPERATOR_CALL_TYPE", "peer_to_peer"),
    // Shared secret for the inbound webhook. The endpoint has to be public
    // (MyOperator can't hold a session), so this is what protects it. Leave
    // unset only in development.
    myOperatorWebhookToken: optional("MYOPERATOR_WEBHOOK_TOKEN"),
    // Fallback agent number when the admin placing the call has none on their
    // profile — the control room's own line.
    operatorNumber: optional("IVR_OPERATOR_NUMBER"),
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

  // SMTP Email Configuration.
  //
  // SENDER_EMAIL + APP_PASSWORD are the Gmail account and app password the
  // system sends from; they take precedence over the older SMTP_USER/SMTP_PASS
  // names, which remain as a fallback for existing deployments.
  //
  /**
   * Where the admin panel is served from.
   *
   * Emails have to send people somewhere — a password reset link and a
   * welcome message are useless without it. Falls back to the first configured
   * CORS origin, which in practice IS the panel, so a deployment that has set
   * that up already works.
   */
  adminPanelUrl: optional(
    "ADMIN_PANEL_URL",
    optional("CORS_ORIGIN", "http://localhost:5173"),
  ).split(",")[0].trim().replace(/\/$/, ""),

  /**
   * Organisation identity printed on every generated document — the letterhead
   * on offer and appointment letters, invoices, prescriptions, discharge
   * summaries and payslips. Kept here rather than passed in per call so the
   * documents cannot drift apart from each other.
   */
  brand: {
    // HOSPITAL_* are the names the invoice/discharge generators already used;
    // they stay as fallbacks so a deployment that set them keeps its details.
    name: optional(
      "BRAND_NAME",
      optional("HOSPITAL_NAME", optional("SMTP_COMPANY_NAME", "HealWin")),
    ),
    tagline: optional("BRAND_TAGLINE", "Emergency & Critical Care"),
    email: optional(
      "BRAND_EMAIL",
      optional("HOSPITAL_EMAIL", optional("SMTP_HR_EMAIL", "hr@healwin.in")),
    ),
    phone: optional("BRAND_PHONE", optional("HOSPITAL_PHONE", "")),
    website: optional("BRAND_WEBSITE", optional("HOSPITAL_WEBSITE", "")),
    address: optional("BRAND_ADDRESS", optional("HOSPITAL_ADDRESS", "")),
    // Absolute URL or a path under the backend — printed in the letterhead
    // when set, otherwise the name is set in type.
    logoUrl: optional("BRAND_LOGO_URL", ""),
  },

  // There is deliberately NO hardcoded password default any more. A committed
  // app password is a live credential in the repo, and a default also hides
  // misconfiguration: mail appears to work while going out from the wrong
  // account. With no credential configured, sendEmail now fails loudly.
  smtp: {
    host: optional("SMTP_HOST", "smtp.gmail.com"),
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: optional("SENDER_EMAIL", optional("SMTP_USER", "")),
    pass: optional("APP_PASSWORD", optional("SMTP_PASS", "")),
    fromEmail: optional(
      "SMTP_FROM_EMAIL",
      optional("SENDER_EMAIL", "hr@healwin.in"),
    ),
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
    user: optional(
      "SMTP_OTP_USER",
      optional("SENDER_EMAIL", optional("SMTP_USER", "")),
    ),
    pass: optional(
      "SMTP_OTP_PASS",
      optional("APP_PASSWORD", optional("SMTP_PASS", "")),
    ),
    fromEmail: optional(
      "SMTP_OTP_FROM_EMAIL",
      optional("SMTP_FROM_EMAIL", optional("SENDER_EMAIL", "hr@healwin.in")),
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
