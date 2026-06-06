import swaggerJsdoc from "swagger-jsdoc";
import config from "./index";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "HealWin API Documentation",
    version: "1.0.0",
    description: `
# HealWin Backend API

Comprehensive API documentation for the HealWin healthcare platform.

## Overview

HealWin is a complete healthcare platform that connects users with healthcare providers for emergency response and healthcare delivery services.

## Authentication

Most endpoints require authentication via JWT Bearer token. Include the token in the Authorization header:

\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`

## API Sections

- **Auth** - User registration, login, OTP verification
- **User** - User profile, addresses, preferences
- **Driver Auth** - Driver registration, KYC verification
- **Driver App** - Driver operations (bookings, earnings, wallet)
- **Bookings** - Create, track, cancel bookings
- **Wallet** - Wallet management, transactions
- **Payments** - Payment processing
- **Admin** - Admin panel operations

## Rate Limiting

- General API: 100 requests/minute
- Auth endpoints: 5 requests/minute
- Booking creation: 10 requests/minute
- Search: 30 requests/minute

## Error Responses

All errors follow this format:
\`\`\`json
{
  "success": false,
  "message": "Error description",
  "error": "ERROR_CODE"
}
\`\`\`
    `,
    contact: {
      name: "HealWin Support",
      email: "support@healwin.com",
    },
    license: {
      name: "Proprietary",
    },
  },
  servers: [
    {
      url: `http://localhost:${config.server.port}/v1/api`,
      description: "Development server",
    },
    {
      url: "https://api.healwin.com/v1/api",
      description: "Production server",
    },
  ],
  tags: [
    {
      name: "Auth",
      description:
        "User authentication endpoints (OTP login, token management)",
    },
    {
      name: "User",
      description: "User profile, addresses, and preferences management",
    },
    {
      name: "Driver Auth",
      description: "Driver registration, KYC document upload, and verification",
    },
    {
      name: "Driver App",
      description:
        "Driver app operations - bookings, earnings, wallet, training",
    },
    {
      name: "Bookings",
      description: "Booking creation, tracking, and management",
    },
    {
      name: "Wallet",
      description: "Wallet balance, transactions, and recharge",
    },
    {
      name: "Payments",
      description: "Payment processing and verification",
    },
    {
      name: "Notifications",
      description: "Push notifications and in-app notifications",
    },
    {
      name: "Support",
      description: "Support tickets and help",
    },
    {
      name: "Promos",
      description: "Promo codes and offers",
    },
    {
      name: "Coins",
      description: "Reward coins system",
    },
    {
      name: "Enterprise",
      description: "Enterprise/Business account management",
    },
    {
      name: "Admin",
      description: "Admin panel endpoints",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter your JWT token",
      },
    },
    schemas: {
      // Common schemas
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Error message" },
          error: { type: "string", example: "ERROR_CODE" },
        },
      },
      Success: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Operation successful" },
          data: { type: "object" },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 10 },
          total: { type: "integer", example: 100 },
          pages: { type: "integer", example: 10 },
        },
      },

      // User schemas
      User: {
        type: "object",
        properties: {
          _id: { type: "string", example: "507f1f77bcf86cd799439011" },
          fullName: { type: "string", example: "John Doe" },
          mobileNumber: { type: "string", example: "+919876543210" },
          email: { type: "string", example: "john@example.com" },
          profileImage: { type: "string", example: "https://..." },
          isVerified: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Address: {
        type: "object",
        properties: {
          _id: { type: "string" },
          type: { type: "string", enum: ["HOME", "WORK", "OTHER"] },
          address: { type: "string", example: "123 Main St" },
          landmark: { type: "string", example: "Near City Mall" },
          lat: { type: "number", example: 28.6139 },
          lng: { type: "number", example: 77.209 },
          contactName: { type: "string" },
          contactPhone: { type: "string" },
        },
      },

      // Driver schemas
      Driver: {
        type: "object",
        properties: {
          _id: { type: "string" },
          fullName: { type: "string", example: "Driver Name" },
          mobileNumber: { type: "string", example: "+919876543210" },
          email: { type: "string" },
          profilePhoto: { type: "string" },
          rating: { type: "number", example: 4.5 },
          totalRides: { type: "integer", example: 150 },
          isOnline: { type: "boolean", example: true },
          kycStatus: {
            type: "string",
            enum: ["PENDING", "SUBMITTED", "APPROVED", "REJECTED"],
          },
        },
      },
      DriverKYC: {
        type: "object",
        properties: {
          aadhar: {
            type: "object",
            properties: {
              number: { type: "string" },
              frontImage: { type: "string" },
              backImage: { type: "string" },
              isVerified: { type: "boolean" },
            },
          },
          pan: {
            type: "object",
            properties: {
              number: { type: "string" },
              image: { type: "string" },
              isVerified: { type: "boolean" },
            },
          },
          drivingLicense: {
            type: "object",
            properties: {
              number: { type: "string" },
              frontImage: { type: "string" },
              backImage: { type: "string" },
              expiryDate: { type: "string", format: "date" },
              isVerified: { type: "boolean" },
            },
          },
        },
      },

      // Booking schemas
      Location: {
        type: "object",
        required: ["address", "lat", "lng"],
        properties: {
          address: { type: "string", example: "123 Main Street, Delhi" },
          lat: { type: "number", example: 28.6139 },
          lng: { type: "number", example: 77.209 },
          contactName: { type: "string", example: "John" },
          contactPhone: { type: "string", example: "+919876543210" },
          floor: { type: "integer", example: 2 },
          isLiftAvailable: { type: "boolean", example: true },
        },
      },
      Booking: {
        type: "object",
        properties: {
          _id: { type: "string" },
          bookingNumber: { type: "string", example: "MZ0001" },
          userId: { type: "string" },
          driverId: { type: "string" },
          status: {
            type: "string",
            enum: [
              "DRAFT",
              "PENDING",
              "SEARCHING",
              "ASSIGNED",
              "DRIVER_ARRIVED",
              "PICKED",
              "IN_PROGRESS",
              "COMPLETED",
              "CANCELLED",
              "SCHEDULED",
            ],
          },
          pickup: { $ref: "#/components/schemas/Location" },
          drop: { $ref: "#/components/schemas/Location" },
          vehicleTypeId: { type: "string" },
          distanceKm: { type: "number", example: 15.5 },
          durationMin: { type: "integer", example: 45 },
          baseFare: { type: "number", example: 150 },
          finalFare: { type: "number", example: 250 },
          paymentMethod: {
            type: "string",
            enum: ["CASH", "WALLET", "UPI", "CARD"],
          },
          paymentStatus: {
            type: "string",
            enum: ["PENDING", "PAID", "FAILED"],
          },
          otp: { type: "string", example: "1234" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      FareEstimate: {
        type: "object",
        properties: {
          baseFare: { type: "number", example: 50 },
          distanceCharge: { type: "number", example: 150 },
          timeCharge: { type: "number", example: 30 },
          surgeCharge: { type: "number", example: 0 },
          surgeMultiplier: { type: "number", example: 1 },
          gstAmount: { type: "number", example: 41.4 },
          gstPercentage: { type: "number", example: 18 },
          finalFare: { type: "number", example: 271.4 },
        },
      },

      // Vehicle schemas
      VehicleType: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string", example: "Mini Truck" },
          icon: { type: "string" },
          capacity: { type: "string", example: "500 kg" },
          baseFare: { type: "number", example: 50 },
          perKmRate: { type: "number", example: 15 },
          perMinRate: { type: "number", example: 2 },
        },
      },

      // Wallet schemas
      Wallet: {
        type: "object",
        properties: {
          _id: { type: "string" },
          userId: { type: "string" },
          balance: { type: "number", example: 500 },
          lockedBalance: { type: "number", example: 0 },
        },
      },
      WalletTransaction: {
        type: "object",
        properties: {
          _id: { type: "string" },
          userId: { type: "string" },
          type: {
            type: "string",
            enum: ["CREDIT", "DEBIT"],
          },
          amount: { type: "number", example: 100 },
          description: { type: "string" },
          referenceId: { type: "string" },
          balanceBefore: { type: "number", example: 400 },
          balanceAfter: { type: "number", example: 500 },
          createdAt: { type: "string", format: "date-time" },
        },
      },

      // Promo schemas
      PromoCode: {
        type: "object",
        properties: {
          _id: { type: "string" },
          code: { type: "string", example: "FIRST50" },
          description: { type: "string" },
          discountType: { type: "string", enum: ["PERCENTAGE", "FLAT"] },
          discountValue: { type: "number", example: 50 },
          maxDiscount: { type: "number", example: 100 },
          minOrderValue: { type: "number", example: 200 },
          validFrom: { type: "string", format: "date-time" },
          validTo: { type: "string", format: "date-time" },
          isActive: { type: "boolean" },
        },
      },

      // Support schemas
      SupportTicket: {
        type: "object",
        properties: {
          _id: { type: "string" },
          ticketNumber: { type: "string", example: "TKT001" },
          userId: { type: "string" },
          category: { type: "string" },
          subject: { type: "string" },
          description: { type: "string" },
          status: {
            type: "string",
            enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
          },
          priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
    responses: {
      UnauthorizedError: {
        description: "Access token is missing or invalid",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
            example: {
              success: false,
              message: "Unauthorized - Invalid or expired token",
            },
          },
        },
      },
      NotFoundError: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
            example: {
              success: false,
              message: "Resource not found",
            },
          },
        },
      },
      ValidationError: {
        description: "Validation error",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
            example: {
              success: false,
              message: "Validation failed",
              errors: [{ field: "email", message: "Invalid email format" }],
            },
          },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ["./src/docs/*.ts", "./src/docs/*.yaml"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
