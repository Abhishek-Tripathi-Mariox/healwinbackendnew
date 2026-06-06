# Healwin Backend - Architecture & Implementation Summary

## 🏗️ Architecture Overview

### Tech Stack
- **Runtime**: Node.js with Express 5.2.1
- **Language**: TypeScript 5.9.3
- **Database**: MongoDB with Mongoose 9.0.2
- **Caching**: Redis 5.10.0
- **Real-time**: Socket.io 4.8.0 with Redis adapter
- **File Storage**: AWS S3

### Scalability for 100K+ Concurrent Users

```
                    ┌─────────────┐
                    │  CloudFlare │ (CDN + WAF + DDoS Protection)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Load Balancer│ (AWS ALB / nginx)
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
    │ API Server│    │ API Server│    │ API Server│
    │  (PM2)    │    │  (PM2)    │    │  (PM2)    │
    └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────▼─────┐    ┌──────▼──────┐   ┌──────▼──────┐
   │ MongoDB   │    │   Redis     │   │  Socket.io  │
   │ Replica   │    │   Cluster   │   │   + Redis   │
   │  Set      │    │             │   │   Adapter   │
   └───────────┘    └─────────────┘   └─────────────┘
```

---

## 📁 Project Structure

```
backend/src/
├── config/
│   ├── index.ts                 # Main configuration
│   └── scalability.config.ts    # Scaling recommendations
├── controllers/
│   ├── booking.controller.ts    # Booking operations
│   ├── coin.controller.ts       # Coin/rewards operations
│   ├── promo.controller.ts      # Promo code operations
│   ├── support.controller.ts    # Support tickets
│   └── admin/
│       ├── admin-auth.controller.ts
│       ├── booking.controller.ts
│       ├── config.controller.ts
│       ├── driver.controller.ts
│       ├── promo.controller.ts
│       ├── reports.controller.ts
│       ├── support.controller.ts
│       └── user.controller.ts
├── middlewares/
│   ├── auth.middleware.ts       # User auth
│   ├── admin-auth.middleware.ts # Admin auth
│   ├── rate-limit.middleware.ts # Rate limiting
│   └── server.middleware.ts     # Health, security, logging
├── models/
│   ├── booking.model.ts         # Enhanced with multi-stop
│   ├── promo-code.model.ts      # Promo codes
│   ├── promo-usage.model.ts     # Usage tracking
│   ├── coin.model.ts            # Coins wallet & transactions
│   ├── support-ticket.model.ts  # Support system
│   ├── enterprise.model.ts      # B2B accounts
│   ├── addon-service.model.ts   # Loading/unloading
│   ├── goods-type.model.ts      # Goods categories
│   ├── cancellation-reason.model.ts
│   ├── time-slot.model.ts       # Scheduled bookings
│   ├── app-config.model.ts      # Dynamic configs
│   ├── fare-config.model.ts     # Fare rules
│   ├── invoice.model.ts         # Invoice generation
│   ├── admin.model.ts           # Admin users
│   └── content.model.ts         # CMS content
├── routes/
│   ├── index.ts                 # Route aggregator
│   ├── booking.routes.ts        # User booking APIs
│   ├── support.routes.ts        # Support APIs
│   ├── coin.routes.ts           # Coin/reward APIs
│   ├── promo.routes.ts          # Promo code APIs
│   └── admin.routes.ts          # Admin panel APIs
├── services/
│   ├── fare.service.ts          # Fare calculation engine
│   ├── promo.service.ts         # Promo validation
│   ├── coin.service.ts          # Coin operations
│   ├── support.service.ts       # Ticket management
│   └── invoice.service.ts       # Invoice generation
├── utils/
│   ├── redis.util.ts            # Redis client & caching
│   └── socket.util.ts           # Socket.io configuration
├── seeds/
│   └── index.ts                 # Database seeding
└── server.ts                    # Application entry
```

---

## 🔌 API Endpoints

### User APIs (`/v1/api`)

