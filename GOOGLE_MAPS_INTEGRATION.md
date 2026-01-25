# Google Maps Integration

## Overview

The PoolCare system now integrates with Google Maps API to provide:
- **Exact location tracking** for pools and carers
- **Automatic geocoding** (address to coordinates)
- **ETA calculation** using Distance Matrix API
- **Route optimization** support
- **Real-time location updates** for carers

## Features

### 1. Location Tracking

#### Pools
- **Fields**: `lat`, `lng`, `address`
- **Auto-geocoding**: When address is provided, automatically converts to coordinates
- **Update endpoint**: `POST /api/pools/:id/location` with address

#### Carers
- **Home Base**: `homeBaseLat`, `homeBaseLng` (starting location)
- **Current Location**: `currentLat`, `currentLng` (real-time tracking)
- **Last Update**: `lastLocationUpdate` (timestamp)
- **Update endpoints**:
  - `POST /api/carers/:id/home-base` - Update home base (with geocoding)
  - `POST /api/carers/:id/current-location` - Update current location (real-time)

### 2. Geocoding

Convert addresses to coordinates and vice versa:

**Geocode (Address → Coordinates)**
```
POST /api/maps/geocode
{
  "address": "123 Main St, Accra, Ghana"
}

Response:
{
  "lat": 5.6037,
  "lng": -0.1870,
  "formattedAddress": "123 Main St, Accra, Ghana",
  "placeId": "ChIJ..."
}
```

**Reverse Geocode (Coordinates → Address)**
```
POST /api/maps/reverse-geocode
{
  "lat": 5.6037,
  "lng": -0.1870
}

Response:
{
  "lat": 5.6037,
  "lng": -0.1870,
  "formattedAddress": "123 Main St, Accra, Ghana",
  "placeId": "ChIJ..."
}
```

### 3. ETA Calculation

Automatically calculates travel time and distance when a carer starts a job:

**How it works:**
1. When carer calls `POST /api/jobs/:id/start` with location
2. System calculates distance from carer location to pool location
3. Uses Google Maps Distance Matrix API
4. Updates job with `etaMinutes` and `distanceMeters`

**Location Priority:**
1. Location provided in request (current GPS)
2. Carer's current location (if recently updated)
3. Carer's home base location

### 4. Distance Calculation

Calculate distance between any two points:

```
POST /api/maps/distance
{
  "origin": { "lat": 5.6037, "lng": -0.1870 },
  "destination": { "lat": 5.6040, "lng": -0.1875 },
  "mode": "driving" // driving, walking, bicycling, transit
}

Response:
{
  "distanceMeters": 500,
  "durationSeconds": 120,
  "distanceText": "0.5 km",
  "durationText": "2 mins"
}
```

### 5. Multiple Destinations

Calculate distances to multiple destinations (for route optimization):

```
POST /api/maps/multiple-distances
{
  "origin": { "lat": 5.6037, "lng": -0.1870 },
  "destinations": [
    { "lat": 5.6040, "lng": -0.1875 },
    { "lat": 5.6050, "lng": -0.1885 }
  ],
  "mode": "driving"
}

Response:
[
  {
    "distanceMeters": 500,
    "durationSeconds": 120,
    "distanceText": "0.5 km",
    "durationText": "2 mins"
  },
  {
    "distanceMeters": 1200,
    "durationSeconds": 300,
    "distanceText": "1.2 km",
    "durationText": "5 mins"
  }
]
```

## API Endpoints

### Maps Service

- `POST /api/maps/geocode` - Convert address to coordinates
- `POST /api/maps/reverse-geocode` - Convert coordinates to address
- `POST /api/maps/distance` - Calculate distance between two points
- `POST /api/maps/multiple-distances` - Calculate distances to multiple destinations
- `POST /api/maps/directions` - Get turn-by-turn directions

### Pool Location

- `POST /api/pools/:id/location` - Update pool location from address (geocodes automatically)
- `PATCH /api/pools/:id` - Update pool (includes lat/lng fields)

### Carer Location

- `POST /api/carers/:id/home-base` - Update carer home base (with geocoding)
- `POST /api/carers/:id/current-location` - Update carer current location (real-time)
- `PATCH /api/carers/:id` - Update carer (includes homeBase fields)

### Job ETA

