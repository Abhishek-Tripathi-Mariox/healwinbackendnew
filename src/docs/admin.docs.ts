/**
 * @swagger
 * /admin/auth/login:
 *   post:
 *     summary: Admin login
 *     description: Authenticates admin user and returns access token
 *     tags: [Admin]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "admin@healwin.com"
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
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
 *                     accessToken:
 *                       type: string
 *                     admin:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                           enum: [SUPER_ADMIN, ADMIN, SUPPORT, OPERATIONS]
 *       401:
 *         description: Invalid credentials
 *
 * /admin/dashboard:
 *   get:
 *     summary: Get dashboard stats
 *     description: Retrieves dashboard statistics and metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, year]
 *           default: today
 *     responses:
 *       200:
 *         description: Dashboard stats retrieved
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
 *                     totalBookings:
 *                       type: integer
 *                       example: 1500
 *                     completedBookings:
 *                       type: integer
 *                     cancelledBookings:
 *                       type: integer
 *                     totalRevenue:
 *                       type: number
 *                       example: 250000
 *                     totalUsers:
 *                       type: integer
 *                     totalDrivers:
 *                       type: integer
 *                     onlineDrivers:
 *                       type: integer
 *                     pendingKyc:
 *                       type: integer
 *                     activeBookings:
 *                       type: integer
 *                     revenueChart:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           revenue:
 *                             type: number
 *                           bookings:
 *                             type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /admin/users:
 *   get:
 *     summary: Get all users
 *     description: Retrieves paginated list of users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or phone
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, blocked]
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
 *         description: Users retrieved
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /admin/users/{userId}:
 *   get:
 *     summary: Get user details
 *     description: Retrieves detailed user information
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details retrieved
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *
 *   put:
 *     summary: Update user
 *     description: Updates user information
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, blocked]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated
 *
 * /admin/drivers:
 *   get:
 *     summary: Get all drivers
 *     description: Retrieves paginated list of drivers
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: kycStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, SUBMITTED, APPROVED, REJECTED]
 *       - in: query
 *         name: isOnline
 *         schema:
 *           type: boolean
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
 *         description: Drivers retrieved
 *
 * /admin/drivers/{driverId}:
 *   get:
 *     summary: Get driver details
 *     description: Retrieves detailed driver information including KYC
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Driver details retrieved
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
 *                     driver:
 *                       $ref: '#/components/schemas/Driver'
 *                     kyc:
 *                       $ref: '#/components/schemas/DriverKYC'
 *                     earnings:
 *                       type: object
 *                     bookingStats:
 *                       type: object
 *
 * /admin/drivers/{driverId}/kyc/approve:
 *   post:
 *     summary: Approve driver KYC
 *     description: Approves driver's KYC documents
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               remarks:
 *                 type: string
 *     responses:
 *       200:
 *         description: KYC approved
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
 *                   example: "Driver KYC approved successfully"
 *
 * /admin/drivers/{driverId}/kyc/reject:
 *   post:
 *     summary: Reject driver KYC
 *     description: Rejects driver's KYC documents
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driverId
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
 *                 example: "Documents unclear"
 *               documentsToReupload:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [aadhar, pan, drivingLicense, vehicleRC, insurance]
 *     responses:
 *       200:
 *         description: KYC rejected
 *
 * /admin/bookings:
 *   get:
 *     summary: Get all bookings
 *     description: Retrieves paginated list of all bookings
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by booking number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SEARCHING, ASSIGNED, DRIVER_ARRIVED, PICKED, IN_PROGRESS, COMPLETED, CANCELLED]
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
 *         description: Bookings retrieved
 *
 * /admin/bookings/{bookingId}:
 *   get:
 *     summary: Get booking details
 *     description: Retrieves detailed booking information
 *     tags: [Admin]
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
 *
 * /admin/bookings/{bookingId}/reassign:
 *   post:
 *     summary: Reassign booking
 *     description: Reassigns booking to a different driver
 *     tags: [Admin]
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
 *               - driverId
 *             properties:
 *               driverId:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Booking reassigned
 *
 * /admin/vehicle-types:
 *   get:
 *     summary: Get vehicle types
 *     description: Retrieves all vehicle types
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vehicle types retrieved
 *
 *   post:
 *     summary: Create vehicle type
 *     description: Creates a new vehicle type
 *     tags: [Admin]
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
 *               - baseFare
 *               - perKmRate
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Mini Truck"
 *               description:
 *                 type: string
 *               icon:
 *                 type: string
 *               capacity:
 *                 type: string
 *                 example: "500 kg"
 *               baseFare:
 *                 type: number
 *                 example: 50
 *               perKmRate:
 *                 type: number
 *                 example: 15
 *               perMinRate:
 *                 type: number
 *                 example: 2
 *               minimumFare:
 *                 type: number
 *               isActive:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Vehicle type created
 *
 * /admin/vehicle-types/{id}:
 *   put:
 *     summary: Update vehicle type
 *     description: Updates a vehicle type
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VehicleType'
 *     responses:
 *       200:
 *         description: Vehicle type updated
 *
 *   delete:
 *     summary: Delete vehicle type
 *     description: Deletes a vehicle type
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vehicle type deleted
 *
 * /admin/promos:
 *   get:
 *     summary: Get all promo codes
 *     description: Retrieves all promo codes
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promo codes retrieved
 *
 *   post:
 *     summary: Create promo code
 *     description: Creates a new promo code
 *     tags: [Admin]
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
 *               - discountType
 *               - discountValue
 *               - validFrom
 *               - validTo
 *             properties:
 *               code:
 *                 type: string
 *                 example: "FIRST50"
 *               description:
 *                 type: string
 *               discountType:
 *                 type: string
 *                 enum: [PERCENTAGE, FLAT]
 *               discountValue:
 *                 type: number
 *               maxDiscount:
 *                 type: number
 *               minOrderValue:
 *                 type: number
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *               validTo:
 *                 type: string
 *                 format: date-time
 *               usageLimit:
 *                 type: integer
 *               perUserLimit:
 *                 type: integer
 *               applicableVehicleTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Promo code created
 *
 * /admin/reports/revenue:
 *   get:
 *     summary: Get revenue report
 *     description: Generates revenue report
 *     tags: [Admin]
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
 *           enum: [day, week, month]
 *           default: day
 *     responses:
 *       200:
 *         description: Revenue report generated
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
 *                     totalRevenue:
 *                       type: number
 *                     totalBookings:
 *                       type: integer
 *                     avgOrderValue:
 *                       type: number
 *                     breakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *
 * /admin/settings:
 *   get:
 *     summary: Get system settings
 *     description: Retrieves all system settings
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved
 *
 *   put:
 *     summary: Update system settings
 *     description: Updates system settings
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               platformFeePercentage:
 *                 type: number
 *               gstPercentage:
 *                 type: number
 *               minWalletBalance:
 *                 type: number
 *               maxCancellationFreeTime:
 *                 type: integer
 *                 description: Minutes
 *               cancellationCharges:
 *                 type: number
 *               referralBonus:
 *                 type: number
 *               surgeMultiplierMax:
 *                 type: number
 *     responses:
 *       200:
 *         description: Settings updated
 */

export {};