#### Booking
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/bookings/fare-estimate` | Get fare estimate |
| POST | `/bookings` | Create booking |
| GET | `/bookings` | Get user's bookings |
| GET | `/bookings/:id` | Get booking details |
| GET | `/bookings/:id/track` | Track active booking |
| POST | `/bookings/:id/apply-promo` | Apply promo code |
| POST | `/bookings/:id/apply-coins` | Apply coins |
| POST | `/bookings/schedule` | Schedule booking |
| POST | `/bookings/:id/cancel` | Cancel booking |
| POST | `/bookings/:id/rate` | Rate booking |
| GET | `/bookings/:id/invoice` | Get invoice |
| POST | `/bookings/vehicle-options` | Get vehicles for route |
| GET | `/bookings/addons/list` | Get addon services |
| GET | `/bookings/goods-types` | Get goods types |
| GET | `/bookings/cancellation-reasons` | Get cancellation reasons |
| GET | `/bookings/time-slots` | Get scheduling slots |

#### Coins/Rewards
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/coins/balance` | Get coin balance |
| GET | `/coins/transactions` | Transaction history |
| POST | `/coins/transfer-to-wallet` | Transfer to wallet |
| POST | `/coins/bank-transfer` | Bank transfer request |
| GET | `/coins/rewards` | Earnings history |
| GET | `/coins/redemptions` | Redemption history |

#### Promo Codes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/promos/validate` | Validate promo code |
| GET | `/promos/available` | Available promos |
| GET | `/promos/:code` | Promo details |

#### Support
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/support/tickets` | Create ticket |
| GET | `/support/tickets` | Get user tickets |
| GET | `/support/tickets/:id` | Ticket with messages |
| POST | `/support/tickets/:id/messages` | Add message |
| POST | `/support/tickets/:id/close` | Close ticket |
| GET | `/support/faqs` | Get FAQs |
| GET | `/support/topics` | Get help topics |

### Admin APIs (`/v1/api/admin`)

#### Dashboard & Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/dashboard/stats` | Dashboard statistics |
| GET | `/admin/reports/bookings` | Booking reports |
| GET | `/admin/reports/revenue` | Revenue reports |
| GET | `/admin/reports/users` | User reports |
| GET | `/admin/reports/drivers` | Driver reports |

#### User Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List all users |
| GET | `/admin/users/:id` | User details |
| PATCH | `/admin/users/:id/status` | Update user status |
| GET | `/admin/users/:id/bookings` | User's bookings |
| GET | `/admin/users/:id/wallet` | User's wallet |

#### Driver Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/drivers` | List all drivers |
| GET | `/admin/drivers/pending` | Pending verifications |
| POST | `/admin/drivers/:id/verify` | Verify driver |
| PATCH | `/admin/drivers/:id/status` | Update driver status |

#### Booking Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/bookings` | All bookings |
| GET | `/admin/bookings/:id` | Booking details |
| POST | `/admin/bookings/:id/cancel` | Cancel booking |
| POST | `/admin/bookings/:id/refund` | Process refund |
| POST | `/admin/bookings/:id/assign-driver` | Assign driver |

#### Configuration (Dynamic Settings)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PUT | `/admin/config/fare` | Fare configuration |
| GET/POST/PUT/DELETE | `/admin/config/vehicle-types` | Vehicle types |
| GET/POST/PUT/DELETE | `/admin/config/service-types` | Service types |
| GET/POST/PUT/DELETE | `/admin/config/addon-services` | Addon services |
| GET/POST/PUT/DELETE | `/admin/config/cancellation-reasons` | Cancel reasons |
| GET/POST/PUT/DELETE | `/admin/config/time-slots` | Time slots |
| GET/PUT | `/admin/config/app-settings` | App settings |
| GET/POST/PUT/DELETE | `/admin/config/service-areas` | Service areas |

#### Promo Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/promos` | List promos |
| POST | `/admin/promos` | Create promo |
| GET | `/admin/promos/:id` | Promo details |
| PUT | `/admin/promos/:id` | Update promo |
| DELETE | `/admin/promos/:id` | Delete promo |
| GET | `/admin/promos/:id/stats` | Promo statistics |