- `POST /api/jobs/:id/start` - Start job (automatically calculates ETA if locations available)

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
GOOGLE_MAPS_API_KEY=your_api_key_here
```

### Getting a Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable these APIs:
   - Maps JavaScript API
   - Geocoding API
   - Distance Matrix API
   - Directions API
4. Create credentials (API Key)
5. Restrict the key to your domain/IP (recommended)
6. Add to `.env` file

### API Quotas

Google Maps APIs have usage limits:
- **Free tier**: $200/month credit
- **Geocoding**: $5 per 1,000 requests
- **Distance Matrix**: $5 per 1,000 requests
- **Directions**: $5 per 1,000 requests

Monitor usage in Google Cloud Console.

## Database Schema Changes

### Carer Model
```prisma
model Carer {
  // ... existing fields
  homeBaseLat       Float?
  homeBaseLng       Float?
  currentLat        Float? // NEW: Current location latitude
  currentLng        Float? // NEW: Current location longitude
  lastLocationUpdate DateTime? @db.Timestamptz(6) // NEW: Last location update timestamp
  // ... rest of fields
}
```

### Pool Model
```prisma
model Pool {
  // ... existing fields
  lat         Float? // Already exists
  lng         Float? // Already exists
  address     String? // Already exists
  // ... rest of fields
}
```

## Usage Examples

### 1. Update Pool Location from Address

```typescript
// Automatically geocodes the address
POST /api/pools/pool-123/location
{
  "address": "123 Main Street, Accra, Ghana"
}

// Response includes lat/lng
{
  "id": "pool-123",
  "address": "123 Main Street, Accra, Ghana",
  "lat": 5.6037,
  "lng": -0.1870,
  // ... other fields
}
```

### 2. Update Carer Home Base

```typescript
// Option 1: From address (geocodes automatically)
POST /api/carers/carer-456/home-base
{
  "address": "456 Worker Ave, Accra, Ghana"
}

// Option 2: From coordinates
POST /api/carers/carer-456/home-base
{
  "lat": 5.6037,
  "lng": -0.1870
}
```

### 3. Update Carer Current Location (Real-time)

```typescript
// From mobile app GPS
POST /api/carers/carer-456/current-location
{
  "lat": 5.6040,
  "lng": -0.1875
}
```

### 4. Start Job with ETA Calculation

```typescript
// Carer starts job with current GPS location
POST /api/jobs/job-789/start
{
  "location": {
    "lat": 5.6040,
    "lng": -0.1875,
    "accuracyM": 10
  }
}

// System automatically:
// 1. Calculates distance from carer to pool
// 2. Calculates ETA using Google Maps
// 3. Updates job with etaMinutes and distanceMeters
// 4. Updates carer's current location

Response:
{
  "id": "job-789",
  "status": "en_route",
  "etaMinutes": 15,
  "distanceMeters": 2500,
  // ... other fields
}
```

## Error Handling

The Maps service gracefully handles errors:

- **API Key Missing**: Returns error, but doesn't crash the system
- **Geocoding Failed**: Falls back to manual lat/lng if provided
- **Distance Calculation Failed**: Uses provided ETA or skips calculation
- **Rate Limits**: Logs warning, returns error

All errors are logged but don't prevent core functionality.

## Future Enhancements

Potential improvements:
- **Route Optimization**: Use multiple destinations API for optimal job sequencing
- **Traffic-Aware ETAs**: Real-time traffic data integration
- **Geofencing**: Alert when carer arrives at/near pool location
- **Location History**: Track carer movement over time
- **Map Visualization**: Frontend map showing pools and carers
- **Offline Support**: Cache locations for offline use

## Testing

### Test Geocoding

```bash
curl -X POST http://localhost:4000/api/maps/geocode \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"address": "Accra, Ghana"}'
```

### Test Distance Calculation

```bash
curl -X POST http://localhost:4000/api/maps/distance \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": {"lat": 5.6037, "lng": -0.1870},
    "destination": {"lat": 5.6040, "lng": -0.1875},
    "mode": "driving"
  }'
```

## Migration

After schema changes, run:

```bash
cd packages/db
npx prisma migrate dev --name add_carer_current_location
# OR
npx prisma db push
npx prisma generate
```

## Notes

- **Privacy**: Current location is only stored temporarily for ETA calculation
- **Performance**: Distance calculations are cached where possible
- **Cost**: Monitor Google Maps API usage to avoid unexpected charges
- **Accuracy**: GPS accuracy depends on device and environment

