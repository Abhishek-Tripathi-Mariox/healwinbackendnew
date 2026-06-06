/**
 * @swagger
 * /driver/app/status:
 *   get:
 *     summary: Get driver online status
 *     description: Retrieves the driver's current online/offline status
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status retrieved successfully
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
 *                     isOnline:
 *                       type: boolean
 *                       example: true
 *                     lastOnlineAt:
 *                       type: string
 *                       format: date-time
 *                     currentBooking:
 *                       type: string
 *                       description: Current active booking ID if any
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 *   put:
 *     summary: Toggle online/offline status
 *     description: Sets the driver as online or offline for receiving bookings
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isOnline
 *             properties:
 *               isOnline:
 *                 type: boolean
 *                 example: true
 *               location:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                     example: 28.6139
 *                   lng:
 *                     type: number
 *                     example: 77.2090
 *     responses:
 *       200:
 *         description: Status updated successfully
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
 *                   example: "You are now online"
 *       400:
 *         description: KYC not approved or missing location
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/location:
 *   put:
 *     summary: Update driver location
 *     description: Updates driver's real-time location (should be called every 10 seconds when online)
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lat
 *               - lng
 *             properties:
 *               lat:
 *                 type: number
 *                 example: 28.6139
 *               lng:
 *                 type: number
 *                 example: 77.2090
 *               heading:
 *                 type: number
 *                 description: Direction in degrees (0-360)
 *                 example: 90
 *               speed:
 *                 type: number
 *                 description: Speed in km/h
 *                 example: 30
 *               accuracy:
 *                 type: number
 *                 description: GPS accuracy in meters
 *                 example: 10
 *     responses:
 *       200:
 *         description: Location updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/bookings:
 *   get:
 *     summary: Get driver's bookings
 *     description: Retrieves driver's booking history with filters
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ASSIGNED, DRIVER_ARRIVED, PICKED, IN_PROGRESS, COMPLETED, CANCELLED]
 *         description: Filter by booking status
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
 *         description: Bookings retrieved successfully
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
 * /driver/app/bookings/current:
 *   get:
 *     summary: Get current active booking
 *     description: Retrieves driver's current active booking details
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current booking retrieved
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
 *       404:
 *         description: No active booking found
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/bookings/{bookingId}/accept:
 *   post:
 *     summary: Accept a booking request
 *     description: Accepts a booking request notification (bell ring)
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking accepted successfully
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
 *                   example: "Booking accepted! Please proceed to pickup location."
 *                 data:
 *                   $ref: '#/components/schemas/Booking'
 *       400:
 *         description: Booking already taken or expired
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *
 * /driver/app/bookings/{bookingId}/reject:
 *   post:
 *     summary: Reject a booking request
 *     description: Rejects a booking request notification
 *     tags: [Driver App]
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
 *               reason:
 *                 type: string
 *                 enum: [TOO_FAR, BUSY, VEHICLE_ISSUE, OTHER]
 *                 example: "TOO_FAR"
 *     responses:
 *       200:
 *         description: Booking rejected
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/bookings/{bookingId}/arrived:
 *   post:
 *     summary: Mark arrived at pickup
 *     description: Marks the driver as arrived at the pickup location
 *     tags: [Driver App]
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
 *         description: Arrival marked successfully
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
 *                   example: "Arrival marked. Customer has been notified."
 *       400:
 *         description: Too far from pickup location
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/bookings/{bookingId}/start-trip:
 *   post:
 *     summary: Start the trip
 *     description: Starts the trip after verifying OTP from customer
 *     tags: [Driver App]
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
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "1234"
 *                 description: 4-digit OTP from customer
 *               goodsImage:
 *                 type: string
 *                 description: Base64 encoded image of goods being transported
 *     responses:
 *       200:
 *         description: Trip started successfully
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
 *                   example: "Trip started. Navigate to drop location."
 *       400:
 *         description: Invalid OTP
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/bookings/{bookingId}/complete:
 *   post:
 *     summary: Complete the trip
 *     description: Marks the trip as completed at drop location
 *     tags: [Driver App]
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
 *               deliveryImage:
 *                 type: string
 *                 description: Base64 encoded image of delivered goods
 *               receiverName:
 *                 type: string
 *               receiverSignature:
 *                 type: string
 *                 description: Base64 encoded signature image
 *     responses:
 *       200:
 *         description: Trip completed successfully
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
 *                   example: "Trip completed!"
 *                 data:
 *                   type: object
 *                   properties:
 *                     booking:
 *                       $ref: '#/components/schemas/Booking'
 *                     earnings:
 *                       type: number
 *                       example: 200
 *       400:
 *         description: Too far from drop location
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/bookings/{bookingId}/cancel:
 *   post:
 *     summary: Cancel booking
 *     description: Driver cancels an assigned booking (may incur penalty)
 *     tags: [Driver App]
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
 *                 enum: [VEHICLE_BREAKDOWN, CUSTOMER_NOT_AVAILABLE, EMERGENCY, OTHER]
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
 *                   example: "Booking cancelled. Penalty of ₹50 applied."
 *                 data:
 *                   type: object
 *                   properties:
 *                     penaltyAmount:
 *                       type: number
 *                       example: 50
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/earnings:
 *   get:
 *     summary: Get earnings summary
 *     description: Retrieves driver's earnings summary and breakdown
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, custom]
 *           default: today
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Required for custom period
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Earnings summary retrieved
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
 *                     totalEarnings:
 *                       type: number
 *                       example: 5000
 *                     totalTrips:
 *                       type: integer
 *                       example: 25
 *                     totalDistance:
 *                       type: number
 *                       example: 250.5
 *                     totalDuration:
 *                       type: integer
 *                       description: Total duration in minutes
 *                       example: 600
 *                     cashCollected:
 *                       type: number
 *                       example: 3000
 *                     onlinePayments:
 *                       type: number
 *                       example: 2000
 *                     tips:
 *                       type: number
 *                       example: 200
 *                     incentives:
 *                       type: number
 *                       example: 500
 *                     penalties:
 *                       type: number
 *                       example: 100
 *                     netEarnings:
 *                       type: number
 *                       example: 4900
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/earnings/transactions:
 *   get:
 *     summary: Get earnings transactions
 *     description: Retrieves detailed earnings transactions
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *           default: 20
 *     responses:
 *       200:
 *         description: Transactions retrieved
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/wallet:
 *   get:
 *     summary: Get driver wallet
 *     description: Retrieves driver's wallet balance and recent transactions
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet retrieved
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
 *                     balance:
 *                       type: number
 *                       example: 1500
 *                     pendingSettlement:
 *                       type: number
 *                       example: 500
 *                       description: Amount to be settled
 *                     minimumBalance:
 *                       type: number
 *                       example: 0
 *                     recentTransactions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/WalletTransaction'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/wallet/withdraw:
 *   post:
 *     summary: Request wallet withdrawal
 *     description: Requests withdrawal of wallet balance to bank account
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 100
 *                 example: 1000
 *     responses:
 *       200:
 *         description: Withdrawal request submitted
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
 *                   example: "Withdrawal of ₹1000 initiated. Amount will be credited within 24 hours."
 *       400:
 *         description: Insufficient balance or invalid amount
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/incentives:
 *   get:
 *     summary: Get current incentives
 *     description: Retrieves active incentive programs and driver's progress
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Incentives retrieved
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
 *                     activeIncentives:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           title:
 *                             type: string
 *                             example: "Complete 10 rides, earn ₹500 bonus"
 *                           description:
 *                             type: string
 *                           targetTrips:
 *                             type: integer
 *                             example: 10
 *                           completedTrips:
 *                             type: integer
 *                             example: 6
 *                           bonusAmount:
 *                             type: number
 *                             example: 500
 *                           validTill:
 *                             type: string
 *                             format: date-time
 *                           progress:
 *                             type: number
 *                             example: 60
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/app/performance:
 *   get:
 *     summary: Get performance metrics
 *     description: Retrieves driver's performance metrics and ratings
 *     tags: [Driver App]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance metrics retrieved
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
 *                     overallRating:
 *                       type: number
 *                       example: 4.8
 *                     totalRatings:
 *                       type: integer
 *                       example: 150
 *                     acceptanceRate:
 *                       type: number
 *                       example: 85
 *                       description: Percentage
 *                     cancellationRate:
 *                       type: number
 *                       example: 5
 *                       description: Percentage
 *                     completionRate:
 *                       type: number
 *                       example: 95
 *                       description: Percentage
 *                     onTimeArrivalRate:
 *                       type: number
 *                       example: 90
 *                       description: Percentage
 *                     averageTripTime:
 *                       type: number
 *                       example: 45
 *                       description: Average trip time in minutes
 *                     recentReviews:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           rating:
 *                             type: integer
 *                           comment:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

export {};