#### Support Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/support/tickets` | All tickets |
| GET | `/admin/support/tickets/:id` | Ticket details |
| PUT | `/admin/support/tickets/:id/assign` | Assign ticket |
| POST | `/admin/support/tickets/:id/reply` | Reply to ticket |
| PATCH | `/admin/support/tickets/:id/status` | Update status |
| GET | `/admin/support/stats` | Support stats |

---

## 🔐 Security Features

1. **Rate Limiting**
   - General API: 100 requests/minute
   - Auth endpoints: 5 requests/minute
   - OTP endpoints: 3 requests/5 minutes
   - Admin endpoints: 200 requests/minute

2. **Security Headers**
   - X-Frame-Options: DENY
   - X-Content-Type-Options: nosniff
   - X-XSS-Protection: 1; mode=block
   - Content-Security-Policy configured

3. **Authentication**
   - JWT-based authentication
   - Separate tokens for Users, Drivers, Admins
   - Role-based access control for admins

---

## ⚡ Real-time Features (Socket.io)

### Events

**Driver → Server:**
- `driver:location:update` - Update driver location
- `driver:status` - Online/offline status

**User → Server:**
- `booking:track:start` - Start tracking booking
- `booking:track:stop` - Stop tracking
- `chat:message` - Send chat message
- `chat:join` - Join chat room

**Server → Client:**
- `driver:location` - Driver location update
- `booking:status` - Booking status update
- `chat:message` - New chat message

---

## 💰 Fare Calculation Engine

```javascript
Total Fare = Base Fare 
           + (Distance × Per KM Rate)
           + (Time × Per Minute Rate)
           + Surge Charge
           + Addon Charges
           + Loading/Unloading Charges
           + GST (18%)
           - Promo Discount
           - Coin Discount
```

### Surge Pricing
- 70% driver utilization → 1.2x
- 80% driver utilization → 1.5x
- 90% driver utilization → 2.0x
- Max surge: 2.5x

### Night Charges
- 22:00 - 06:00 → 1.25x

---

## 🎁 Coin System

- **Earn Rate**: 2 coins per ₹100 spent
- **Conversion**: 1 coin = ₹1
- **Max Discount**: 10% of booking value
- **Transfer to Wallet**: Min 100 coins
- **Bank Transfer**: Min 500 coins
- **Expiry**: 365 days

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Environment Variables
Create `.env` file:
```env
NODE_ENV=development
PORT=4000
DB_URL=mongodb://localhost:27017/healwin
REDIS_URL=redis://localhost:6379
JWTSECRET=your-secret-key
BUCKET=healwin-bucket
REGION=ap-south-1
ACCESSKEY=your-aws-key
SECRETACCESSKEY=your-aws-secret
```

### 3. Seed Database
```bash
npm run seed
```

### 4. Run Development Server
```bash
npm run dev
```

### 5. Default Admin Login
- Email: admin@healwin.in
- Password: Admin@123

---

## 📦 New Dependencies Added

```json
{
  "@socket.io/redis-adapter": "^8.3.0",
  "compression": "^1.8.0",
  "helmet": "^8.1.0",
  "socket.io": "^4.8.0"
}
```

---

## 🔄 Next Steps

1. **Payment Gateway Integration**
   - Razorpay/Paytm integration for online payments
   - Webhook handlers for payment confirmation

2. **Push Notifications**
   - Firebase Cloud Messaging setup
   - Apple Push Notification Service

3. **Driver App APIs**
   - Accept/reject booking
   - Update location
   - Complete booking flow

4. **Admin Panel Frontend**
   - Connect to new backend APIs
   - Replace mock data with real API calls

5. **Testing**
   - Unit tests for services
   - Integration tests for APIs
   - Load testing for scalability

---

## 📊 Monitoring Recommendations

- **APM**: Datadog / New Relic
- **Logging**: ELK Stack / CloudWatch
- **Metrics**: Prometheus + Grafana
- **Alerts**: PagerDuty / Opsgenie
