# Quote Approval → Auto-Create Job Workflow

## Overview

When a quote is approved (by client or manager), the system now automatically creates a repair job. This completes the critical business flow: **Issue → Quote → Job → Visit → Invoice**.

## Implementation Details

### Database Schema Changes

**Job Model** - Added `quoteId` field:
```prisma
model Job {
  // ... existing fields
  quoteId         String?   @db.Uuid
  // ... rest of fields
  
  quote         Quote?       @relation(fields: [quoteId], references: [id], onDelete: SetNull)
  // ... other relations
}
```

**Quote Model** - Added `jobs` relation:
```prisma
model Quote {
  // ... existing fields
  jobs    Job[]
  // ... other relations
}
```

### Automatic Job Creation

When a quote is approved via `POST /quotes/:id/approve`:

1. **Quote Status Updated**: Status changes from `pending` → `approved`
2. **Job Auto-Created**: A new job is automatically created with:
   - **Pool**: Same pool as the quote
   - **Window**: Default 2 days from approval, 9 AM - 1 PM (4-hour window)
   - **Status**: `scheduled`
   - **Notes**: Includes quote ID and issue type (if linked)
   - **Quote Link**: Job is linked to the quote via `quoteId`
3. **Issue Status Updated**: If quote is linked to an issue, issue status changes to `scheduled`
4. **Audit Trail**: Both approval and job creation are logged in `QuoteAudit`

### Default Job Window

The auto-created job uses these defaults:
- **Start Date**: 2 days from approval date
- **Time Window**: 9:00 AM - 1:00 PM (4 hours)
- **Duration**: Can be adjusted by manager after creation

### Error Handling

If job creation fails:
- **Quote approval still succeeds** (doesn't block the approval)
- **Error is logged** to console for debugging
- **Manager can manually create job** using `POST /quotes/:id/create-job` endpoint

## API Endpoints

### Approve Quote (Auto-Creates Job)
```
POST /api/quotes/:id/approve
Authorization: Bearer <token>
Body: {
  "approvedBy": "optional-user-id" // Only for ADMIN/MANAGER
}
```

**Response:**
```json
{
  "id": "quote-id",
  "status": "approved",
  "approvedAt": "2025-01-15T10:30:00Z",
  "approvedBy": "user-id",
  // ... other quote fields
}
```

**What happens:**
1. Quote is approved
2. Job is automatically created (async, non-blocking)
3. Issue status updated (if linked)
4. Audit entries created

### Manual Job Creation (Optional)
```
POST /api/quotes/:id/create-job
Authorization: Bearer <token>
Body: {
  "windowStart": "2025-01-17T09:00:00Z",
  "windowEnd": "2025-01-17T13:00:00Z",
  "assignedCarerId": "optional-carer-id",
  "notes": "Custom notes"
}
```

Use this if:
- Auto-creation failed
- You want custom window times
- You want to assign a carer immediately

## Workflow Example

### Complete Flow

1. **Issue Reported**
   ```
   POST /api/issues
   {
     "poolId": "...",
     "type": "equipment_failure",
     "severity": "high"
   }
   ```

2. **Quote Created**
   ```
   POST /api/quotes
   {
     "poolId": "...",
     "issueId": "...",
     "items": [
       {"label": "Pump Repair", "qty": 1, "unitPriceCents": 50000}
     ]
   }
   ```

3. **Client Approves Quote**
   ```
   POST /api/quotes/:id/approve
   ```
   **Result:**
   - Quote status: `approved`
   - Job automatically created (scheduled 2 days out)
   - Issue status: `scheduled`

4. **Manager Assigns Carer** (optional, can be done later)
   ```
   PATCH /api/jobs/:jobId/assign
   {
     "assignedCarerId": "..."
   }
   ```

5. **Carer Completes Job**
   - Visit entry created
   - Job status: `completed`
   - Issue status: `resolved` (if linked)

6. **Invoice Auto-Created** (from visit completion)
   - Invoice linked to quote
   - Ready for sending

## Benefits

✅ **Streamlined Workflow**: No manual job creation needed
✅ **Consistent Scheduling**: Default 2-day window ensures timely service
✅ **Complete Traceability**: Job → Quote → Issue chain maintained
✅ **Error Resilient**: Approval succeeds even if job creation fails
✅ **Flexible**: Managers can still manually create jobs with custom settings

## Configuration

### Customizing Default Window

To change the default job window, modify `quotes.service.ts`:

```typescript
// Current: 2 days from approval, 9 AM - 1 PM
const windowStart = new Date();
windowStart.setDate(windowStart.getDate() + 2); // Change days here
windowStart.setHours(9, 0, 0, 0); // Change start hour here

const windowEnd = new Date(windowStart);
windowEnd.setHours(13, 0, 0, 0); // Change end hour here
```

### Disabling Auto-Creation

To disable auto-creation, comment out the job creation block in `approve()` method:

```typescript
// Auto-create job from approved quote
// try {
//   ... job creation code ...
// } catch (error) {
//   ...
// }
```

## Database Migration

After schema changes, run:

```bash
cd packages/db
npx prisma migrate dev --name add_quote_id_to_job
# OR
npx prisma db push
```

## Testing

1. **Create a quote** with an issue
2. **Approve the quote** (as client or manager)
3. **Verify job created**:
   - Check `/api/jobs` endpoint
   - Job should have `quoteId` set
   - Job window should be 2 days from approval
4. **Verify issue status** updated to `scheduled`
5. **Check audit trail** in `QuoteAudit` table

## Future Enhancements

Potential improvements:
- Configurable default window per organization
- Smart scheduling based on carer availability
- Email/SMS notification when job is auto-created
- Option to assign carer during approval
- Calendar view showing auto-created jobs

