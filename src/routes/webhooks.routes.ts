import { Router } from "express";
import * as MyOperator from "../controllers/myoperator-webhook.controller";
import * as Razorpay from "../controllers/razorpay-webhook.controller";

/**
 * Public provider webhooks. Mounted at /webhooks.
 *
 * These deliberately do NOT use ResponseMiddleware: providers expect their own
 * simple 200 acknowledgement, not this API's { code, message, data } envelope,
 * and several treat an unexpected shape as a delivery failure and retry.
 */
const router = Router();

router.get("/myoperator", MyOperator.verify);
router.post("/myoperator", MyOperator.receive);

router.post("/razorpay", Razorpay.receive);

export default router;
