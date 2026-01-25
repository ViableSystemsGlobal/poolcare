/**
 * Default detailed checklist based on requirements from newupdate.md
 * Each item can be marked as "not applicable" with a comment
 */
export const DEFAULT_DETAILED_CHECKLIST = [
  // Routine Cleaning & Chemical Balancing
  {
    id: "clean_debris_surface",
    label: "Collect all debris and leaves (surface - not submerged)",
    required: true,
    category: "cleaning",
    requiresNumericInput: false,
    allowsNotApplicable: false,
  },
  {
    id: "clean_debris_submerged",
    label: "Remove submerged leaves and debris using net",
    required: true,
    category: "cleaning",
    requiresNumericInput: false,
    allowsNotApplicable: false,
  },
  {
    id: "clean_waterline",
    label: "Clean waterline/oil line (Rosemarie Balfour line on surface)",
    required: true,
    category: "cleaning",
    requiresNumericInput: false,
    allowsNotApplicable: false,
  },
  {
    id: "backwash",
    label: "Perform backwash",
    required: true,
    category: "cleaning",
    requiresNumericInput: false,
    allowsNotApplicable: true, // Can be N/A if not needed
  },
  
  // Water Chemistry Testing (REQUIRES NUMERIC INPUT - cannot skip)
  {
    id: "test_ph",
    label: "Test pH level",
    required: true,
    category: "chemistry",
    requiresNumericInput: true, // MUST enter number
    allowsNotApplicable: false,
    numericField: "ph",
    min: 7.0,
    max: 8.0,
  },
  {
    id: "test_chlorine_free",
    label: "Test Free Chlorine (must be between 1-3 ppm)",
    required: true,
    category: "chemistry",
    requiresNumericInput: true, // MUST enter number
    allowsNotApplicable: false,
    numericField: "chlorineFree",
    min: 1.0,
    max: 3.0,
  },
  {
    id: "test_alkalinity",
    label: "Test Total Alkalinity",
    required: true,
    category: "chemistry",
    requiresNumericInput: true, // MUST enter number
    allowsNotApplicable: false,
    numericField: "alkalinity",
    min: 80,
    max: 120,
  },
  {
    id: "test_calcium",
    label: "Test Calcium Hardness",
    required: false,
    category: "chemistry",
    requiresNumericInput: true,
    allowsNotApplicable: true,
    numericField: "calciumHardness",
  },
  {
    id: "test_cyanuric",
    label: "Test Cyanuric Acid (CYA/Stabilizer)",
    required: false,
    category: "chemistry",
    requiresNumericInput: true,
    allowsNotApplicable: true,
    numericField: "cyanuricAcid",
  },
  {
    id: "test_temperature",
    label: "Test Water Temperature",
    required: true,
    category: "chemistry",
    requiresNumericInput: true,
    allowsNotApplicable: false,
    numericField: "tempC",
  },
  
  // Equipment Inspection & Maintenance
  {
    id: "check_valves",
    label: "Check all valves are correct",
    required: true,
    category: "equipment",
    requiresNumericInput: false,
    allowsNotApplicable: false,
  },
  {
    id: "check_pump_condition",
    label: "Check pump condition and sound (working all right)",
    required: true,
    category: "equipment",
    requiresNumericInput: false,
    allowsNotApplicable: false,
  },
  {
    id: "check_filter_pressure",
    label: "Check filter pressure (within range)",
    required: true,
    category: "equipment",
    requiresNumericInput: false, // Could be numeric but not required
    allowsNotApplicable: true,
  },
  {
    id: "clean_pump_filter_area",
    label: "Dust and clean pump and filter area",
    required: true,
    category: "equipment",
    requiresNumericInput: false,
    allowsNotApplicable: false,
  },
  {
    id: "check_pump_room_storage",
    label: "Check for hazards (pump room used as storage - must be clear)",
    required: true,
    category: "equipment",
    requiresNumericInput: false,
    allowsNotApplicable: true, // N/A if no pump room
  },
  {
    id: "check_salt_cell",
    label: "Check salt cell (if saltwater pool)",
    required: false,
    category: "equipment",
    requiresNumericInput: false,
    allowsNotApplicable: true, // N/A if not saltwater
  },
  
  // Safety Checks
  {
    id: "check_ladders",
    label: "Inspect ladders",
    required: true,
    category: "safety",
    requiresNumericInput: false,
    allowsNotApplicable: true,
  },
  {
    id: "check_railings",
    label: "Inspect railings",
    required: true,
    category: "safety",
    requiresNumericInput: false,
    allowsNotApplicable: true,
  },
  {
    id: "check_lights",
    label: "Inspect pool lights",
    required: true,
    category: "safety",
    requiresNumericInput: false,
    allowsNotApplicable: true,
  },
  
  // Water Level (Optional)
  {
    id: "request_water_fill",
    label: "Request security/client to fill water if needed",
    required: false,
    category: "maintenance",
    requiresNumericInput: false,
    allowsNotApplicable: true,
  },
  
  // Photos (Required)
  {
    id: "photo_before",
    label: "Take before photos",
    required: true,
    category: "documentation",
    requiresNumericInput: false,
    allowsNotApplicable: false,
    requiresPhoto: true,
  },
  {
    id: "photo_after",
    label: "Take after photos",
    required: true,
    category: "documentation",
    requiresNumericInput: false,
    allowsNotApplicable: false,
    requiresPhoto: true,
  },
];

