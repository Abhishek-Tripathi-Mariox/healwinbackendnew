/**
 * @swagger
 * /bookings/vehicle-types:
 *   get:
 *     summary: Get available vehicle types
 *     description: Retrieves all vehicle types for booking selection
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vehicle types retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/VehicleType'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /bookings/fare-estimate:
 *   post:
 *     summary: Get fare estimate
 *     description: Calculates fare estimate for a booking based on pickup, drop, and vehicle type
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pickup
 *               - drop
 *               - vehicleTypeId
 *             properties:
 *               pickup:
 *                 type: object
 *                 required:
 *                   - lat
 *                   - lng
 *                 properties:
 *                   lat:
 *                     type: number
 *                     example: 28.6139
 *                   lng:
 *                     type: number
 *                     example: 77.2090
 *               drop:
 *                 type: object
 *                 required:
 *                   - lat
 *                   - lng
 *                 properties:
 *                   lat:
 *                     type: number
 *                     example: 28.5355
 *                   lng:
 *                     type: number
 *                     example: 77.3910
 *               vehicleTypeId:
 *                 type: string
 *                 description: Selected vehicle type ID
 *               promoCode:
 *                 type: string
 *                 description: Optional promo code to apply
 *     responses:
 *       200:
 *         description: Fare estimate calculated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     distanceKm:
 *                       type: number
 *                       example: 15.5
 *                     durationMin:
 *                       type: integer
 *                       example: 45
 *                     fareBreakdown:
 *                       $ref: '#/components/schemas/FareEstimate'
 *                     surgeActive:
 *                       type: boolean
 *                       example: false
 *                     promoDiscount:
 *                       type: number
 *                       example: 50
 *                     walletBalance:
 *                       type: number
 *                       example: 500
 *       400:
 *         description: Invalid locations or vehicle type
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /bookings:
 *   post:
 *     summary: Create a new booking
 *     description: Creates a new goods transportation booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pickup
 *               - drop
 *               - vehicleTypeId
 *               - paymentMethod
 *             properties:
 *               pickup:
 *                 $ref: '#/components/schemas/Location'
 *               drop:
 *                 $ref: '#/components/schemas/Location'
 *               vehicleTypeId:
 *                 type: string
 *               vehicleCategoryId:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *                 enum: [CASH, WALLET, UPI, CARD]
 *                 example: "CASH"
 *               promoCode:
 *                 type: string
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *                 description: For scheduled bookings. If not provided, booking is immediate.
 *               goodsDescription:
 *                 type: string
 *                 example: "Office furniture - 2 tables, 4 chairs"
 *               goodsWeight:
 *                 type: number
 *                 example: 150
 *                 description: Estimated weight in kg
 *               specialInstructions:
 *                 type: string
 *                 example: "Handle with care, fragile items"
 *               labourRequired:
 *                 type: boolean
 *                 example: false
 *               numberOfLabours:
 *                 type: integer
 *                 example: 2
 *               gstId:
 *                 type: string
 *                 description: GST details ID for invoice
 *     responses:
 *       201:
 *         description: Booking created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Booking created! Searching for nearby drivers..."
 *                 data:
 *                   type: object
 *                   properties:
 *                     booking:
 *                       $ref: '#/components/schemas/Booking'
 *                     estimatedWaitTime:
 *                       type: integer
 *                       example: 5
 *                       description: Estimated wait time in minutes
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 *   get:
 *     summary: Get user's bookings
 *     description: Retrieves paginated list of user's bookings
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SEARCHING, ASSIGNED, DRIVER_ARRIVED, PICKED, IN_PROGRESS, COMPLETED, CANCELLED, SCHEDULED]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Bookings retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     bookings:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Booking'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /bookings/{bookingId}:
 *   get:
 *     summary: Get booking details
 *     description: Retrieves detailed information about a specific booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking details retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Booking'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *
 * /bookings/{bookingId}/track:
 *   get:
 *     summary: Get real-time tracking info
 *     description: Retrieves driver's current location and ETA for an active booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tracking info retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     driverLocation:
 *                       type: object
 *                       properties:
 *                         lat:
 *                           type: number
 *                         lng:
 *                           type: number
 *                         heading:
 *                           type: number
 *                         lastUpdated:
 *                           type: string
 *                           format: date-time
 *                     etaMinutes:
 *                       type: integer
 *                       example: 8
 *                     distanceKm:
 *                       type: number
 *                       example: 2.5
 *                     driver:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         phone:
 *                           type: string
 *                         photo:
 *                           type: string
 *                         rating:
 *                           type: number
 *                         vehicleNumber:
 *                           type: string
 *       400:
 *         description: Booking not in trackable state
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *
 * /bookings/{bookingId}/cancel:
 *   post:
 *     summary: Cancel booking
 *     description: Cancels a booking (cancellation charges may apply)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [DRIVER_DELAYED, CHANGE_OF_PLAN, BOOKED_BY_MISTAKE, DRIVER_ASKED_TO_CANCEL, OTHER]
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Booking cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Booking cancelled successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     cancellationCharge:
 *                       type: number
 *                       example: 25
 *                     refundAmount:
 *                       type: number
 *                       example: 225
 *                     refundTo:
 *                       type: string
 *                       enum: [WALLET, ORIGINAL_PAYMENT_METHOD]
 *       400:
 *         description: Booking cannot be cancelled
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /bookings/{bookingId}/rate:
 *   post:
 *     summary: Rate driver and trip
 *     description: Submits rating and review for a completed booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               review:
 *                 type: string
 *                 example: "Great driver, handled goods carefully!"
 *               tip:
 *                 type: number
 *                 example: 50
 *                 description: Optional tip amount
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [POLITE, CAREFUL_HANDLING, ON_TIME, CLEAN_VEHICLE, HELPFUL, PROFESSIONAL]
 *     responses:
 *       200:
 *         description: Rating submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Thank you for your feedback!"
 *       400:
 *         description: Booking not completed or already rated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /bookings/{bookingId}/invoice:
 *   get:
 *     summary: Get booking invoice
 *     description: Retrieves PDF invoice for a completed booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: gstId
 *         schema:
 *           type: string
 *         description: GST details ID for tax invoice
 *     responses:
 *       200:
 *         description: Invoice URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoiceUrl:
 *                       type: string
 *                       example: "https://storage.healwin.com/invoices/INV001.pdf"
 *                     invoiceNumber:
 *                       type: string
 *       400:
 *         description: Booking not completed
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /bookings/{bookingId}/sos:
 *   post:
 *     summary: Trigger SOS alert
 *     description: Sends emergency SOS alert to contacts and support
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *               message:
 *                 type: string
 *                 example: "I need help"
 *     responses:
 *       200:
 *         description: SOS alert sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Emergency contacts and support have been notified"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /bookings/scheduled:
 *   get:
 *     summary: Get scheduled bookings
 *     description: Retrieves user's upcoming scheduled bookings
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Scheduled bookings retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Booking'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

export {};
