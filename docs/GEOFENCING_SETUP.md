# Geofencing Setup Guide

## Overview

Geofencing ensures that carers can only start jobs and mark arrival when they are physically present at the pool location. This prevents fraudulent job claims and ensures service quality.

## How Geofencing Works

1. **Pool Location**: Each pool must have GPS coordinates (`lat` and `lng`) set
2. **Carer Location**: When starting a job or marking arrival, the carer's mobile app sends their current GPS location
3. **Distance Check**: The system calculates the distance between the carer and pool using the Haversine formula
4. **Validation**: If the carer is outside the allowed radius, the action is blocked with an error message

## Setting Pool Locations

### Method 1: Via Address (Auto-Geocoding)

When creating or updating a pool, provide an `address` field. The system will automatically geocode it to get coordinates:

```typescript
// API Request
POST /api/pools
{
  "clientId": "...",
  "name": "Main Pool",
  "address": "123 Main Street, City, State 12345"
}
```

The system will automatically:
- Geocode the address using Google Maps API
- Set `lat` and `lng` coordinates
- Store the formatted address

### Method 2: Manual Coordinates

You can also set coordinates directly:

```typescript
// API Request
POST /api/pools
{
  "clientId": "...",
  "name": "Main Pool",
  "address": "123 Main Street, City, State 12345",
  "lat": 40.7128,
  "lng": -74.0060
}
```

### Method 3: Update Location Endpoint

Managers and admins can update a pool's location:

```typescript
// API Request
POST /api/pools/:id/location
{
  "address": "New Address, City, State"
}
```

## Configuring Geofencing Radius

The geofencing radius is configurable via environment variables in `apps/api/.env`:

```bash
# Geofencing radius for "Start Job" action (in meters)
# Default: 200 meters
GEOFENCE_START_JOB_RADIUS_METERS=200

# Geofencing radius for "Mark Arrived" action (in meters)
# Default: 100 meters (stricter than start)
GEOFENCE_ARRIVAL_RADIUS_METERS=100
```

### Recommended Values

- **Start Job Radius**: 150-300 meters
  - Allows for GPS inaccuracy and parking distance
  - Prevents starting jobs from far away
  
- **Arrival Radius**: 50-150 meters
  - Stricter to ensure carer is actually at the pool
  - Accounts for property size and GPS accuracy

### Adjusting for Your Needs

1. **Urban Areas**: Smaller radius (100-150m for start, 50-100m for arrival)
   - More accurate GPS, closer parking
   
2. **Rural Areas**: Larger radius (200-300m for start, 100-150m for arrival)
   - Less accurate GPS, longer driveways
   
3. **Large Properties**: Larger radius
   - Pools may be far from property entrance

## How to Update Configuration

1. Edit `apps/api/.env`:
   ```bash
   GEOFENCE_START_JOB_RADIUS_METERS=250
   GEOFENCE_ARRIVAL_RADIUS_METERS=120
   ```

2. Restart the API server:
   ```bash
   ./restart-api.sh
   # or
   pnpm --filter api dev
   ```

## Testing Geofencing

### Test Pool Location Setup

1. Create a pool with an address or coordinates
2. Verify coordinates are set:
   ```bash
   GET /api/pools/:id
   # Check that lat and lng are present
   ```

### Test Geofencing Behavior

1. **From Mobile App**:
   - Try to start a job when far from the pool → Should fail
   - Try to start a job when near the pool → Should succeed
   - Try to mark arrival when far from the pool → Should fail

2. **From API** (for testing):
   ```bash
   POST /api/jobs/:id/start
   {
     "location": {
       "lat": 40.7128,  # Pool coordinates
       "lng": -74.0060
     }
   }
   ```

## Troubleshooting

### Issue: "Location is required" error

**Solution**: Ensure the mobile app has location permissions enabled and is sending location data.

### Issue: "You must be within Xm of the pool location" error

**Possible causes**:
1. Pool coordinates are incorrect → Update pool location
2. GPS accuracy is poor → Increase radius in `.env`
3. Carer is actually too far → Move closer to pool

**Solution**: 
- Verify pool coordinates are correct
- Check if radius needs adjustment for your area
- Ensure mobile device has good GPS signal

### Issue: Pool has no coordinates

**Solution**: 
1. Update the pool with an address (auto-geocodes)
2. Or manually set `lat` and `lng` via update endpoint

### Issue: Geofencing too strict/lenient

**Solution**: Adjust `GEOFENCE_START_JOB_RADIUS_METERS` and `GEOFENCE_ARRIVAL_RADIUS_METERS` in `.env` file.

## Disabling Geofencing (Not Recommended)

If you need to temporarily disable geofencing for testing:

1. Set very large radius values:
   ```bash
   GEOFENCE_START_JOB_RADIUS_METERS=10000
   GEOFENCE_ARRIVAL_RADIUS_METERS=10000
   ```

2. Or modify the code to skip the check (not recommended for production)

## Best Practices

1. **Always set pool coordinates** when creating pools
2. **Verify coordinates** are accurate (check on a map)
3. **Test geofencing** in your actual service areas
4. **Adjust radius** based on your typical property sizes
5. **Monitor errors** to identify pools with incorrect coordinates
6. **Update coordinates** if pool location changes

## API Endpoints Reference

- `POST /api/pools` - Create pool (auto-geocodes from address)
- `PUT /api/pools/:id` - Update pool (can set lat/lng or address)
- `POST /api/pools/:id/location` - Update pool location (managers/admins only)
- `GET /api/pools/:id` - Get pool details (includes lat/lng)

