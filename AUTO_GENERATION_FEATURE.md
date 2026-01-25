# Automatic Job and Invoice Generation

This document describes the automatic generation features for jobs and invoices in the PoolCare system.

## Overview

The system now automatically:
1. **Generates cleaning jobs from service plans** when plans are created or resumed
2. **Creates invoices from completed cleaning jobs** when visits are completed
3. **Supports periodic job generation** via a cron endpoint

## Features

### 1. Automatic Job Generation from Service Plans

When a service plan is created or resumed, the system automatically generates jobs for the next 56 days (8 weeks) based on the plan's frequency and schedule.

**Trigger Points:**
- When a new service plan is created (`POST /service-plans`)
- When a paused service plan is resumed (`POST /service-plans/:id/resume`)

**How it works:**
- The system calculates all job occurrences based on the plan's frequency (weekly, biweekly, monthly)
- Jobs are created with the appropriate window times (from plan defaults or overrides)
- The plan's `nextVisitAt` is updated to the next occurrence after the generation horizon
- Duplicate jobs are automatically skipped (jobs already exist for those dates)

**Manual Generation:**
- Generate jobs for all active plans: `POST /service-plans/generate`
- Generate jobs for a specific plan: `POST /service-plans/:id/generate`

### 2. Automatic Invoice Creation from Completed Jobs

When a cleaning visit is completed, if the job is associated with a service plan, the system automatically creates a draft invoice.

**Trigger Point:**
- When a visit is completed (`POST /visits/:id/complete`)

**How it works:**
- The system checks if the completed job has a `planId`
- If a plan exists, it retrieves the plan's pricing information (price, tax, discount)
- Creates a draft invoice with:
  - Client and pool information from the job
  - Invoice items based on the service plan pricing
  - Due date set to 30 days from completion
  - Status: `draft` (ready for review and sending)
- If an invoice already exists for the visit, it skips creation (prevents duplicates)

**Invoice Details:**
- **Items:** Service Visit - [frequency] Cleaning (e.g., "Service Visit - weekly Cleaning")
- **Pricing:** Uses the plan's `priceCents`, `taxPct`, and `discountPct`
- **Currency:** Uses the plan's currency (default: GHS)
- **Notes:** Auto-generated note indicating the invoice source

### 3. Periodic Job Generation (Cron)

A cron endpoint is available for periodic job generation across all organizations and active plans.

**Endpoint:** `POST /cron/generate-jobs`

**Parameters:**
- `horizonDays` (query, optional): Number of days ahead to generate jobs (default: 56)

**Security:**
- Protected by `CRON_SECRET` environment variable
- Include header: `x-cron-secret: <CRON_SECRET>` when calling the endpoint
- If `CRON_SECRET` is not set, the endpoint is publicly accessible (not recommended for production)

**Example Cron Job (daily at 2 AM):**
```bash
# Add to crontab
0 2 * * * curl -X POST http://localhost:4000/api/cron/generate-jobs?horizonDays=56 -H "x-cron-secret: YOUR_SECRET_HERE"
```

**Response:**
```json
{
  "orgsProcessed": 3,
  "plansProcessed": 15,
  "jobsGenerated": 120
}
```

## Configuration

### Environment Variables

- `CRON_SECRET` (optional): Secret token for protecting the cron endpoint

### Service Plan Settings

Service plans control automatic generation through:
- `status`: Must be `active` for jobs to be generated
- `frequency`: Determines job occurrence pattern (weekly, biweekly, monthly)
- `dow` (day of week): Required for weekly/biweekly plans
- `dom` (day of month): Required for monthly plans
- `windowStart` / `windowEnd`: Time windows for job scheduling
- `startsOn` / `endsOn`: Date range for plan validity
- `priceCents`, `taxPct`, `discountPct`: Used for invoice generation

## Workflow Examples

### Example 1: New Service Plan → Jobs → Invoice

1. **Manager creates a weekly service plan:**
   ```
   POST /service-plans
   {
     "poolId": "...",
     "frequency": "weekly",
     "dow": "mon",
     "priceCents": 18000,
     ...
   }
   ```

2. **System automatically generates jobs:**
   - Creates jobs for the next 8 weeks (every Monday)
   - Updates plan's `nextVisitAt` to the 9th Monday

3. **Carer completes a visit:**
   ```
   POST /visits/:id/complete
   ```

4. **System automatically creates invoice:**
   - Draft invoice created with $180.00 (or equivalent in plan currency)
   - Linked to the visit and client
   - Ready for manager to review and send

### Example 2: Resumed Plan → Jobs

1. **Manager resumes a paused plan:**
   ```
   POST /service-plans/:id/resume
   ```

2. **System automatically generates jobs:**
   - Creates jobs for the next 8 weeks
   - Recalculates `nextVisitAt` based on current date

### Example 3: Daily Cron Job

1. **Cron job runs daily at 2 AM:**
   - Calls `POST /cron/generate-jobs`
   - System processes all active plans across all organizations
   - Generates jobs for the next 8 weeks
   - Logs results for monitoring

## Error Handling

- **Job Generation Failures:** Logged but don't prevent plan creation/resumption
- **Invoice Creation Failures:** Logged but don't prevent visit completion
- **Duplicate Prevention:** System automatically skips creating duplicate jobs or invoices

## Monitoring

Check logs for:
- `PlansSchedulerService`: Job generation activity
- `VisitsService`: Invoice creation activity
- Error messages for failed generations

## Future Enhancements

Potential improvements:
- Configurable auto-generation settings per organization
- Email notifications when jobs/invoices are auto-generated
- Dashboard metrics for auto-generated items
- Ability to disable auto-generation per plan
- Custom invoice templates per plan type

