# Carer App Gap Analysis: Requirements vs Implementation

**Date:** December 2024  
**Source:** Comparing `docs/updated.md` Section D (Service Workflow) with current carer app implementation

## ✅ **What's Implemented**

### 1. Basic Service Workflow
- ✅ **Start Job** - Carer can start a job (en_route status)
- ✅ **Mark Arrived** - Carer can mark arrival at location
- ✅ **Job Status Tracking** - Status updates (scheduled → en_route → on_site → completed)

### 2. Water Chemistry Readings
- ✅ **pH level** - Captured
- ✅ **Chlorine levels** - Free chlorine and total chlorine captured
- ✅ **Total Alkalinity** - Captured
- ✅ **Calcium Hardness** - Captured
- ✅ **Cyanuric Acid (CYA/Stabilizer)** - Captured
- ✅ **Temperature** - Captured (tempC)

### 3. Checklist System
- ✅ **Basic Checklist** - 12 tasks with required/optional flags
- ✅ **Task Completion Tracking** - Can mark tasks as complete
- ✅ **Progress Indicator** - Shows completion percentage
- ✅ **Required vs Optional** - Distinguishes required tasks

### 4. Photo Upload
- ✅ **Before Photos** - Can capture and upload
- ✅ **After Photos** - Can capture and upload
- ✅ **Camera/Gallery Selection** - Both options available
- ✅ **Photo Upload to Backend** - Integrated with presigned URLs

### 5. Chemical Tracking
- ✅ **Chemical Entry** - Can add chemicals used
- ✅ **Quantity & Unit Tracking** - Records name, quantity, unit
- ✅ **Multiple Chemicals** - Can add multiple chemicals

### 6. Visit Completion
- ✅ **Completion Validation** - Checks required tasks, readings, photos
- ✅ **API Integration** - Completes visit and job via API

---

## ❌ **What's Missing**

### 1. GPS-Based Arrival Confirmation
- ❌ **GPS Check-in** - Currently manual "Mark Arrived" button
- ❌ **Location Verification** - No GPS coordinates captured
- ❌ **Automatic Arrival Detection** - No proximity-based check-in

**Required from docs:**
> "Arrival confirmation/check-in (GPS-based)"

### 2. Missing Water Chemistry Parameters
- ❌ **TDS (Total Dissolved Solids)** - Not captured
- ❌ **Salinity** - Not captured (for saltwater pools)

**Required from docs:**
> "Input field readings: pH, chlorine, TDS, alkalinity, temperature"

### 3. Incomplete Checklist
- ❌ **Detailed Task Breakdown** - Current checklist is generic (12 tasks)
- ❌ **Missing Specific Tasks:**
  - Skimming (mentioned but not detailed)
  - Vacuuming (mentioned but not detailed)
  - Brushing (mentioned but not detailed)
  - Emptying baskets (mentioned but not detailed)
  - Final water testing (separate from initial)
  - Equipment inspection details
  - Filter cleaning/backwashing details
  - Salt cell inspection (only mentioned if saltwater)
  - Safety checks (ladders, railings, lights)
  - Preventive treatments

**Required from docs:**
> Detailed breakdown with:
> - Routine Cleaning & Chemical Balancing (A-G)
> - Equipment Inspection & Maintenance (A-D)
> - Additional Services (A-C)

### 4. Chemical Dosage Calculator
- ❌ **Auto-calculation** - No automatic dosage calculation
- ❌ **Pool Volume Integration** - Doesn't use pool volume for calculations
- ❌ **Recommendations** - No AI or rule-based recommendations

**Required from docs:**
> "Chemical dosage tracker (auto-calculates required amounts)"

### 5. Customer Signature/Approval
- ❌ **Signature Capture** - Not implemented
- ❌ **Customer Approval** - No approval workflow
- ❌ **Digital Signature** - No signature pad or image capture

**Required from docs:**
> "Customer signature or approval"

### 6. Service Report Generation
- ❌ **Instant Report** - No report generation
- ❌ **PDF Export** - No PDF creation
- ❌ **Report Content:**
  - Summary of work done
  - Test readings and actions
  - Issues identified
  - Recommendations
  - Before/after photos
  - Chemical usage

**Required from docs:**
> "Generate instant service report. Reports should auto-sync to the customer's account and email."

### 7. Video Upload
- ❌ **Video Capture** - Only photos, no videos

**Required from docs:**
> "Upload photos/videos (before and after)"

### 8. Chemical Selection from Predefined List
- ❌ **Predefined Chemical List** - Manual text entry only
- ❌ **Missing Chemicals from Spec:**
  - Multi-function Chlorine
  - Classic Chlorine
  - Instant Chlorine
  - pH+
  - pH-
  - WaterClear
  - Metal Control
  - Pool Algae Clear
  - Enzyme Clarifier
  - PoolCare Clarifying Gel
  - Grease and Oil Clarifier
  - Urea Remover

**Required from docs:**
> "Tick which chemical has been added or used" with predefined list

### 9. Visit Template Integration
- ❌ **Dynamic Checklist** - Uses hardcoded default checklist
- ❌ **Template-based Tasks** - Should load from visit template

**Current Code:**
```typescript
// Default checklist - in production, this could come from visit template
const defaultChecklist: ChecklistItem[] = [...]
```

---

## 📊 **Implementation Status Summary**

| Feature | Status | Priority |
|---------|--------|----------|
| Basic Workflow (Start/Arrive/Complete) | ✅ Complete | High |
| Water Chemistry Readings (Basic) | ✅ Complete | High |
| Photo Upload (Before/After) | ✅ Complete | High |
| Chemical Tracking (Manual) | ✅ Complete | High |
| GPS-Based Arrival | ❌ Missing | High |
| TDS & Salinity Readings | ❌ Missing | Medium |
| Detailed Checklist | ❌ Partial | High |
| Chemical Dosage Calculator | ❌ Missing | Medium |
| Customer Signature | ❌ Missing | Medium |
| Service Report Generation | ❌ Missing | High |
| Video Upload | ❌ Missing | Low |
| Predefined Chemical List | ❌ Missing | Medium |
| Visit Template Integration | ❌ Missing | Medium |

---

## 🎯 **Recommended Next Steps**

### High Priority
1. **Service Report Generation** - Critical for client transparency
2. **Detailed Checklist** - Expand to match full specification
3. **GPS-Based Arrival** - Improve accuracy and automation

### Medium Priority
4. **Chemical Dosage Calculator** - Add auto-calculation based on pool volume
5. **Customer Signature** - Add signature capture functionality
6. **Predefined Chemical List** - Replace manual entry with selection
7. **TDS & Salinity** - Add missing water chemistry parameters

### Low Priority
8. **Video Upload** - Nice-to-have feature
9. **Visit Template Integration** - Load checklist from backend templates

---

## 📝 **Notes**

- The current implementation provides a solid foundation for the service workflow
- Most core functionality is in place (readings, photos, chemicals, completion)
- Missing features are primarily enhancements and automation
- The checklist needs to be expanded to match the detailed specification
- Report generation is a critical missing piece for client communication

