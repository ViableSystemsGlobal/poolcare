import { useState, useEffect, useRef, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, ActivityIndicator, Image, Platform, Linking, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Dimensions } from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Location from "expo-location";
import Constants from "expo-constants";
import SwipeButton from "../../src/components/SwipeButton";
import AccessFailureSheet from "../../src/components/AccessFailureSheet";
import { useTheme } from "../../src/contexts/ThemeContext";
// Conditionally import react-native-maps (requires development build, not Expo Go)
let MapView: any = null;
let Marker: any = null;
let Circle: any = null;
let PROVIDER_GOOGLE: any = null;

try {
  const maps = require("react-native-maps");
  MapView = maps.default;
  Marker = maps.Marker;
  Circle = maps.Circle;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
} catch (e) {
  console.warn("react-native-maps not available. Using fallback map view.");
}

// The native map must never be drawn without a provider that can render it:
// Google Maps on Android aborts the whole app when the build has no API key,
// and the Google provider isn't linked on iOS. iOS uses Apple Maps (no key);
// Android uses Google only when this build was configured with a key, and
// otherwise drops to the WebView / "open in Maps" fallbacks below.
// Android: the Google Maps SDK reads its key from the APK's AndroidManifest
// (baked in at build time from EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in the EAS env),
// not from JS. Don't gate on Constants.expoConfig — an OTA manifest may not
// carry the key even though the installed APK does. Never pass the org-settings
// key here: the API returns it masked ("***").
const NATIVE_MAP_AVAILABLE = !!MapView;
const NATIVE_MAP_PROVIDER = Platform.OS === "android" ? PROVIDER_GOOGLE : undefined;
import { api, getApiUrl } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";
import { ChecklistWizard, ChecklistItem as WizardChecklistItem, useToast, wizardProgressKey, clearWizardProgress } from "../../src/components";
import {
  C,
  Card,
  Row,
  Chip,
  Avatar,
  Button,
  Footer,
  Notice,
  Eyebrow,
  PoolThumb,
  IconButton,
  EmptyState,
  ScreenHeader,
  SectionHeader,
  fmtTime,
} from "../../src/ui";
// COLORS removed — replaced with literals below

interface ChecklistItem {
  id: string;
  task: string;
  completed: boolean;
  required: boolean;
}

interface Reading {
  ph?: number;
  chlorineFree?: number;
  chlorineTotal?: number;
  alkalinity?: number;
  calciumHardness?: number;
  cyanuricAcid?: number;
  tempC?: number;
  tds?: number;
  salinity?: number;
}

// Labels for client-disclosed hazards (mirrors the client app's list).
const SITE_HAZARD_LABELS: Record<string, string> = {
  dogs: "Dogs or other animals",
  exposed_wiring: "Exposed wiring / electrical",
  chemicals_stored: "Hazardous chemicals stored",
  slippery: "Slippery or unsafe surfaces",
  construction: "Construction / other works",
  security: "Security / access control",
  other: "Other (see details)",
};

const ACTIVE_STATUSES = ["scheduled", "en_route", "on_site"];

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    scheduled: "scheduled", en_route: "en route", on_site: "on site",
    completed: "completed", failed: "marked as failed", cancelled: "cancelled",
  };
  return labels[status] || status;
}

