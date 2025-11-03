# Development Login Guide

## How to Login in Development Mode

Since SMTP and Deywuro SMS are not yet integrated, the system works as follows:

### Current Behavior

1. **No Pre-created Accounts Needed** - The system automatically creates accounts on first login
2. **OTP Codes are Logged to Console** - In development mode, OTP codes are printed to the terminal where your API server is running

### Steps to Login

1. **Start your API server** (if not already running):
   ```bash
   cd apps/api
   pnpm run start:dev
   ```

2. **Go to the login page** at `http://localhost:3001/auth/login`

3. **Enter any phone number or email**:
   - Phone: `+233570150105` (or any number)
   - Email: `test@example.com` (or any email)

4. **Click "Send OTP"**

5. **Check the API server terminal** - You'll see a log like:
   ```
   [OTP] phone:+233570150105 → Code: 123456
   ```
   or
   ```
   [OTP] email:test@example.com → Code: 123456
   ```

6. **Enter the 6-digit code** from the console

7. **You're logged in!** The system will:
   - Create a User account (if it doesn't exist)
   - Create an Organization (if you're a new user)
   - Set you as ADMIN of that organization
   - Give you a JWT token

### Test Accounts

You can use any phone number or email - the system will create accounts automatically. For example:

- Phone: `+233570150105`
- Email: `admin@poolcare.com`
- Email: `manager@example.com`

All will work and create separate organizations.

### Next Steps

When you're ready to integrate real SMS/Email:
- SMTP: Configure email provider in `apps/api/src/auth/otp.service.ts`
- Deywuro: Add SMS sending logic in `apps/api/src/auth/otp.service.ts`
- Update `apps/api/src/auth/auth.service.ts` to call `otpService.send()` instead of console.log

