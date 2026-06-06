/**
 * @swagger
 * /driver/auth/send-otp:
 *   post:
 *     summary: Send OTP to driver mobile
 *     description: Sends OTP to the driver's mobile number for registration/login
 *     tags: [Driver Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mobileNumber
 *             properties:
 *               mobileNumber:
 *                 type: string
 *                 example: "+919876543210"
 *     responses:
 *       200:
 *         description: OTP sent successfully
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
 *                   example: "OTP sent successfully"
 *       400:
 *         description: Invalid mobile number
 *       429:
 *         description: Too many OTP requests
 *
 * /driver/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and login/register driver
 *     description: Verifies OTP and creates/logs in driver account
 *     tags: [Driver Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mobileNumber
 *               - otp
 *             properties:
 *               mobileNumber:
 *                 type: string
 *                 example: "+919876543210"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               deviceToken:
 *                 type: string
 *                 description: FCM token for push notifications
 *               deviceType:
 *                 type: string
 *                 enum: [android, ios]
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
 *                     refreshToken:
 *                       type: string
 *                     driver:
 *                       $ref: '#/components/schemas/Driver'
 *                     isNewDriver:
 *                       type: boolean
 *                     kycStatus:
 *                       type: string
 *                       enum: [PENDING, SUBMITTED, APPROVED, REJECTED]
 *       400:
 *         description: Invalid OTP
 *
 * /driver/auth/profile:
 *   get:
 *     summary: Get driver profile
 *     description: Retrieves the authenticated driver's profile
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver profile retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Driver'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 *   put:
 *     summary: Update driver profile
 *     description: Updates driver basic profile information
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Rajesh Kumar"
 *               email:
 *                 type: string
 *                 format: email
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               emergencyContact:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   relation:
 *                     type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/auth/kyc:
 *   get:
 *     summary: Get KYC status and documents
 *     description: Retrieves driver's KYC submission status and documents
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC status retrieved
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
 *                       enum: [PENDING, SUBMITTED, APPROVED, REJECTED]
 *                     kyc:
 *                       $ref: '#/components/schemas/DriverKYC'
 *                     rejectionReason:
 *                       type: string
 *                     submittedAt:
 *                       type: string
 *                       format: date-time
 *                     verifiedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/auth/kyc/aadhar:
 *   post:
 *     summary: Upload Aadhar card
 *     description: Uploads Aadhar card images for KYC verification
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - aadharNumber
 *               - frontImage
 *               - backImage
 *             properties:
 *               aadharNumber:
 *                 type: string
 *                 pattern: '^\d{12}$'
 *                 example: "123456789012"
 *               frontImage:
 *                 type: string
 *                 format: binary
 *               backImage:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Aadhar uploaded successfully
 *       400:
 *         description: Invalid Aadhar number or image format
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/auth/kyc/pan:
 *   post:
 *     summary: Upload PAN card
 *     description: Uploads PAN card image for KYC verification
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - panNumber
 *               - panImage
 *             properties:
 *               panNumber:
 *                 type: string
 *                 pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'
 *                 example: "ABCDE1234F"
 *               panImage:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: PAN card uploaded successfully
 *       400:
 *         description: Invalid PAN number or image format
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/auth/kyc/driving-license:
 *   post:
 *     summary: Upload Driving License
 *     description: Uploads driving license images for KYC verification
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - licenseNumber
 *               - frontImage
 *               - backImage
 *               - expiryDate
 *             properties:
 *               licenseNumber:
 *                 type: string
 *                 example: "DL-1420110012345"
 *               frontImage:
 *                 type: string
 *                 format: binary
 *               backImage:
 *                 type: string
 *                 format: binary
 *               expiryDate:
 *                 type: string
 *                 format: date
 *                 example: "2028-12-31"
 *     responses:
 *       200:
 *         description: Driving license uploaded successfully
 *       400:
 *         description: Invalid license number or image format
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/auth/kyc/vehicle:
 *   post:
 *     summary: Add vehicle for KYC
 *     description: Adds vehicle details and documents for verification
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - vehicleTypeId
 *               - registrationNumber
 *               - rcImage
 *               - insuranceImage
 *               - vehiclePhotos
 *             properties:
 *               vehicleTypeId:
 *                 type: string
 *                 description: Vehicle type/category ID
 *               registrationNumber:
 *                 type: string
 *                 example: "DL01AB1234"
 *               make:
 *                 type: string
 *                 example: "Tata"
 *               model:
 *                 type: string
 *                 example: "Ace"
 *               year:
 *                 type: integer
 *                 example: 2022
 *               color:
 *                 type: string
 *                 example: "White"
 *               rcImage:
 *                 type: string
 *                 format: binary
 *                 description: Registration Certificate image
 *               insuranceImage:
 *                 type: string
 *                 format: binary
 *               insuranceExpiryDate:
 *                 type: string
 *                 format: date
 *               vehiclePhotos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Vehicle photos (front, back, side)
 *     responses:
 *       200:
 *         description: Vehicle added successfully
 *       400:
 *         description: Invalid data or images
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/auth/kyc/bank:
 *   post:
 *     summary: Add bank account details
 *     description: Adds bank account for earnings payout
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountHolderName
 *               - accountNumber
 *               - ifscCode
 *             properties:
 *               accountHolderName:
 *                 type: string
 *                 example: "Rajesh Kumar"
 *               accountNumber:
 *                 type: string
 *                 example: "1234567890123456"
 *               ifscCode:
 *                 type: string
 *                 pattern: '^[A-Z]{4}0[A-Z0-9]{6}$'
 *                 example: "SBIN0001234"
 *               bankName:
 *                 type: string
 *                 example: "State Bank of India"
 *               branchName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Bank details added successfully
 *       400:
 *         description: Invalid bank details
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/auth/kyc/submit:
 *   post:
 *     summary: Submit KYC for verification
 *     description: Submits all KYC documents for admin verification
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC submitted successfully
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
 *                   example: "KYC submitted successfully. Verification usually takes 24-48 hours."
 *       400:
 *         description: Incomplete KYC documents
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/auth/training:
 *   get:
 *     summary: Get training modules
 *     description: Retrieves training modules and completion status
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Training modules retrieved
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
 *                     modules:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           description:
 *                             type: string
 *                           videoUrl:
 *                             type: string
 *                           duration:
 *                             type: integer
 *                             description: Duration in minutes
 *                           isCompleted:
 *                             type: boolean
 *                           order:
 *                             type: integer
 *                     overallProgress:
 *                       type: number
 *                       example: 60
 *                       description: Completion percentage
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *
 * /driver/auth/training/{moduleId}/complete:
 *   post:
 *     summary: Mark training module complete
 *     description: Marks a training module as completed
 *     tags: [Driver Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: moduleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Training module ID
 *     responses:
 *       200:
 *         description: Module marked as complete
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */

export {};
