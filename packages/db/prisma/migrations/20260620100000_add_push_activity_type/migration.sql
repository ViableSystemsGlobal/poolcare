-- Add PUSH to CrmActivityType enum
ALTER TYPE "CrmActivityType" ADD VALUE IF NOT EXISTS 'PUSH' AFTER 'SMS';
