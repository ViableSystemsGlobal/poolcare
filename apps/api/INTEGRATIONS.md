# SMTP & SMS Integration Setup

This document explains how to configure Hostinger SMTP and Deywuro SMS for OTP delivery.

## Environment Variables

Add these to your `.env` file in `apps/api/`:

### Hostinger SMTP Configuration

```env
# SMTP Configuration (Hostinger)
SMTP_HOST="smtp.hostinger.com"
SMTP_PORT="465"              # Use 465 for SSL or 587 for TLS
SMTP_SECURE="true"           # true for SSL (port 465), false for TLS (port 587)
SMTP_USER="noreply@yourdomain.com"
SMTP_PASSWORD="your-email-password"
SMTP_FROM="noreply@yourdomain.com"
SMTP_FROM_NAME="PoolCare"
```

**Steps to get Hostinger SMTP credentials:**
1. Log into your Hostinger account
2. Go to **Email** section
3. Create an email account (e.g., `noreply@yourdomain.com`)
4. Use the email address as `SMTP_USER`
5. Use the email password as `SMTP_PASSWORD`

### Deywuro SMS Configuration

```env
# SMS Configuration (Deywuro)
SMS_PROVIDER="deywuro"
DEYWURO_USERNAME="your-deywuro-username"
DEYWURO_PASSWORD="your-deywuro-password"
DEYWURO_API_URL="https://deywuro.com/api/sms"
SMS_SENDER_ID="PoolCare"                    # Your registered sender ID (max 11 chars, alphanumeric)
```

**Steps to get Deywuro credentials:**
1. Sign up/log in to Deywuro
2. Get your username and password from Npontu/Deywuro
3. Register a sender ID (e.g., "PoolCare") - maximum 11 characters, alphanumeric
4. Add credentials to `DEYWURO_USERNAME` and `DEYWURO_PASSWORD`

**Deywuro API Documentation:**
- Endpoint: `https://deywuro.com/api/sms`
- Methods: POST or GET
- Authentication: Username/Password as parameters
- Response codes:
  - `0`: Success
  - `401`: Invalid credentials
  - `403`: Insufficient balance
  - `404`: Not routable
  - `402`: Missing required fields
  - `500`: Server error

Reference: [Deywuro API Documentation](https://www.deywuro.com/NewUI/Landing/images/NPONTU_SMS_API_DOCUMENT_NEW.pdf)

### OTP Configuration

```env
# OTP Configuration
OTP_REQUEST_COOLDOWN_SECONDS="45"    # Cooldown between OTP requests (seconds)
OTP_CODE_TTL_SECONDS="300"          # OTP code validity (5 minutes)
OTP_MAX_ATTEMPTS="5"                # Max verification attempts per code
```

## Testing

### Development Mode

In development, if SMTP/SMS credentials are not configured, the system will:
- Log OTP codes to the console
- Return mock message IDs
- Still store OTP codes in the database

### Production Mode

In production (`NODE_ENV=production`):
- SMTP and SMS must be configured
- OTPs will be sent via real services
- Errors will be logged but won't block OTP storage

## Phone Number Normalization

The SMS adapter automatically normalizes phone numbers:
- Ghana numbers starting with `0` → `233` prefix
- 9-digit numbers → `233` prefix added
- Already international format → used as-is

Examples:
- `0244123456` → `233244123456`
- `244123456` → `233244123456`
- `233244123456` → `233244123456`

## Email Templates

OTP emails include:
- Branded HTML template with orange theme
- Plain text fallback
- Clear code display
- Security warnings

## API Endpoints

### Request OTP
```bash
POST /api/auth/otp/request
{
  "channel": "phone" | "email",
  "target": "+233244123456" | "user@example.com"
}
```

### Verify OTP
```bash
POST /api/auth/otp/verify
{
  "channel": "phone" | "email",
  "target": "+233244123456" | "user@example.com",
  "code": "123456"
}
```

## Troubleshooting

### SMTP Issues
- Verify email account credentials
- Check port (465 for SSL, 587 for TLS)
- Ensure `SMTP_SECURE` matches port choice
- Check firewall/network restrictions

### SMS Issues
- Verify API key is correct
- Ensure sender ID is registered
- Check phone number format
- Verify account has credits/balance

### Debugging
- Check API logs for detailed error messages
- Verify environment variables are loaded
- Test SMTP connection: `EmailAdapter.verifyConnection()`

