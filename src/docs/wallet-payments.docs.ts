/**
 * @swagger
 * /wallet:
 *   get:
 *     summary: Get wallet balance
 *     description: Retrieves user's wallet balance and recent transactions
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet details retrieved
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
 *                     wallet:
 *                       $ref: '#/components/schemas/Wallet'
 *                     recentTransactions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/WalletTransaction'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /wallet/recharge:
 *   post:
 *     summary: Initiate wallet recharge
 *     description: Creates a payment order for wallet recharge
 *     tags: [Wallet]
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
 *                 maximum: 10000
 *                 example: 500
 *     responses:
 *       200:
 *         description: Payment order created
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
 *                     orderId:
 *                       type: string
 *                       description: Payment gateway order ID
 *                     amount:
 *                       type: number
 *                     currency:
 *                       type: string
 *                       example: "INR"
 *                     key:
 *                       type: string
 *                       description: Payment gateway key
 *       400:
 *         description: Invalid amount
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /wallet/recharge/verify:
 *   post:
 *     summary: Verify wallet recharge payment
 *     description: Verifies payment and credits wallet
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - paymentId
 *               - signature
 *             properties:
 *               orderId:
 *                 type: string
 *               paymentId:
 *                 type: string
 *               signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified and wallet credited
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
 *                   example: "₹500 added to wallet successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     newBalance:
 *                       type: number
 *                       example: 1000
 *                     transaction:
 *                       $ref: '#/components/schemas/WalletTransaction'
 *       400:
 *         description: Payment verification failed
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /wallet/transactions:
 *   get:
 *     summary: Get wallet transactions
 *     description: Retrieves paginated wallet transaction history
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [CREDIT, DEBIT]
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
 *                     transactions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/WalletTransaction'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /payments/create-order:
 *   post:
 *     summary: Create payment order
 *     description: Creates a payment order for booking or other payments
 *     tags: [Payments]
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
 *               - purpose
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 500
 *               purpose:
 *                 type: string
 *                 enum: [BOOKING, WALLET_RECHARGE, TIP]
 *               bookingId:
 *                 type: string
 *                 description: Required for BOOKING and TIP purpose
 *     responses:
 *       200:
 *         description: Payment order created
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
 *                     orderId:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     currency:
 *                       type: string
 *                       example: "INR"
 *                     key:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /payments/verify:
 *   post:
 *     summary: Verify payment
 *     description: Verifies payment completion
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *               - paymentId
 *               - signature
 *             properties:
 *               orderId:
 *                 type: string
 *               paymentId:
 *                 type: string
 *               signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified
 *       400:
 *         description: Payment verification failed
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /promos/apply:
 *   post:
 *     summary: Apply promo code
 *     description: Validates and applies a promo code to get discount
 *     tags: [Promos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - orderAmount
 *             properties:
 *               code:
 *                 type: string
 *                 example: "FIRST50"
 *               orderAmount:
 *                 type: number
 *                 example: 500
 *               vehicleTypeId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Promo code applied
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
 *                     isValid:
 *                       type: boolean
 *                       example: true
 *                     discountAmount:
 *                       type: number
 *                       example: 50
 *                     discountType:
 *                       type: string
 *                       enum: [PERCENTAGE, FLAT]
 *                     finalAmount:
 *                       type: number
 *                       example: 450
 *                     message:
 *                       type: string
 *                       example: "Promo code applied! You saved ₹50"
 *       400:
 *         description: Invalid or expired promo code
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /promos/available:
 *   get:
 *     summary: Get available promos
 *     description: Retrieves list of available promo codes for user
 *     tags: [Promos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available promos retrieved
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
 *                     $ref: '#/components/schemas/PromoCode'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /coins:
 *   get:
 *     summary: Get reward coins balance
 *     description: Retrieves user's reward coins balance and history
 *     tags: [Coins]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Coins balance retrieved
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
 *                       type: integer
 *                       example: 500
 *                     lifetimeEarnings:
 *                       type: integer
 *                       example: 2500
 *                     recentTransactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           type:
 *                             type: string
 *                             enum: [EARNED, REDEEMED, EXPIRED]
 *                           amount:
 *                             type: integer
 *                           description:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /coins/redeem:
 *   post:
 *     summary: Redeem coins
 *     description: Redeems coins for wallet credit
 *     tags: [Coins]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - coins
 *             properties:
 *               coins:
 *                 type: integer
 *                 minimum: 100
 *                 example: 500
 *                 description: Number of coins to redeem
 *     responses:
 *       200:
 *         description: Coins redeemed successfully
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
 *                   example: "500 coins redeemed for ₹50"
 *                 data:
 *                   type: object
 *                   properties:
 *                     coinsRedeemed:
 *                       type: integer
 *                       example: 500
 *                     amountCredited:
 *                       type: number
 *                       example: 50
 *                     remainingCoins:
 *                       type: integer
 *                       example: 0
 *                     newWalletBalance:
 *                       type: number
 *                       example: 550
 *       400:
 *         description: Insufficient coins
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /support/tickets:
 *   get:
 *     summary: Get support tickets
 *     description: Retrieves user's support tickets
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [OPEN, IN_PROGRESS, RESOLVED, CLOSED]
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
 *         description: Tickets retrieved
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
 *                     tickets:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SupportTicket'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 *   post:
 *     summary: Create support ticket
 *     description: Creates a new support ticket
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category
 *               - subject
 *               - description
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [BOOKING, PAYMENT, DRIVER, APP, ACCOUNT, OTHER]
 *               subject:
 *                 type: string
 *                 example: "Payment not reflecting"
 *               description:
 *                 type: string
 *                 example: "I made a payment of ₹500 but it's not showing in my wallet"
 *               bookingId:
 *                 type: string
 *                 description: Related booking ID if applicable
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of image URLs
 *     responses:
 *       201:
 *         description: Ticket created
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
 *                   example: "Support ticket created. Our team will respond within 24 hours."
 *                 data:
 *                   $ref: '#/components/schemas/SupportTicket'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /support/tickets/{ticketId}:
 *   get:
 *     summary: Get ticket details
 *     description: Retrieves ticket details with conversation history
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ticket details retrieved
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *
 * /support/tickets/{ticketId}/reply:
 *   post:
 *     summary: Reply to ticket
 *     description: Adds a reply to support ticket conversation
 *     tags: [Support]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
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
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Reply added
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *
 * /support/faq:
 *   get:
 *     summary: Get FAQ
 *     description: Retrieves frequently asked questions
 *     tags: [Support]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [GENERAL, BOOKING, PAYMENT, DRIVER, APP]
 *     responses:
 *       200:
 *         description: FAQ retrieved
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
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       question:
 *                         type: string
 *                       answer:
 *                         type: string
 *                       category:
 *                         type: string
 */

export {};
