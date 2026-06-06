/**
 * MQTT Utility for Real-time Push Notifications to Drivers
 * Used for booking bell/ring notifications
 */

import mqtt, { MqttClient, IClientOptions } from "mqtt";
import config from "../config";
import { getRedisClient } from "./redis.util";

let mqttClient: MqttClient | null = null;

// MQTT Topics
export const MQTT_TOPICS = {
  // Driver topics
  DRIVER_BOOKING_REQUEST: "healwin/drivers/{driverId}/booking/request",
  DRIVER_BOOKING_CANCELLED: "healwin/drivers/{driverId}/booking/cancelled",
  DRIVER_BOOKING_ASSIGNED: "healwin/drivers/{driverId}/booking/assigned",

  // Broadcast topics
  DRIVERS_NEARBY: "healwin/drivers/nearby/{geohash}",
  DRIVERS_ALL: "healwin/drivers/all",

  // Booking specific
  BOOKING_STATUS: "healwin/bookings/{bookingId}/status",
  BOOKING_ACCEPTED: "healwin/bookings/{bookingId}/accepted",
};

/**
 * Initialize MQTT Client
 */
export const initMqtt = async (): Promise<MqttClient | null> => {
  try {
    const mqttUrl =
      config.mqtt?.url || process.env.MQTT_URL || "mqtt://localhost:1883";
    const mqttOptions: IClientOptions = {
      clientId: `healwin_server_${Date.now()}`,
      username: config.mqtt?.username || process.env.MQTT_USERNAME,
      password: config.mqtt?.password || process.env.MQTT_PASSWORD,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    };

    mqttClient = mqtt.connect(mqttUrl, mqttOptions);

    mqttClient.on("connect", () => {
      console.log("MQTT: Connected to broker");
    });

    mqttClient.on("error", (error: Error) => {
      console.error("MQTT Error:", error);
    });

    mqttClient.on("reconnect", () => {
      console.log("MQTT: Reconnecting...");
    });

    mqttClient.on("offline", () => {
      console.log("MQTT: Client offline");
    });

    return mqttClient;
  } catch (error) {
    console.warn("MQTT: Failed to initialize, running without MQTT support");
    return null;
  }
};

/**
 * Get MQTT Client
 */
export const getMqttClient = (): MqttClient | null => {
  return mqttClient;
};

/**
 * Publish message to a topic
 */
export const publish = async (
  topic: string,
  payload: any,
  options?: { qos?: 0 | 1 | 2; retain?: boolean },
): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!mqttClient || !mqttClient.connected) {
      console.warn("MQTT: Client not connected, message not sent");
      resolve(false);
      return;
    }

    const message =
      typeof payload === "string" ? payload : JSON.stringify(payload);

    mqttClient.publish(
      topic,
      message,
      { qos: options?.qos || 1, retain: options?.retain || false },
      (error: Error | undefined) => {
        if (error) {
          console.error("MQTT Publish Error:", error);
          resolve(false);
        } else {
          resolve(true);
        }
      },
    );
  });
};

/**
 * Send booking request to a specific driver
 */
export const sendBookingRequestToDriver = async (
  driverId: string,
  bookingData: {
    bookingId: string;
    pickup: { address: string; lat: number; lng: number };
    drop: { address: string; lat: number; lng: number };
    distance: number;
    estimatedFare: number;
    vehicleType: string;
    expiresAt: number; // Unix timestamp
  },
): Promise<boolean> => {
  const topic = MQTT_TOPICS.DRIVER_BOOKING_REQUEST.replace(
    "{driverId}",
    driverId,
  );

  const payload = {
    type: "BOOKING_REQUEST",
    ...bookingData,
    timestamp: Date.now(),
    sound: "booking_bell", // Custom sound for the app
    priority: "high",
  };

  return await publish(topic, payload, { qos: 1 });
};

/**
 * Notify driver that booking was cancelled (by user or system)
 */
export const sendBookingCancelledToDriver = async (
  driverId: string,
  bookingId: string,
  reason: string,
): Promise<boolean> => {
  const topic = MQTT_TOPICS.DRIVER_BOOKING_CANCELLED.replace(
    "{driverId}",
    driverId,
  );

  const payload = {
    type: "BOOKING_CANCELLED",
    bookingId,
    reason,
    timestamp: Date.now(),
  };

  return await publish(topic, payload, { qos: 1 });
};

/**
 * Notify all drivers who received the request that booking was accepted by someone
 */
export const sendBookingAcceptedBroadcast = async (
  bookingId: string,
  acceptedByDriverId: string,
  notifiedDriverIds: string[],
): Promise<void> => {
  // Publish to booking topic so all subscribed drivers get the update
  const bookingTopic = MQTT_TOPICS.BOOKING_ACCEPTED.replace(
    "{bookingId}",
    bookingId,
  );

  const payload = {
    type: "BOOKING_ACCEPTED_BY_OTHER",
    bookingId,
    acceptedByDriverId,
    timestamp: Date.now(),
    message: "This booking has been accepted by another driver",
  };

  await publish(bookingTopic, payload, { qos: 1 });

  // Also send individual notifications to each driver who was notified
  for (const driverId of notifiedDriverIds) {
    if (driverId !== acceptedByDriverId) {
      const topic = MQTT_TOPICS.DRIVER_BOOKING_ASSIGNED.replace(
        "{driverId}",
        driverId,
      );
      await publish(topic, {
        type: "BOOKING_NO_LONGER_AVAILABLE",
        bookingId,
        timestamp: Date.now(),
      });
    }
  }
};

/**
 * Close MQTT connection
 */
export const closeMqtt = async (): Promise<void> => {
  return new Promise((resolve) => {
    if (mqttClient) {
      mqttClient.end(false, {}, () => {
        console.log("MQTT: Connection closed");
        resolve();
      });
    } else {
      resolve();
    }
  });
};

export default {
  initMqtt,
  getMqttClient,
  publish,
  sendBookingRequestToDriver,
  sendBookingCancelledToDriver,
  sendBookingAcceptedBroadcast,
  closeMqtt,
  MQTT_TOPICS,
};
