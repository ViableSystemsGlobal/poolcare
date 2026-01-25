# Google Maps API Setup Guide

## Overview

The PoolCare system uses Google Maps API for:
- **Geocoding**: Converting addresses to GPS coordinates
- **Reverse Geocoding**: Converting GPS coordinates to addresses
- **Distance Calculation**: Accurate distance and ETA calculations (accounts for roads, obstacles)
- **Geofencing**: More accurate proximity checks for job start/arrival
- **Directions**: Route planning and navigation

## Setting Up Google Maps API Key

### Option 1: Organization-Specific API Key (Recommended)

Each organization can configure their own Google Maps API key in the settings. This allows:
- Separate API quotas per organization
- Better cost tracking
- Independent API key management

#### Steps:

1. **Get a Google Maps API Key**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the following APIs:
     - Maps JavaScript API
     - Geocoding API
     - Distance Matrix API
     - Directions API
   - Create credentials (API Key)
   - Restrict the API key (recommended for security):
     - Application restrictions: HTTP referrers (for web) or IP addresses (for API)
     - API restrictions: Select only the APIs you need

2. **Configure in PoolCare Settings**:
   - Log in as Admin or Manager
   - Go to Settings → Integrations → Google Maps
   - Enter your API key
   - The system will automatically verify the key before saving
   - Enable/disable the integration

#### API Endpoints:

```bash
# Get current Google Maps settings
GET /api/settings/integrations/google-maps

# Update Google Maps settings (Admin/Manager only)
PATCH /api/settings/integrations/google-maps
{
  "settings": {
    "apiKey": "YOUR_API_KEY_HERE",
    "enabled": true
  }
}

# Verify API key
POST /api/maps/verify-api-key
{
  "apiKey": "YOUR_API_KEY_HERE"  // Optional, uses org key if not provided
}
```

### Option 2: Global API Key (Environment Variable)

For single-organization deployments, you can set a global API key:

```bash
# In apps/api/.env
GOOGLE_MAPS_API_KEY=your_api_key_here
```

This key will be used as a fallback if no org-specific key is configured.

## How It Works

### Priority System

The system uses API keys in this priority order:

1. **Organization-specific key** (if enabled in settings)
2. **Global environment variable** (`GOOGLE_MAPS_API_KEY`)
3. **No key** → Maps features will be limited/disabled

### Automatic Features

Once configured, Google Maps is automatically used for:

1. **Pool Location Setup**:
   - When creating/updating a pool with an address, it auto-geocodes to get coordinates
   - Uses org-specific API key if available

2. **Geofencing**:
   - More accurate distance calculation using walking distance
   - Accounts for roads, obstacles, and actual paths
   - Falls back to Haversine formula if API key not available

3. **ETA Calculation**:
   - Accurate driving time estimates
   - Used when assigning jobs, rescheduling, and calculating routes

4. **Distance Matrix**:
   - Used for route optimization
   - Multiple destination calculations

## API Key Verification

The system automatically verifies API keys when:
- Updating Google Maps settings in the UI
- Making API calls (will fail gracefully if key is invalid)

### Manual Verification

You can verify an API key using the verification endpoint:

```bash
POST /api/maps/verify-api-key
{
  "apiKey": "YOUR_API_KEY"  // Optional
}
```

Response:
```json
{
  "valid": true
}
```

Or if invalid:
```json
{
  "valid": false,
  "message": "API key is invalid or restricted"
}
```

## Cost Considerations

Google Maps API pricing (as of 2024):
- **Geocoding**: $5 per 1,000 requests
- **Distance Matrix**: $5 per 1,000 elements
- **Directions**: $5 per 1,000 requests

### Cost Optimization Tips:

1. **Enable caching**: The system caches geocoded addresses
2. **Use restrictions**: Restrict API keys to specific domains/IPs
3. **Monitor usage**: Check Google Cloud Console for usage
4. **Set quotas**: Set daily/monthly quotas to prevent unexpected charges
5. **Use free tier**: Google provides $200/month free credit

## Troubleshooting

### Issue: "Google Maps API key not configured"

**Solution**: 
- Set `GOOGLE_MAPS_API_KEY` in `.env`, or
- Configure org-specific key in Settings → Integrations → Google Maps

### Issue: "API key is invalid or restricted"

**Possible causes**:
1. API key is incorrect
2. Required APIs are not enabled
3. API key restrictions are too strict

**Solution**:
1. Verify API key in Google Cloud Console
2. Enable required APIs (Geocoding, Distance Matrix, Directions)
3. Check API key restrictions (allow your domain/IP)

### Issue: "OVER_QUERY_LIMIT"

**Solution**:
- Check your Google Cloud Console for quota limits
- Consider upgrading your quota or using multiple API keys
- Wait for quota reset (usually daily)

### Issue: Geofencing not working accurately

**Solution**:
- Ensure pool has correct `lat` and `lng` coordinates
- Verify Google Maps API key is configured and enabled
- Check that API key has Distance Matrix API enabled
- System falls back to Haversine formula if API unavailable (less accurate)

## Security Best Practices

1. **Restrict API Keys**:
   - Use HTTP referrer restrictions for web apps
   - Use IP restrictions for API servers
   - Limit to only required APIs

2. **Rotate Keys Regularly**:
   - Update keys periodically
   - Revoke old keys after updating

3. **Monitor Usage**:
   - Set up alerts in Google Cloud Console
   - Monitor for unusual activity

4. **Use Separate Keys**:
   - Different keys for development/production
   - Organization-specific keys for multi-tenant setups

## Testing

### Test Geocoding

```bash
POST /api/maps/geocode
{
  "address": "1600 Amphitheatre Parkway, Mountain View, CA"
}
```

### Test Distance Calculation

```bash
POST /api/maps/distance
{
  "origin": { "lat": 37.4219983, "lng": -122.084 },
  "destination": { "lat": 37.422, "lng": -122.085 },
  "mode": "driving"
}
```

### Test Reverse Geocoding

```bash
POST /api/maps/reverse-geocode
{
  "lat": 37.4219983,
  "lng": -122.084
}
```

## Migration from Environment Variable to Settings

If you're currently using `GOOGLE_MAPS_API_KEY` in `.env` and want to move to org-specific keys:

1. Keep the environment variable as a fallback
2. Configure org-specific keys in Settings → Integrations → Google Maps
3. The system will use org-specific keys when available
4. Environment variable remains as fallback for other orgs

## Support

For Google Maps API issues:
- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [Google Cloud Console](https://console.cloud.google.com/)
- [API Status Dashboard](https://status.cloud.google.com/)