// Built once per pool; the carer's position is pushed in with injectJavaScript
// so GPS updates move a marker instead of reloading the map every few seconds.
// Uses Leaflet + OpenStreetMap tiles: no API key, so it can't fail on Google key
// restrictions (a WebView page has no allowed referrer) or Maps billing.
function buildMapHtml(
  pool: { lat: number; lng: number },
  carer: { lat: number; lng: number } | null,
  radius: number
) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body, html, #map { height: 100%; width: 100%; overflow: hidden; background: #e5e7eb; }
      #error { display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000;
        text-align: center; padding: 16px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        font-family: -apple-system, Roboto, sans-serif; color: #6b7280; font-size: 13px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div id="error">Map couldn't load. Use "Open in Maps" below.</div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      var map = null, carerMarker = null, fitted = false;
      var poolLocation = [${pool.lat}, ${pool.lng}];
      var pendingCarer = ${carer ? `[${carer.lat}, ${carer.lng}]` : "null"};

      window.updateCarer = function(lat, lng) {
        pendingCarer = [lat, lng];
        if (!map) return;
        if (!carerMarker) {
          carerMarker = L.circleMarker(pendingCarer, { radius: 8, color: '#ffffff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }).addTo(map);
        } else {
          carerMarker.setLatLng(pendingCarer);
        }
        if (!fitted) {
          map.fitBounds(L.latLngBounds([poolLocation, pendingCarer]), { padding: [40, 40], maxZoom: 17 });
          fitted = true;
        }
      };

      try {
        if (typeof L === 'undefined') throw new Error('Leaflet not loaded');
        map = L.map('map', { zoomControl: true, attributionControl: true }).setView(poolLocation, 16);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        L.circle(poolLocation, { radius: ${radius}, color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.15 }).addTo(map);
        L.circleMarker(poolLocation, { radius: 10, color: '#ffffff', weight: 2, fillColor: '#397d54', fillOpacity: 1 }).addTo(map);
        if (pendingCarer) window.updateCarer(pendingCarer[0], pendingCarer[1]);
      } catch (e) {
        document.getElementById('error').style.display = 'block';
      }
    </script>
  </body>
</html>`;
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { themeColor } = useTheme();
  const { showToast } = useToast();
  const [job, setJob] = useState<any>(null);
  const [visitStarted, setVisitStarted] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [showAccessFailure, setShowAccessFailure] = useState(false);
  const [clientStock, setClientStock] = useState<Array<{ id: string; name: string; unit: string; onHand: number; lowAt: number | null }>>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [readings, setReadings] = useState<Reading>({});
  const [showReadingsModal, setShowReadingsModal] = useState(false);
  const [readingsConfig, setReadingsConfig] = useState<Record<string, "required" | "optional" | "hidden"> | undefined>(undefined);
  const [allowGalleryPhotos, setAllowGalleryPhotos] = useState(true);

  // Org-configured reading fields + photo policy (Settings → Visits in the admin console)
  useEffect(() => {
    api.getVisitReadingSettings()
      .then((d) => {
        setReadingsConfig(d.fields);
        if (d.photos?.allowGallery !== undefined) setAllowGalleryPhotos(d.photos.allowGallery);
      })
      .catch(() => {}); // fall back to wizard defaults
  }, []);
  const [showChemicalsModal, setShowChemicalsModal] = useState(false);
  const [chemicals, setChemicals] = useState<Array<{ name: string; qty: string; unit: string }>>([]);
  const [photos, setPhotos] = useState<Array<{ uri: string; type: "before" | "after" | "issue"; uploaded?: boolean; key?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState("");
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [poolImageLoadError, setPoolImageLoadError] = useState(false);
  
  // Location tracking for geofencing
  const [poolLocation, setPoolLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [carerLocation, setCarerLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [isWithinGeofence, setIsWithinGeofence] = useState(false);
  const [locationWatching, setLocationWatching] = useState(false);
  // Why the carer's position isn't known (permission off, GPS failure) — shown
  // instead of an endless "Getting your location..." spinner.
  const [locationIssue, setLocationIssue] = useState<string | null>(null);
  const [locationRetry, setLocationRetry] = useState(0);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string | null>(null);
  // Same radius the server enforces on arrival (sent with the job; 100m default)
  const [GEOFENCE_RADIUS_METERS, setGeofenceRadius] = useState(100);
  const mapWebViewRef = useRef<WebView>(null);
  const carerLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  carerLocationRef.current = carerLocation;
  // What's already been saved for this visit — a retried "Complete Visit" must
  // not post readings/chemicals again (chemicals also draw down client stock).
  const savedStagesRef = useRef<{ visitId: string | null; before: boolean; after: boolean; chemicalsSaved: number }>({
    visitId: null, before: false, after: false, chemicalsSaved: 0,
  });

  const mapHtml = useMemo(
    () =>
      poolLocation
        ? buildMapHtml(poolLocation, carerLocationRef.current, GEOFENCE_RADIUS_METERS)
        : null,
    [poolLocation, GEOFENCE_RADIUS_METERS]
  );

  useEffect(() => {
    if (!carerLocation || !mapWebViewRef.current) return;
    mapWebViewRef.current.injectJavaScript(
      `window.updateCarer && window.updateCarer(${carerLocation.lat}, ${carerLocation.lng}); true;`
    );
  }, [carerLocation]);

  // New wizard mode for step-by-step checklist
  // Wizard mode is now the only mode - no classic view
  const [wizardChecklist, setWizardChecklist] = useState<WizardChecklistItem[]>([]);
  const [beforeReadings, setBeforeReadings] = useState<Reading>({});
  const [afterReadings, setAfterReadings] = useState<Reading>({});

  useEffect(() => {
    loadJob();
    // Fetch Google Maps API key from settings
    const fetchGoogleMapsKey = async () => {
      try {
        const settings: any = await api.getGoogleMapsSettings();
        console.log("Google Maps settings:", settings);
        if (settings?.settings?.apiKey && settings.settings.enabled) {
          console.log("Google Maps API key found, enabling map");
          setGoogleMapsApiKey(settings.settings.apiKey);
        } else {
          console.warn("Google Maps API key not configured or disabled:", settings);
        }
      } catch (error) {
        console.warn("Could not fetch Google Maps API key:", error);
      }
    };
    fetchGoogleMapsKey();
  }, [id]);

  // Calculate distance using Haversine formula
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Watch location when pool location is available and not yet arrived
  useEffect(() => {
    if (!poolLocation || arrived || !job || job.status === "completed") {
      return;
    }

    let locationSubscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const startLocationWatching = async () => {
      try {
        setLocationIssue(null);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.log("Location permission denied");
          if (!cancelled) setLocationIssue("Location access is off. Allow location for PoolCare to confirm your arrival.");
          return;
        }

        setLocationWatching(true);
        
        // First get a quick location fix
        try {
          const quickLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          const initialLocation = {
            lat: quickLocation.coords.latitude,
            lng: quickLocation.coords.longitude,
          };
          console.log("Initial location from device GPS:", initialLocation, {
            accuracy: quickLocation.coords.accuracy,
            altitude: quickLocation.coords.altitude,
            heading: quickLocation.coords.heading,
            speed: quickLocation.coords.speed,
          });
          setCarerLocation(initialLocation);
          
          // Calculate initial distance
          if (poolLocation) {
            const distance = calculateDistance(
              initialLocation.lat,
              initialLocation.lng,
              poolLocation.lat,
              poolLocation.lng
            );
            setDistanceMeters(distance);
            setIsWithinGeofence(distance <= GEOFENCE_RADIUS_METERS);
          }
        } catch (error) {
          console.error("Error getting initial location:", error);
        }
        
        // Then watch for updates
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High, // Use High accuracy for better GPS
            timeInterval: 2000, // Update every 2 seconds
            distanceInterval: 5, // Update every 5 meters
          },
          (location) => {
            const newCarerLocation = {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            };
            console.log("Location update from device GPS:", newCarerLocation, {
              accuracy: location.coords.accuracy,
              timestamp: new Date(location.timestamp),
            });
            setCarerLocation(newCarerLocation);

            // Calculate distance
            const distance = calculateDistance(
              newCarerLocation.lat,
              newCarerLocation.lng,
              poolLocation.lat,
              poolLocation.lng
            );
            setDistanceMeters(distance);
            setIsWithinGeofence(distance <= GEOFENCE_RADIUS_METERS);
          }
        );
        // The screen may have closed while the watch was starting
        if (cancelled) {
          try { subscription.remove(); } catch {}
        } else {
          locationSubscription = subscription;
        }
      } catch (error) {
        console.error("Error watching location:", error);
        setLocationWatching(false);
        if (!cancelled) setLocationIssue("Couldn't get your location. Check that location services are on.");
      }
    };

    startLocationWatching();

    return () => {
      cancelled = true;
      if (locationSubscription) {
        try {
          locationSubscription.remove();
        } catch {
          // expo-location's web emitter lacks removeSubscription; the watch is
          // already cleared by then, so only its stale listener is left behind.
        }
      }
      setLocationWatching(false);
    };
  }, [poolLocation, arrived, job?.status, locationRetry]);

  // Default wizard checklist items (used when no visit template is assigned)
  const getDefaultWizardItems = (): WizardChecklistItem[] => [
    // BEFORE PHOTOS - First thing to do
    { id: "photo_before", label: "Take before photos of the pool", required: true, category: "documentation", requiresPhoto: true },

    // Cleaning tasks - can optionally add photos
    { id: "clean_surface", label: "Skim pool surface - remove all floating debris", required: true, category: "cleaning", allowsPhoto: true },
    { id: "clean_floor", label: "Vacuum pool floor", required: true, category: "cleaning", allowsPhoto: true },
    { id: "clean_walls", label: "Brush pool walls and steps", required: true, category: "cleaning", allowsPhoto: true },
    { id: "clean_baskets", label: "Empty skimmer and pump baskets", required: true, category: "cleaning", allowsPhoto: true },
    { id: "clean_waterline", label: "Clean waterline/tile line", required: false, category: "cleaning", allowsNotApplicable: true, allowsPhoto: true },
    { id: "backwash", label: "Backwash filter if needed", required: false, category: "cleaning", allowsNotApplicable: true, allowsPhoto: true },

    // Equipment inspection - can optionally add photos of issues
    { id: "check_pump", label: "Check pump is running properly", required: true, category: "equipment", allowsPhoto: true },
    { id: "check_filter", label: "Inspect filter pressure gauge", required: true, category: "equipment", allowsPhoto: true },
    { id: "check_valves", label: "Verify all valves are correctly positioned", required: true, category: "equipment", allowsPhoto: true },
    { id: "check_heater", label: "Check heater (if applicable)", required: false, category: "equipment", allowsNotApplicable: true, allowsPhoto: true },
    { id: "check_salt", label: "Check salt cell (if saltwater pool)", required: false, category: "equipment", allowsNotApplicable: true, allowsPhoto: true },

    // Safety checks - can optionally add photos
    { id: "safety_ladders", label: "Inspect ladders and handrails", required: true, category: "safety", allowsNotApplicable: true, allowsPhoto: true },
    { id: "safety_lights", label: "Check pool lights", required: true, category: "safety", allowsNotApplicable: true, allowsPhoto: true },
    { id: "safety_deck", label: "Inspect pool deck for hazards", required: false, category: "safety", allowsNotApplicable: true, allowsPhoto: true },

    // AFTER PHOTOS - Last thing to do
    { id: "photo_after", label: "Take after photos of the pool", required: true, category: "documentation", requiresPhoto: true },
  ];

  // Build wizard checklist items from a visit template's checklist JSON,
  // falling back to the hardcoded defaults when no template is provided.
  const buildWizardItemsFromTemplate = (templateChecklist: any[] | null | undefined): WizardChecklistItem[] => {
    if (!templateChecklist || !Array.isArray(templateChecklist) || templateChecklist.length === 0) {
      return getDefaultWizardItems();
    }
    return templateChecklist.map((item: any, idx: number) => ({
      id: item.id || `step_${idx}`,
      label: item.task || item.label || item.name || `Step ${idx + 1}`,
      required: item.required !== false,
      category: item.category || "general",
      allowsPhoto: item.allowsPhoto ?? true,
      allowsNotApplicable: item.allowsNotApplicable ?? false,
      requiresPhoto: item.requiresPhoto ?? false,
      requiresNumericInput: item.requiresNumericInput,
      numericField: item.numericField,
      min: item.min,
      max: item.max,
    }));
  };

  // Initialize wizard checklist with detailed items
  // Before photos FIRST, then tasks, then after photos
  // All items can have optional photo attachment
  const initializeWizardChecklist = (templateChecklist?: any[] | null) => {
    const wizardItems = buildWizardItemsFromTemplate(templateChecklist);
    setWizardChecklist(wizardItems);
  };

  const loadJob = async () => {
    try {
      setLoading(true);
      
      const jobData: any = await api.getJob(id);

      // Extract visit template checklist from the service plan's visit template
      // The API resolves the job's own template first, then the plan's
      const visitTemplateChecklist =
        jobData?.visitTemplate?.checklist || jobData?.plan?.visitTemplate?.checklist || null;
      if (typeof jobData?.arrivalRadiusMeters === "number" && jobData.arrivalRadiusMeters > 0) {
        setGeofenceRadius(jobData.arrivalRadiusMeters);
      }
      const templateChecklistArray = visitTemplateChecklist
        ? (Array.isArray(visitTemplateChecklist)
            ? visitTemplateChecklist
            : typeof visitTemplateChecklist === "string"
            ? JSON.parse(visitTemplateChecklist)
            : null)
        : null;

      // Get pool and client info
      const pool = jobData?.pool || {};
      const client = pool?.client || {};
      const windowStart = new Date(jobData?.windowStart);
      const windowEnd = new Date(jobData?.windowEnd);
      
      // Check if visit already exists for this job
      const visitsResponse: any = await api.getVisits({ jobId: id });
      const existingVisit = Array.isArray(visitsResponse) && visitsResponse.length > 0 
        ? visitsResponse[0] 
        : (visitsResponse?.items && visitsResponse.items.length > 0 ? visitsResponse.items[0] : null);
      
      // If visit exists and is started, set visitStarted
      if (existingVisit) {
        setVisitId(existingVisit.id);
        setVisitStarted(true);
        if (existingVisit.job?.status === "on_site") {
          setArrived(true);
        }
        
        // Load existing readings if available
        if (existingVisit.readings && existingVisit.readings.length > 0) {
          const reading = existingVisit.readings[0];
          setReadings({
            ph: reading.ph,
            chlorineFree: reading.chlorineFree || reading.chlorine,
            chlorineTotal: reading.chlorineTotal || reading.chlorine,
            alkalinity: reading.alkalinity,
            calciumHardness: reading.calciumHardness,
            cyanuricAcid: reading.cyanuricAcid,
            tempC: reading.tempC || reading.temperature,
          });
        }
        
        // Load existing photos if available
        if (existingVisit.photos && existingVisit.photos.length > 0) {
          const loadedPhotos = existingVisit.photos.map((photo: any) => {
            let url = photo.url || photo.imageUrl || photo;
            url = fixUrlForMobile(url);
            return {
              uri: url,
              type: (photo.label || "before") as "before" | "after",
              uploaded: true,
              key: photo.id,
            };
          });
          setPhotos(loadedPhotos);
        }
        
        // Load saved checklist if visit has checklist data
        let checklistLoaded = false;
        if (existingVisit.checklist) {
          try {
            const savedChecklist = Array.isArray(existingVisit.checklist) 
              ? existingVisit.checklist 
              : typeof existingVisit.checklist === 'string' 
              ? JSON.parse(existingVisit.checklist)
              : [];
            if (savedChecklist.length > 0) {
              setChecklist(savedChecklist.map((item: any) => ({
                id: item.id || String(item.task),
                task: item.task || item.label || item.name || "Task",
                completed: item.completed === true,
                required: item.required === true,
              })));
              checklistLoaded = true;
              
              // Also load wizard checklist from saved data
              // Use template-based items if available, otherwise fall back to defaults
              const baseWizardItems: WizardChecklistItem[] = buildWizardItemsFromTemplate(templateChecklistArray);
              
              // Update wizard items with saved completion status
              const updatedWizardItems = baseWizardItems.map((wizardItem) => {
                const savedItem = savedChecklist.find((s: any) => 
                  s.id === wizardItem.id || 
                  s.task === wizardItem.label || 
                  s.label === wizardItem.label
                );
                if (savedItem) {
                  return {
                    ...wizardItem,
                    completed: savedItem.completed || false,
                    notApplicable: savedItem.notApplicable || false,
                    comment: savedItem.comment || "",
                    value: savedItem.value || "",
                  };
                }
                return wizardItem;
              });
              setWizardChecklist(updatedWizardItems);
            }
          } catch (error) {
            console.error("Error loading saved checklist:", error);
          }
        }
        
        // Load before/after readings if available
        if (existingVisit.readings && existingVisit.readings.length > 0) {
          const readings = existingVisit.readings;
          // Try to find before and after readings
          const beforeReading = readings.find((r: any) => r.readingType === "before") || readings[0];
          const afterReading = readings.find((r: any) => r.readingType === "after") || (readings.length > 1 ? readings[1] : null);
          
          if (beforeReading) {
            setBeforeReadings({
              ph: beforeReading.ph,
              chlorineFree: beforeReading.chlorineFree || beforeReading.chlorine,
              chlorineTotal: beforeReading.chlorineTotal || beforeReading.chlorine,
              alkalinity: beforeReading.alkalinity,
              calciumHardness: beforeReading.calciumHardness,
              cyanuricAcid: beforeReading.cyanuricAcid,
              tempC: beforeReading.tempC || beforeReading.temperature,
            });
          }
          
          if (afterReading) {
            setAfterReadings({
              ph: afterReading.ph,
              chlorineFree: afterReading.chlorineFree || afterReading.chlorine,
              chlorineTotal: afterReading.chlorineTotal || afterReading.chlorine,
              alkalinity: afterReading.alkalinity,
              calciumHardness: afterReading.calciumHardness,
              cyanuricAcid: afterReading.cyanuricAcid,
              tempC: afterReading.tempC || afterReading.temperature,
            });
          }
        }
        
        // Only set default checklist if we didn't load a saved one
        if (!checklistLoaded) {
          if (templateChecklistArray && templateChecklistArray.length > 0) {
            const templateBasedChecklist: ChecklistItem[] = templateChecklistArray.map((item: any, idx: number) => ({
              id: item.id || `step_${idx}`,
              task: item.task || item.label || item.name || `Step ${idx + 1}`,
              completed: false,
              required: item.required !== false,
            }));
            setChecklist(templateBasedChecklist);
          } else {
            const defaultChecklist: ChecklistItem[] = [
              { id: "1", task: "Skim pool surface", completed: false, required: true },
              { id: "2", task: "Vacuum pool floor", completed: false, required: true },
              { id: "3", task: "Brush pool walls and steps", completed: false, required: true },
              { id: "4", task: "Empty skimmer and pump baskets", completed: false, required: true },
              { id: "5", task: "Test water chemistry (pH, Chlorine, Alkalinity)", completed: false, required: true },
              { id: "6", task: "Inspect pool equipment (pump, filter, heater)", completed: false, required: true },
              { id: "7", task: "Clean or backwash filter if needed", completed: false, required: false },
              { id: "8", task: "Check salt cell (if saltwater pool)", completed: false, required: false },
              { id: "9", task: "Inspect safety equipment (ladders, railings, lights)", completed: false, required: true },
              { id: "10", task: "Add chemicals as needed", completed: false, required: true },
              { id: "11", task: "Take before photos", completed: false, required: true },
              { id: "12", task: "Take after photos", completed: false, required: true },
            ];
            setChecklist(defaultChecklist);
          }
        }
        
        // Always initialize wizard checklist (even if visit exists) so user can continue
        // Check if wizard checklist needs initialization
        initializeWizardChecklist(templateChecklistArray);
      } else {
        // No existing visit - build checklist from template if available, otherwise use defaults
        if (templateChecklistArray && templateChecklistArray.length > 0) {
          const templateBasedChecklist: ChecklistItem[] = templateChecklistArray.map((item: any, idx: number) => ({
            id: item.id || `step_${idx}`,
            task: item.task || item.label || item.name || `Step ${idx + 1}`,
            completed: false,
            required: item.required !== false,
          }));
          setChecklist(templateBasedChecklist);
        } else {
          const defaultChecklist: ChecklistItem[] = [
            { id: "1", task: "Skim pool surface", completed: false, required: true },
            { id: "2", task: "Vacuum pool floor", completed: false, required: true },
            { id: "3", task: "Brush pool walls and steps", completed: false, required: true },
            { id: "4", task: "Empty skimmer and pump baskets", completed: false, required: true },
            { id: "5", task: "Test water chemistry (pH, Chlorine, Alkalinity)", completed: false, required: true },
            { id: "6", task: "Inspect pool equipment (pump, filter, heater)", completed: false, required: true },
            { id: "7", task: "Clean or backwash filter if needed", completed: false, required: false },
            { id: "8", task: "Check salt cell (if saltwater pool)", completed: false, required: false },
            { id: "9", task: "Inspect safety equipment (ladders, railings, lights)", completed: false, required: true },
            { id: "10", task: "Add chemicals as needed", completed: false, required: true },
            { id: "11", task: "Take before photos", completed: false, required: true },
            { id: "12", task: "Take after photos", completed: false, required: true },
          ];
          setChecklist(defaultChecklist);
        }

        // Initialize wizard checklist with template items or enhanced defaults
        initializeWizardChecklist(templateChecklistArray);
      }
      
      const jobStatus = jobData?.status || "scheduled";
      
      // Check if job is scheduled for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const jobDate = new Date(jobData?.windowStart);
      jobDate.setHours(0, 0, 0, 0);
      const isScheduledForToday = jobDate.getTime() === today.getTime();
      
      // Get pool image if available (resolve relative URLs so images set in the system display)
      let poolImageUrl: string | null = null;
      const rawImageUrl = pool?.imageUrls && pool.imageUrls.length > 0 ? pool.imageUrls[0] : null;
      if (rawImageUrl) {
        const origin = getApiUrl().replace(/\/api\/?$/, "");
        const fullUrl = rawImageUrl.startsWith("http") ? rawImageUrl : origin + (rawImageUrl.startsWith("/") ? rawImageUrl : "/" + rawImageUrl);
        poolImageUrl = fixUrlForMobile(fullUrl);
      }
      
      setPoolImageLoadError(false);
      setJob({
        id: jobData?.id || id,
        poolName: pool?.name || "Unknown Pool",
        address: pool?.address || "",
        windowStart: fmtTime(windowStart),
        windowEnd: fmtTime(windowEnd),
        status: jobStatus,
        scheduledDate: jobDate,
        isScheduledForToday,
        poolImageUrl,
        clientName: client?.name || null,
        clientPhone: client?.phone || null,
        siteSafety: pool?.siteSafety || null,
        notes: jobData?.notes || null,
      });
      if (pool?.id) {
        api.getClientChemicalStock(pool.id).then(setClientStock).catch(() => setClientStock([]));
      }
      
      // If job is already en_route, on_site, or completed, mark as started
      if (jobStatus === "en_route" || jobStatus === "on_site" || jobStatus === "completed") {
        setVisitStarted(true);
      }
      
      // If job is on_site or completed, also mark as arrived
      // This ensures checklist and progress are visible for completed jobs
      if (jobStatus === "on_site" || jobStatus === "completed") {
        setArrived(true);
      }
      
      // Store pool location for geofencing (after job is set)
      if (pool?.lat && pool?.lng) {
        const poolLat = typeof pool.lat === 'string' ? parseFloat(pool.lat) : pool.lat;
        const poolLng = typeof pool.lng === 'string' ? parseFloat(pool.lng) : pool.lng;
        if (!isNaN(poolLat) && !isNaN(poolLng) && poolLat !== 0 && poolLng !== 0) {
          setPoolLocation({ lat: poolLat, lng: poolLng });
          console.log("Pool location set:", { lat: poolLat, lng: poolLng, address: pool.address });
        } else {
          console.warn("Invalid pool coordinates:", { lat: pool.lat, lng: pool.lng });
        }
      } else {
        console.warn("Pool location not available:", { hasLat: !!pool?.lat, hasLng: !!pool?.lng });
      }
    } catch (error) {
      console.error("Error loading job:", error);
      Alert.alert("Error", "Failed to load job details. Please try again.");
      setJob(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle "I'm on my way" swipe - only mark as en_route
  const handleOnMyWay = async () => {
    try {
      if (job.status !== "scheduled") {
        throw new Error(`This job is ${statusLabel(job.status)} and can't be started.`);
      }
      if (!job.isScheduledForToday) {
        const scheduledDate = job.scheduledDate?.toLocaleDateString() || "another day";
        throw new Error(`This job is scheduled for ${scheduledDate}. You can only start jobs on their scheduled date.`);
      }
      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Location is required. Please enable location services.");
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const location = {
        lat: currentLocation.coords.latitude,
        lng: currentLocation.coords.longitude,
        accuracyM: currentLocation.coords.accuracy || undefined,
      };

      setTransitioning(true);
      setTransitionMessage("Starting your journey...");

      await api.startJob(id, { location });
      setVisitStarted(true);
      setJob({ ...job, status: "en_route" });

      // Brief delay for transition effect
      await new Promise(resolve => setTimeout(resolve, 1000));
      setTransitioning(false);
    } catch (error: any) {
      setTransitioning(false);
      console.error("Error starting journey:", error);
      showToast(error?.message || "Couldn't start the journey. Please try again.", "error");
      throw error;
    }
  };

  // Handle "I am here" swipe - start job (if needed) + mark as arrived in one go
  const handleIAmHere = async () => {
    try {
      // A failed/cancelled job must never drop into the checklist
      if (!ACTIVE_STATUSES.includes(job.status)) {
        Alert.alert("Job not active", `This job is ${statusLabel(job.status)} and can't be started.`);
        return;
      }
      // Check if job is scheduled for today
      if (!job.isScheduledForToday) {
        const scheduledDate = job.scheduledDate?.toLocaleDateString() || "another day";
        Alert.alert(
          "Not Scheduled for Today",
          `This job is scheduled for ${scheduledDate}. You can only start jobs on their scheduled date.`,
          [{ text: "OK" }]
        );
        return;
      }

      // Get current location
        const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Location is required. Please enable location services.");
      }

          const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
          });
      const location = {
            lat: currentLocation.coords.latitude,
            lng: currentLocation.coords.longitude,
            accuracyM: currentLocation.coords.accuracy || undefined,
          };

      setTransitioning(true);
      setTransitionMessage("Confirming your arrival...");

      // If job is scheduled, start it first (this will set status to en_route)
      if (job.status === "scheduled") {
        try {
          await api.startJob(id, { location });
          // Update local state immediately
          setJob({ ...job, status: "en_route" });
        } catch (e: any) {
          // Ignore if already started or other minor errors
          // Only an already-started job is fine; cancelled/failed must surface
          if (!e.message?.includes("Current status: en_route") && !e.message?.includes("already")) {
            throw e;
          }
        }
      }

      // Now mark as arrived (works for both scheduled->en_route->on_site and en_route->on_site)
      if (job.status === "scheduled" || job.status === "en_route") {
        try {
          await api.arriveAtJob(id, { location });
        } catch (e: any) {
          // If already on_site, that's fine - continue
          if (!e.message?.includes("already on_site")) {
            throw e;
          }
        }
      }

      // Fetch visit ID
      const visitsResponse: any = await api.getVisits({ jobId: id });
      const visits = Array.isArray(visitsResponse) ? visitsResponse : (visitsResponse?.data || visitsResponse?.visits || []);
      if (visits && visits.length > 0) {
        setVisitId(visits[0].id);
      }

      // Update local state
      setJob({ ...job, status: "on_site" });
      setVisitStarted(true);
      setArrived(true);

      // Brief delay for transition effect
      await new Promise(resolve => setTimeout(resolve, 1500));
      setTransitioning(false);
    } catch (error: any) {
      setTransitioning(false);
      console.error("Error confirming arrival:", error);
      showToast(error?.message || "Couldn't confirm your arrival. Please try again.", "error");
      throw error;
    }
  };

  // Legacy handler for backwards compatibility
  const handleStartJourney = async () => {
    try {
      // Check if job is scheduled for today
      if (!job.isScheduledForToday) {
        const scheduledDate = job.scheduledDate?.toLocaleDateString() || "another day";
        Alert.alert(
          "Not Scheduled for Today",
          `This job is scheduled for ${scheduledDate}. You can only start jobs on their scheduled date.`,
          [{ text: "OK" }]
        );
        return;
      }

      if (isWithinGeofence) {
        await handleIAmHere();
      } else {
        await handleOnMyWay();
      }
    } catch (error: any) {
      console.error("Error starting job:", error);
      Alert.alert("Error", error.message || "Failed to start job. Please try again.");
    }
  };

  const handleArrive = async () => {
    try {
      // Request location permissions and get current location for GPS-based arrival
      let location: { lat: number; lng: number; accuracyM?: number } | undefined;
      
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          location = {
            lat: currentLocation.coords.latitude,
            lng: currentLocation.coords.longitude,
            accuracyM: currentLocation.coords.accuracy || undefined,
          };
          console.log("Location captured for arrival:", location);
        } else {
          Alert.alert(
            "Location Required",
            "Location permission is required to mark arrival. Please enable location services in your device settings.",
            [{ text: "OK" }]
          );
          return;
        }
      } catch (locationError) {
        console.warn("Failed to get location for arrival:", locationError);
        Alert.alert(
          "Location Error",
          "Unable to get your current location. Please ensure location services are enabled and try again.",
          [{ text: "OK" }]
        );
        return;
      }

      if (!location) {
        Alert.alert(
          "Location Required",
          "Location is required to mark arrival. Please enable location services and try again.",
          [{ text: "OK" }]
        );
        return;
      }

      // Arrive at job - this creates the visit entry automatically
      await api.arriveAtJob(id, { location });
      
      // Fetch the visit to get its ID (visit is created in the arrive endpoint)
      const visitsResponse: any = await api.getVisits({ jobId: id });
      const visits = Array.isArray(visitsResponse) ? visitsResponse : (visitsResponse?.data || visitsResponse?.visits || []);
      
      if (visits && visits.length > 0) {
        setVisitId(visits[0].id);
      }
      
      setArrived(true);
      setJob({ ...job, status: "on_site" });
      Alert.alert("Arrived", "You've arrived at the location. Start your service workflow.");
    } catch (error: any) {
      console.error("Error arriving at job:", error);
      
      // Handle proximity errors with helpful message
      if (error.message?.includes("within") && error.message?.includes("away")) {
        Alert.alert(
          "Too Far from Location",
          error.message + "\n\nPlease move closer to the pool location and try again.",
          [{ text: "OK" }]
        );
      } else if (error.message?.includes("Location is required")) {
        Alert.alert(
          "Location Required",
          error.message + "\n\nPlease enable location services in your device settings.",
          [{ text: "OK" }]
        );
      } else {
      Alert.alert("Error", error.message || "Failed to record arrival. Please try again.");
      }
    }
  };

  const toggleChecklistItem = (itemId: string) => {
    // Prevent editing if visit is completed
    if (job?.status === "completed") {
      Alert.alert("Cannot Edit", "This visit has been completed and cannot be modified.");
      return;
    }
    setChecklist(checklist.map(item => 
      item.id === itemId ? { ...item, completed: !item.completed } : item
    ));
  };

  const handleSaveReadings = async () => {
    // Prevent editing if visit is completed
    if (job?.status === "completed") {
      Alert.alert("Cannot Edit", "This visit has been completed and cannot be modified.");
      return;
    }
    if (!visitId) {
      Alert.alert("Error", "Please start the visit first");
      return;
    }
    
    // Build payload with only defined, non-empty values
    const payload: any = {};
    
    if (readings.ph !== undefined && readings.ph !== null && !isNaN(readings.ph)) {
      payload.ph = readings.ph;
    }
    if (readings.chlorineFree !== undefined && readings.chlorineFree !== null && !isNaN(readings.chlorineFree)) {
      payload.chlorineFree = readings.chlorineFree;
    }
    if (readings.chlorineTotal !== undefined && readings.chlorineTotal !== null && !isNaN(readings.chlorineTotal)) {
      payload.chlorineTotal = readings.chlorineTotal;
    }
    if (readings.alkalinity !== undefined && readings.alkalinity !== null && !isNaN(readings.alkalinity)) {
      payload.alkalinity = readings.alkalinity;
    }
    if (readings.calciumHardness !== undefined && readings.calciumHardness !== null && !isNaN(readings.calciumHardness)) {
      payload.calciumHardness = readings.calciumHardness;
    }
    if (readings.cyanuricAcid !== undefined && readings.cyanuricAcid !== null && !isNaN(readings.cyanuricAcid)) {
      payload.cyanuricAcid = readings.cyanuricAcid;
    }
    if (readings.tempC !== undefined && readings.tempC !== null && !isNaN(readings.tempC)) {
      payload.tempC = readings.tempC;
    }
    if (readings.tds !== undefined && readings.tds !== null && !isNaN(readings.tds)) {
      payload.tds = readings.tds;
    }
    if (readings.salinity !== undefined && readings.salinity !== null && !isNaN(readings.salinity)) {
      payload.salinity = readings.salinity;
    }
    
    // Check if at least one reading is provided
    if (Object.keys(payload).length === 0) {
      Alert.alert("Error", "Please enter at least one reading value");
      return;
    }
    
    try {
      await api.addReading(visitId, payload);
      Alert.alert("Readings Saved", "Water chemistry readings have been recorded");
      setShowReadingsModal(false);
    } catch (error: any) {
      console.error("Error saving readings:", error);
      // Format validation errors better
      let errorMessage = error.message || "Failed to save readings. Please try again.";
      if (errorMessage.includes("must not be less than") || errorMessage.includes("must not be greater than")) {
        errorMessage = `Validation Error: ${errorMessage}\n\nPlease check that your readings are within the valid ranges.`;
      }
      Alert.alert("Error", errorMessage);
    }
  };

  const handleAddChemical = () => {
    setChemicals([...chemicals, { name: "", qty: "", unit: "ml" }]);
  };

  const handleSaveChemicals = async () => {
    if (!visitId) {
      Alert.alert("Error", "Please start the visit first");
      return;
    }
    
    try {
      // Save each chemical - API expects: chemical (string), qty (number), unit (optional string)
      for (const chemical of chemicals) {
        if (chemical.name && chemical.qty) {
          await api.addChemical(visitId, {
            chemical: chemical.name, // API expects 'chemical' not 'name'
            qty: parseFloat(chemical.qty) || 0, // API expects 'qty' not 'quantity'
            unit: chemical.unit || "ml",
          });
        }
      }
      Alert.alert("Chemicals Saved", "Chemical usage has been recorded");
      setShowChemicalsModal(false);
    } catch (error: any) {
      console.error("Error saving chemicals:", error);
      Alert.alert("Error", error.message || "Failed to save chemicals. Please try again.");
    }
  };

  const handleTakePhoto = async (type: "before" | "after") => {
    if (!visitId) {
      Alert.alert("Error", "Please start the visit first");
      return;
    }

    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "We need access to your photos to upload images.");
        return;
      }

      // Show action sheet for camera or gallery
      Alert.alert(
        `Take ${type === "before" ? "Before" : "After"} Photo`,
        "Choose an option",
        [
          {
            text: "Camera",
            onPress: async () => {
              try {
                const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
                if (cameraStatus.status !== "granted") {
                  Alert.alert("Permission Required", "We need camera access to take photos.");
                  return;
                }
                const result = await ImagePicker.launchCameraAsync({
                  allowsEditing: true,
                  aspect: [4, 3],
                  quality: 0.5, // Reduced quality to compress more
                });

                if (!result.canceled && result.assets[0]) {
                  await uploadPhoto(result.assets[0].uri, type);
                }
              } catch (cameraError: any) {
                // Handle camera not available (e.g., on simulators)
                if (cameraError.message?.includes("Camera not available")) {
                  Alert.alert(
                    "Camera Not Available",
                    "Camera is not available on this device. Would you like to choose a photo from the gallery instead?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Open Gallery",
                        onPress: async () => {
                          const result = await ImagePicker.launchImageLibraryAsync({
                            allowsEditing: true,
                            aspect: [4, 3],
                            quality: 0.5,
                          });
                          if (!result.canceled && result.assets[0]) {
                            await uploadPhoto(result.assets[0].uri, type);
                          }
                        },
                      },
                    ]
                  );
                } else {
                  Alert.alert("Error", cameraError.message || "Failed to open camera.");
                }
              }
            },
          },
          {
            text: "Gallery",
            onPress: async () => {
              const result = await ImagePicker.launchImageLibraryAsync({
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.5, // Reduced quality to compress more
              });

              if (!result.canceled && result.assets[0]) {
                await uploadPhoto(result.assets[0].uri, type);
              }
            },
          },
          { text: "Cancel", style: "cancel" },
        ]
      );
    } catch (error: any) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", error.message || "Failed to take photo. Please try again.");
    }
  };

  const uploadPhoto = async (imageUri: string, type: "before" | "after") => {
    if (!visitId) {
      Alert.alert("Error", "Please start the visit first to take photos.");
      return;
    }

    try {
      setUploadingPhoto(true);

      // Get file info
      const fileName = imageUri.split("/").pop() || `photo_${Date.now()}.jpg`;
      const fileExtension = fileName.split(".").pop() || "jpg";
      const contentType = `image/${fileExtension === "jpg" ? "jpeg" : fileExtension}`;

      // Read image file and convert to base64
      // Read file as base64 directly (removed getInfoAsync check - file will error if not found)
      const base64Data = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64',
      });

      // Check size (base64 is ~33% larger than binary)
      const base64Size = (base64Data.length * 3) / 4;
      const maxSize = 2 * 1024 * 1024; // 2MB limit
      
      if (base64Size > maxSize) {
        Alert.alert(
          "Image Too Large",
          "The image is too large to upload. Please use a smaller image or take a new photo with lower quality.",
          [{ text: "OK" }]
        );
        return;
      }
      
      const base64 = base64Data;

      // Upload directly through API (avoids presigned URL hostname signature issues)
      const photo: any = await api.uploadPhotoDirect(visitId, base64, contentType, type, fileName);

      // Add photo to local state
      // For now, use the local image URI for display
      // In production, we'd fetch a signed URL from the API
      // The photo is stored in MinIO and can be retrieved via the API later
      setPhotos([
        ...photos,
        {
          uri: imageUri, // Use local image for immediate display
          type,
          uploaded: true,
          key: photo.id,
        },
      ]);

      Alert.alert("Success", `${type === "before" ? "Before" : "After"} photo uploaded successfully`);
    } catch (error: any) {
      console.error("Error uploading photo:", error);
      
      // Provide more helpful error messages
      let errorMessage = "Failed to upload photo. Please try again.";
      if (error.message?.includes("ECONNREFUSED") || error.message?.includes("connection")) {
        errorMessage = "Cannot connect to storage service. Please check your connection or contact support.";
      } else if (error.message?.includes("entity too large") || error.message?.includes("too large")) {
        errorMessage = "The image is too large. Please take a new photo with lower quality or choose a smaller image.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert("Upload Failed", errorMessage);
      
      // Add photo to state as not uploaded so user can retry
      setPhotos([
        ...photos,
        {
          uri: imageUri,
          type,
          uploaded: false,
        },
      ]);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!visitId) {
      Alert.alert("Error", "No visit found");
      return;
    }

    try {
      setGeneratingReport(true);
      
      // Get report from API (returns base64 string)
      const base64 = await api.getVisitReport(visitId);

      // Save to file system
      const fileUri = `${FileSystem.documentDirectory}visit-report-${visitId}.pdf`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: 'base64',
      });

      // Share/open the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Success", "Report saved to device");
      }
    } catch (error: any) {
      console.error("Error generating report:", error);
      Alert.alert("Error", error.message || "Failed to generate report. Please try again.");
    } finally {
      setGeneratingReport(false);
    }
  };

  const canComplete = () => {
    const requiredCompleted = checklist.filter(item => item.required).every(item => item.completed);
    const hasReadings = readings.ph !== undefined;
    const hasBeforePhoto = photos.some(p => p.type === "before" && p.uploaded);
    const hasAfterPhoto = photos.some(p => p.type === "after" && p.uploaded);
    return requiredCompleted && hasReadings && hasBeforePhoto && hasAfterPhoto;
  };

  // Handle wizard checklist completion
  const handleWizardComplete = async (
    completedItems: WizardChecklistItem[],
    beforeReadingsData: Reading,
    afterReadingsData: Reading,
    chemicalsData: Array<{ name: string; qty: string; unit: string }>
  ) => {
    if (!visitId) {
      Alert.alert("Error", "Please start the visit first");
      return;
    }
    
    try {
      // Save before/after readings (without readingType - API doesn't accept it).
      // Any entered value counts — orgs can make pH optional or hide it.
      const hasValues = (r: Reading) =>
        Object.values(r).some((v) => typeof v === "number" && !isNaN(v));
      if (savedStagesRef.current.visitId !== visitId) {
        savedStagesRef.current = { visitId, before: false, after: false, chemicalsSaved: 0 };
      }
      const stages = savedStagesRef.current;
      if (!stages.before) {
        if (hasValues(beforeReadingsData)) await api.saveReadings(visitId, beforeReadingsData);
        stages.before = true;
      }
      if (!stages.after) {
        if (hasValues(afterReadingsData)) await api.saveReadings(visitId, afterReadingsData);
        stages.after = true;
      }

      // Save chemicals — a retry resumes after the last one that went through
      const chemicalsToSave = (chemicalsData || []).filter((c) => c.name && c.qty);
      for (let i = stages.chemicalsSaved; i < chemicalsToSave.length; i++) {
        const chemical = chemicalsToSave[i];
        await api.addChemical(visitId, {
          chemical: chemical.name,
          qty: parseFloat(chemical.qty) || 0,
          unit: chemical.unit || "ml",
        });
        stages.chemicalsSaved = i + 1;
      }
      
      // Convert wizard items to checklist format for saving
      const checklistForSave = completedItems.map(item => ({
        id: item.id,
        task: item.label,
        completed: item.completed || false,
        required: item.required,
        notApplicable: item.notApplicable,
        comment: item.comment,
        value: item.value,
      }));
      
      // Complete the visit
      await api.completeVisit(visitId, {
        checklist: checklistForSave,
      });
      clearWizardProgress(visitId);
      
      // Update local state
      setAfterReadings(afterReadingsData);
      setBeforeReadings(beforeReadingsData);
      setJob({ ...job, status: "completed" });
      
      // Show report
      setLoadingReport(true);
      try {
        const report = await api.getVisitReport(visitId, "json");
        setReportData(report);
        setShowReportPreview(true);
      } catch (reportError) {
        console.error("Error loading report:", reportError);
      }
      setLoadingReport(false);
      
      Alert.alert(
        "Visit Completed",
        "Great job! The visit has been completed successfully.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error("Error completing wizard:", error);
      Alert.alert("Error", error.message || "Failed to complete visit. Please try again.");
    }
  };

  // Handle photo upload from wizard - convert to base64 and use uploadPhotoDirect
  const handleWizardPhotoUpload = async (uri: string, itemId: string) => {
    if (!visitId) return;
    
    try {
      // Determine photo type based on item ID
      const photoType = itemId.includes("before") ? "before" : 
                        itemId.includes("after") ? "after" : "issue";
      
      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const imageData = `data:image/jpeg;base64,${base64}`;
      const fileName = `${itemId}_${Date.now()}.jpg`;
      
      await api.uploadPhotoDirect(visitId, imageData, "image/jpeg", photoType, fileName);
      
      // Update photos state
      setPhotos(prev => [...prev, { uri, type: photoType, uploaded: true }]);
    } catch (error) {
      console.error("Error uploading wizard photo:", error);
      throw error;
    }
  };

  const handleComplete = async () => {
    if (!canComplete()) {
      Alert.alert(
        "Cannot Complete",
        "Please complete all required tasks:\n- All required checklist items\n- Water chemistry readings\n- Before and after photos"
      );
      return;
    }
    
    if (!visitId) {
      Alert.alert("Error", "Please start the visit first");
      return;
    }
    
    try {
      // Complete the visit via API (this also completes the job automatically)
      // Include checklist state so it's saved
      await api.completeVisit(visitId, {
        checklist: checklist,
      });
      
      // Refresh job data to get updated status
      await loadJob();
      
      // Auto-load and show report preview
      try {
        setLoadingReport(true);
        const report = await api.getVisitReportData(visitId);
        setReportData(report);
        setShowReportPreview(true);
      } catch (error: any) {
        console.error("Error loading report:", error);
        // Still show success even if report fails to load
      Alert.alert(
        "Visit Complete", 
          "Your visit has been completed successfully. The report has been sent to the client.",
        [
          {
              text: "View Report",
            onPress: async () => {
              try {
                await handleGenerateReport();
                } catch (err: any) {
                  Alert.alert("Error", err.message || "Failed to generate report");
              }
            },
          },
          {
            text: "Done",
            onPress: () => router.back(),
            style: "cancel",
          },
        ]
      );
      } finally {
        setLoadingReport(false);
      }
    } catch (error: any) {
      console.error("Error completing visit:", error);
      
      // Provide helpful error messages
      if (error.message?.includes("must be on_site") || error.message?.includes("status is")) {
        Alert.alert(
          "Cannot Complete",
          "Please make sure you've marked 'Arrived' before completing the visit. " +
          "If you've already arrived, try refreshing the page.",
          [
            { text: "OK" },
            {
              text: "Mark Arrived First",
              onPress: () => {
                if (!arrived) {
                  handleArrive();
                }
              },
            },
          ]
        );
      } else {
      Alert.alert("Error", error.message || "Failed to complete visit. Please try again.");
      }
    }
  };

  const openInMaps = () => {
    if (!poolLocation) return;
    const url = Platform.select({
      ios: `maps://maps.apple.com/?daddr=${poolLocation.lat},${poolLocation.lng}`,
      android: `geo:${poolLocation.lat},${poolLocation.lng}?q=${poolLocation.lat},${poolLocation.lng}`,
    });
    if (url) Linking.openURL(url);
  };

  const distanceText =
    distanceMeters == null
      ? null
      : distanceMeters < 1000
      ? `${Math.round(distanceMeters)} m away`
      : `${(distanceMeters / 1000).toFixed(1)} km away`;

  const openReport = async () => {
    if (!visitId) return;
    setLoadingReport(true);
    try {
      const report = await api.getVisitReport(visitId, "json");
      setReportData(report);
      setShowReportPreview(true);
    } catch (error) {
      console.error("Error loading report:", error);
      showToast("Couldn't load the report", "error");
    }
    setLoadingReport(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={themeColor} />
        <Text style={styles.centerText}>Loading job…</Text>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={[styles.container, styles.center, { paddingHorizontal: 24 }]}>
        <EmptyState icon="alert-circle-outline" title="Couldn't load this job" body="Check your connection and try again." action="Try again" onAction={loadJob} />
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={{ marginTop: 16, alignSelf: "stretch" }} />
      </View>
    );
  }

  // Transition between steps (starting journey / arriving)
  if (transitioning) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: themeColor }]}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.transitionTitle}>{transitionMessage}</Text>
        <Text style={styles.transitionSub}>{job?.poolName}</Text>
      </View>
    );
  }

  const reportModal = (
    <Modal visible={showReportPreview} animationType="slide" onRequestClose={() => setShowReportPreview(false)}>
      <View style={styles.container}>
        <ScreenHeader title="Service report" eyebrow={job?.poolName} backIcon="close" backLabel="Close" onBack={() => setShowReportPreview(false)} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }}>
          {reportData && (
            <>
              <Card padded>
                <Eyebrow>Pool</Eyebrow>
                <Text style={styles.reportStrong}>{reportData.pool?.name}</Text>
                {reportData.pool?.address ? <Text style={styles.reportMuted}>{reportData.pool.address}</Text> : null}
              </Card>
              <Card padded>
                <Eyebrow>Service</Eyebrow>
                <Text style={styles.reportText}>Duration: {reportData.serviceDuration || "—"}</Text>
                <Text style={styles.reportText}>Carer: {reportData.carer?.name || "—"}</Text>
              </Card>
              {reportData.readings ? (
                <Card padded>
                  <Eyebrow>Water</Eyebrow>
                  {reportData.readings.ph != null && <Text style={styles.reportText}>pH {reportData.readings.ph}</Text>}
                  {reportData.readings.chlorineFree != null && <Text style={styles.reportText}>Free chlorine {reportData.readings.chlorineFree} ppm</Text>}
                  {reportData.readings.alkalinity != null && <Text style={styles.reportText}>Alkalinity {reportData.readings.alkalinity} ppm</Text>}
                </Card>
              ) : null}
              {reportData.checklist?.length ? (
                <Card padded>
                  <Eyebrow>Tasks done</Eyebrow>
                  {reportData.checklist
                    .filter((item: any) => item.completed)
                    .map((item: any, idx: number) => (
                      <View key={idx} style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <Ionicons name="checkmark-circle" size={18} color={themeColor} />
                        <Text style={[styles.reportText, { flex: 1, marginTop: 0 }]}>{item.task || item.label}</Text>
                      </View>
                    ))}
                </Card>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  // Completed
  if (job?.status === "completed") {
    return (
      <View style={styles.container}>
        <View style={[styles.doneHero, { paddingTop: insets.top + 56 }]}>
          <View style={[styles.doneBadge, { backgroundColor: themeColor + "1F" }]}>
            <Ionicons name="checkmark" size={44} color={themeColor} />
          </View>
          <Text style={styles.doneTitle}>Visit complete</Text>
          <Text style={styles.doneSub}>{job?.poolName}</Text>
          <Text style={styles.doneBody}>The client gets the report and can rate the visit. Ratings show on your Performance tab.</Text>
        </View>
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {visitId ? (
            <Button title="View report" variant="secondary" icon="document-text-outline" onPress={openReport} loading={loadingReport} />
          ) : null}
          <Button title="Back to today" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        </View>
        {reportModal}
      </View>
    );
  }

  // On site → step-by-step visit
  if (arrived && job?.status === "on_site" && wizardChecklist.length > 0) {
    return (
      <View style={styles.container}>
        <ScreenHeader
          eyebrow="On site"
          title={job?.poolName}
          onBack={() => router.back()}
        />
        <ChecklistWizard
          key={visitId || "no-visit"}
          persistKey={visitId ? wizardProgressKey(visitId) : undefined}
          items={wizardChecklist}
          onComplete={handleWizardComplete}
          onPhotoUpload={handleWizardPhotoUpload}
          onCancel={() => router.back()}
          disabled={job?.status === "completed"}
          initialBeforeReadings={beforeReadings}
          initialAfterReadings={afterReadings}
          readingsConfig={readingsConfig}
          allowGalleryPhotos={allowGalleryPhotos}
        />
      </View>
    );
  }

  const STEPS = [
    { key: "scheduled", label: "Scheduled" },
    { key: "en_route", label: "On the way" },
    { key: "on_site", label: "On site" },
    { key: "completed", label: "Done" },
  ];
  const stepIdx = Math.max(0, STEPS.findIndex((s) => s.key === job?.status));
  const isOpen = ACTIVE_STATUSES.includes(job.status);
  const showMapHero = !!poolLocation && !arrived && isOpen;
  const canAct = !arrived && isOpen && job.isScheduledForToday;
  const hasSafety =
    !!job.siteSafety &&
    ((job.siteSafety.hazards || []).length > 0 || !!job.siteSafety.details || !!job.siteSafety.accessInstructions);

  const mapHero = poolLocation ? (
    NATIVE_MAP_AVAILABLE ? (
      <MapView
        provider={NATIVE_MAP_PROVIDER}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: carerLocation?.lat || poolLocation.lat,
          longitude: carerLocation?.lng || poolLocation.lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        region={{
          latitude: carerLocation ? (carerLocation.lat + poolLocation.lat) / 2 : poolLocation.lat,
          longitude: carerLocation ? (carerLocation.lng + poolLocation.lng) / 2 : poolLocation.lng,
          latitudeDelta: Math.max(0.008, distanceMeters ? (distanceMeters / 111000) * 2.4 : 0.008),
          longitudeDelta: Math.max(0.008, distanceMeters ? (distanceMeters / 111000) * 2.4 : 0.008),
        }}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        <Marker coordinate={{ latitude: poolLocation.lat, longitude: poolLocation.lng }} title={job?.poolName} description={job?.address || "Pool"} pinColor={themeColor} />
        <Circle
          center={{ latitude: poolLocation.lat, longitude: poolLocation.lng }}
          radius={GEOFENCE_RADIUS_METERS}
          strokeColor={isWithinGeofence ? themeColor : "#c2410c"}
          fillColor={isWithinGeofence ? themeColor + "22" : "#c2410c18"}
          strokeWidth={2}
        />
      </MapView>
    ) : mapHtml ? (
      <WebView
        style={StyleSheet.absoluteFill}
        ref={mapWebViewRef}
        // A real origin so the tile server accepts the requests
        source={{ html: mapHtml, baseUrl: "https://poolcare.africa" }}
        javaScriptEnabled
        onError={(e) => console.error("WebView error:", e.nativeEvent)}
      />
    ) : (
      <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: themeColor + "1F" }]}>
        <Ionicons name="map-outline" size={40} color={themeColor} />
      </View>
    )
  ) : null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: canAct ? 200 : 48 }} showsVerticalScrollIndicator={false}>
        {/* Hero: live map while travelling, otherwise the pool photo */}
        <View style={[styles.hero, { height: (showMapHero ? 280 : 230) + insets.top }]}>
          {showMapHero ? (
            mapHero
          ) : (
            <PoolThumb uri={!poolImageLoadError ? job?.poolImageUrl : null} size="fill" radius={0} />
          )}
          {!showMapHero ? <View style={[StyleSheet.absoluteFill, styles.heroShade]} pointerEvents="none" /> : null}
          <View style={[styles.heroBar, { top: insets.top + 8 }]} pointerEvents="box-none">
            <IconButton icon="chevron-back" label="Back" variant="white" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {showMapHero && distanceText ? (
                <View style={[styles.heroPill, isWithinGeofence && { backgroundColor: themeColor }]}>
                  <Ionicons name={isWithinGeofence ? "checkmark-circle" : "navigate"} size={14} color={isWithinGeofence ? "#ffffff" : C.ink} />
                  <Text style={[styles.heroPillText, isWithinGeofence && { color: "#ffffff" }]}>
                    {isWithinGeofence ? "You're here" : distanceText}
                  </Text>
                </View>
              ) : null}
              {poolLocation ? (
                <TouchableOpacity style={styles.heroPill} onPress={openInMaps} accessibilityRole="button">
                  <Ionicons name="navigate-outline" size={15} color={C.ink} />
                  <Text style={styles.heroPillText}>Directions</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          {/* Title */}
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            {showMapHero ? <PoolThumb uri={!poolImageLoadError ? job?.poolImageUrl : null} size={56} radius={14} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={2}>
                {job?.poolName}
              </Text>
              {job?.address ? (
                <Text style={styles.sub} numberOfLines={2}>
                  {job.address}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Progress */}
          {job.status === "failed" || job.status === "cancelled" ? (
            <Notice tone={job.status === "failed" ? "danger" : "neutral"} style={{ marginTop: 14 }}>
              {job.status === "failed" ? "This visit was recorded as not completed." : "This visit was cancelled by the office."}
            </Notice>
          ) : (
            <View style={styles.steps} accessibilityLabel={`Progress: ${STEPS[stepIdx].label}`}>
              {STEPS.map((s, i) => (
                <View key={s.key} style={{ flex: 1 }}>
                  <View style={[styles.stepBar, { backgroundColor: i <= stepIdx ? themeColor : C.line }]} />
                  <Text style={[styles.stepLabel, i === stepIdx && { color: themeColor, fontWeight: "700" }]}>{s.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* When */}
          <Card style={{ marginTop: 16 }}>
            <Row first>
              <Ionicons name="calendar-outline" size={20} color={C.muted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {job?.scheduledDate?.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </Text>
                <Text style={styles.rowSub}>
                  {job?.windowStart} – {job?.windowEnd}
                </Text>
              </View>
              {job?.isScheduledForToday ? <Chip label="Today" tone="accent" /> : null}
            </Row>
            {job?.clientName || job?.clientPhone ? (
              <Row>
                <Avatar name={job?.clientName || "Client"} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {job?.clientName || "Client"}
                  </Text>
                  <Text style={styles.rowSub}>{job?.clientPhone || "No phone on file"}</Text>
                </View>
                {job?.clientPhone ? (
                  <>
                    <IconButton
                      icon="logo-whatsapp"
                      label="WhatsApp client"
                      variant="outline"
                      onPress={() => Linking.openURL(`https://wa.me/${job.clientPhone?.replace(/\D/g, "")}`)}
                    />
                    <IconButton icon="call-outline" label="Call client" variant="outline" onPress={() => Linking.openURL(`tel:${job.clientPhone}`)} />
                  </>
                ) : null}
              </Row>
            ) : null}
          </Card>

          {/* Office notes */}
          {job?.notes ? (
            <Card padded style={{ marginTop: 12 }}>
              <Text style={styles.blockLabel}>Note from the office</Text>
              <Text style={styles.blockText}>{job.notes}</Text>
            </Card>
          ) : null}

          {/* Client-disclosed hazards and access (service agreement cl. 12.2) */}
          {isOpen && hasSafety ? (
            <View style={styles.safety}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="warning-outline" size={18} color={C.warnInk} />
                <Text style={[styles.blockLabel, { color: C.warnInk }]}>Site safety & access</Text>
              </View>
              {(job.siteSafety.hazards || []).length > 0 ? (
                <Text style={styles.safetyText}>{(job.siteSafety.hazards as string[]).map((h) => SITE_HAZARD_LABELS[h] || h).join(" · ")}</Text>
              ) : null}
              {job.siteSafety.details ? <Text style={styles.safetyText}>{job.siteSafety.details}</Text> : null}
              {job.siteSafety.accessInstructions ? <Text style={styles.safetyText}>Access: {job.siteSafety.accessInstructions}</Text> : null}
              {job.siteSafety.accessContactName ? (
                <Text style={styles.safetyText}>
                  Contact: {job.siteSafety.accessContactName}
                  {job.siteSafety.accessContactPhone ? ` · ${job.siteSafety.accessContactPhone}` : ""}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Chemicals the client keeps on site (service agreement cl. 7.1) */}
          {isOpen && clientStock.length > 0 ? (
            <>
              <SectionHeader title="Client's chemicals on site" style={{ marginTop: 20 }} />
              <Card>
                {clientStock.map((s, i) => {
                  const out = s.onHand <= 0;
                  const low = out || (s.lowAt != null && s.onHand <= s.lowAt);
                  return (
                    <Row key={s.id} first={i === 0}>
                      <Text style={[styles.rowTitle, { flex: 1 }]}>{s.name}</Text>
                      <Text style={[styles.rowSub, { marginTop: 0 }, low && { color: out ? C.dangerInk : C.warnInk, fontWeight: "600" }]}>
                        {Math.round(s.onHand * 100) / 100} {s.unit}
                        {out ? " · out" : low ? " · low" : ""}
                      </Text>
                    </Row>
                  );
                })}
              </Card>
            </>
          ) : null}

          {/* Not today */}
          {!arrived && isOpen && !job.isScheduledForToday ? (
            <Notice tone="warn" icon="calendar-outline" style={{ marginTop: 16 }}>
              This visit is on {job.scheduledDate?.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }) || "another day"}. You can start it on that day.
            </Notice>
          ) : null}

          {/* No location on file */}
          {canAct && !poolLocation ? (
            <Notice tone="neutral" style={{ marginTop: 16 }}>
              This pool has no map location on file, so arrival isn't checked. Swipe when you get there.
            </Notice>
          ) : null}
        </View>
      </ScrollView>

      {/* Pinned action */}
      {canAct ? (
        <Footer>
          {!poolLocation ? (
            <SwipeButton title="I'm here" onSwipeComplete={handleIAmHere} variant="success" iconName="checkmark" />
          ) : !carerLocation && locationIssue ? (
            <View style={{ alignItems: "center", gap: 6, paddingVertical: 6 }}>
              <Text style={[styles.rowSub, { textAlign: "center", color: C.dangerInk }]}>{locationIssue}</Text>
              <Button title="Try again" variant="secondary" size="md" icon="refresh" onPress={() => setLocationRetry((n) => n + 1)} />
            </View>
          ) : !carerLocation ? (
            <View style={styles.locating}>
              <ActivityIndicator size="small" color={themeColor} />
              <Text style={styles.rowSub}>Finding your location…</Text>
            </View>
          ) : isWithinGeofence ? (
            <SwipeButton title="I'm here — start visit" onSwipeComplete={handleIAmHere} variant="success" iconName="checkmark" />
          ) : job.status === "scheduled" ? (
            <SwipeButton title="I'm on my way" onSwipeComplete={handleOnMyWay} variant="primary" iconName="navigate" />
          ) : (
            <View style={styles.locating}>
              <Ionicons name="car-outline" size={20} color={themeColor} />
              <Text style={[styles.rowSub, { marginTop: 0, flex: 1 }]}>
                On your way{distanceText ? ` · ${distanceText}` : ""}. Arrival unlocks within {GEOFENCE_RADIUS_METERS} m.
              </Text>
            </View>
          )}
          {(carerLocation || !poolLocation || locationIssue) && (job.status === "scheduled" || job.status === "en_route") ? (
            <TouchableOpacity style={styles.accessLink} onPress={() => setShowAccessFailure(true)} hitSlop={8}>
              <Ionicons name="lock-closed-outline" size={15} color={C.muted} />
              <Text style={styles.accessLinkText}>Couldn't get access?</Text>
            </TouchableOpacity>
          ) : null}
        </Footer>
      ) : null}

      <AccessFailureSheet
        visible={showAccessFailure}
        jobId={id as string}
        themeColor={themeColor}
        onClose={() => setShowAccessFailure(false)}
        onRecorded={() => {
          setShowAccessFailure(false);
          Alert.alert("Recorded", "The office and client have the report. You can leave this site.", [
            { text: "OK", onPress: () => router.back() },
          ]);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerText: { marginTop: 12, color: C.muted, fontSize: 14 },
  transitionTitle: { color: "#ffffff", fontSize: 22, fontWeight: "700", marginTop: 18 },
  transitionSub: { color: "rgba(255,255,255,0.8)", fontSize: 15, marginTop: 4 },
  hero: { backgroundColor: "#3f9ac4", overflow: "hidden" },
  heroShade: { backgroundColor: "rgba(16,35,26,0.12)" },
  heroBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroPill: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
      default: { elevation: 3 },
    }),
  },
  heroPillText: { fontSize: 13, fontWeight: "600", color: C.ink },
  sheet: { marginTop: -24, backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 20 },
  title: { fontSize: 22, fontWeight: "700", color: C.ink, letterSpacing: -0.2 },
  sub: { fontSize: 14, color: C.muted, marginTop: 2 },
  steps: { flexDirection: "row", gap: 6, marginTop: 18 },
  stepBar: { height: 4, borderRadius: 2 },
  stepLabel: { fontSize: 11, color: C.muted, marginTop: 6, fontWeight: "500" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: C.ink },
  rowSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  blockLabel: { fontSize: 13, fontWeight: "600", color: C.ink },
  blockText: { fontSize: 14, color: C.body, lineHeight: 20, marginTop: 4 },
  safety: { marginTop: 12, backgroundColor: C.warnBg, borderRadius: 18, padding: 14, gap: 4 },
  safetyText: { fontSize: 14, color: "#5e3405", lineHeight: 20 },
  locating: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 56 },
  accessLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  accessLinkText: { fontSize: 14, color: C.muted, fontWeight: "500" },
  doneHero: { alignItems: "center", paddingHorizontal: 28, paddingBottom: 32 },
  doneBadge: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  doneTitle: { fontSize: 26, fontWeight: "700", color: C.ink, marginTop: 20 },
  doneSub: { fontSize: 16, color: C.body, marginTop: 4, fontWeight: "500" },
  doneBody: { fontSize: 14, color: C.muted, marginTop: 10, textAlign: "center", lineHeight: 20 },
  reportStrong: { fontSize: 16, fontWeight: "600", color: C.ink, marginTop: 6 },
  reportMuted: { fontSize: 14, color: C.muted, marginTop: 2 },
  reportText: { fontSize: 14, color: C.body, marginTop: 6 },
});
