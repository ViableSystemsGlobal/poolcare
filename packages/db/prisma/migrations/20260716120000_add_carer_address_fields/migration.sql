-- Add landmark + GhanaPost GPS address to carers
ALTER TABLE "Carer" ADD COLUMN "homeBaseAddress" TEXT;
ALTER TABLE "Carer" ADD COLUMN "ghanaPostAddress" TEXT;
