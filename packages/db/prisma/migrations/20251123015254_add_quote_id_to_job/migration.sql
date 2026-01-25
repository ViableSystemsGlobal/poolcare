-- Add quoteId column to Job table
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "quoteId" UUID;

-- Add foreign key constraint
ALTER TABLE "Job" ADD CONSTRAINT "Job_quoteId_fkey" 
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS "Job_quoteId_idx" ON "Job"("quoteId");
