/**
 * @swagger
 * /enterprise/register:
 *   post:
 *     summary: Register enterprise account
 *     description: Registers a new enterprise/business account
 *     tags: [Enterprise]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyName
 *               - gstNumber
 *               - contactPerson
 *               - contactEmail
 *             properties:
 *               companyName:
 *                 type: string
 *                 example: "ABC Logistics Pvt Ltd"
 *               gstNumber:
 *                 type: string
 *                 example: "29AABCT1332L1ZX"
 *               contactPerson:
 *                 type: string
 *                 example: "John Doe"
 *               contactEmail:
 *                 type: string
 *                 format: email
 *               contactPhone:
 *                 type: string
 *               companyAddress:
 *                 type: string
 *               expectedMonthlyBookings:
 *                 type: integer
 *                 example: 100
 *               businessType:
 *                 type: string
 *                 enum: [E_COMMERCE, LOGISTICS, RETAIL, MANUFACTURING, OTHER]
 *     responses:
 *       201:
 *         description: Enterprise account request submitted
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
 *                   example: "Enterprise registration submitted. Our team will contact you within 24 hours."
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /enterprise/employees:
 *   get:
 *     summary: Get enterprise employees
 *     description: Lists all employees under the enterprise account
 *     tags: [Enterprise]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employees retrieved
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
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       role:
 *                         type: string
 *                         enum: [ADMIN, MANAGER, EMPLOYEE]
 *                       bookingsThisMonth:
 *                         type: integer
 *                       spendingLimit:
 *                         type: number
 *                       isActive:
 *                         type: boolean
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Not an enterprise account
 *
 *   post:
 *     summary: Add employee
 *     description: Adds new employee to enterprise account
 *     tags: [Enterprise]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - phone
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [MANAGER, EMPLOYEE]
 *                 default: EMPLOYEE
 *               spendingLimit:
 *                 type: number
 *                 description: Monthly spending limit
 *               department:
 *                 type: string
 *     responses:
 *       201:
 *         description: Employee added
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Not authorized to add employees
 *
 * /enterprise/reports:
 *   get:
 *     summary: Get enterprise reports
 *     description: Retrieves usage and spending reports for enterprise account
 *     tags: [Enterprise]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month, employee, department]
 *           default: day
 *     responses:
 *       200:
 *         description: Reports generated
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
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalBookings:
 *                           type: integer
 *                         totalSpending:
 *                           type: number
 *                         averagePerBooking:
 *                           type: number
 *                         totalDistance:
 *                           type: number
 *                     breakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                     downloadUrl:
 *                       type: string
 *                       description: URL to download CSV report
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /notifications/settings:
 *   get:
 *     summary: Get notification settings
 *     description: Retrieves user's notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved
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
 *                     push:
 *                       type: object
 *                       properties:
 *                         bookingUpdates:
 *                           type: boolean
 *                         promos:
 *                           type: boolean
 *                         walletAlerts:
 *                           type: boolean
 *                         driverArrival:
 *                           type: boolean
 *                     sms:
 *                       type: object
 *                       properties:
 *                         otpOnly:
 *                           type: boolean
 *                         bookingConfirmation:
 *                           type: boolean
 *                     email:
 *                       type: object
 *                       properties:
 *                         invoices:
 *                           type: boolean
 *                         newsletters:
 *                           type: boolean
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 *   put:
 *     summary: Update notification settings
 *     description: Updates user's notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               push:
 *                 type: object
 *                 properties:
 *                   bookingUpdates:
 *                     type: boolean
 *                   promos:
 *                     type: boolean
 *                   walletAlerts:
 *                     type: boolean
 *                   driverArrival:
 *                     type: boolean
 *               sms:
 *                 type: object
 *               email:
 *                 type: object
 *     responses:
 *       200:
 *         description: Settings updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /notifications/device-token:
 *   put:
 *     summary: Update device token
 *     description: Updates FCM device token for push notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceToken
 *             properties:
 *               deviceToken:
 *                 type: string
 *               deviceType:
 *                 type: string
 *                 enum: [android, ios, web]
 *               deviceId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Device token updated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

export {};
