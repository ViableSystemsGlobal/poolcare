import { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, ActivityIndicator, Image, Platform, Linking, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Dimensions } from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Location from "expo-location";
import SwipeButton from "../../src/components/SwipeButton";
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
import { api, getApiUrl } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";
import { ChecklistWizard, ChecklistItem as WizardChecklistItem, useToast } from "../../src/components";
import { COLORS } from "../../src/theme";

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

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<any>(null);
  const [visitStarted, setVisitStarted] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [readings, setReadings] = useState<Reading>({});
  const [showReadingsModal, setShowReadingsModal] = useState(false);
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
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string | null>(null);
  const GEOFENCE_RADIUS_METERS = 200; // 200m radius

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

    const startLocationWatching = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.log("Location permission denied");
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
        locationSubscription = await Location.watchPositionAsync(
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
      } catch (error) {
        console.error("Error watching location:", error);
        setLocationWatching(false);
      }
    };

    startLocationWatching();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
      setLocationWatching(false);
    };
  }, [poolLocation, arrived, job?.status]);

  // Initialize wizard checklist with detailed items
  // Before photos FIRST, then tasks, then after photos
  // All items can have optional photo attachment
  const initializeWizardChecklist = () => {
    const wizardItems: WizardChecklistItem[] = [
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
    setWizardChecklist(wizardItems);
  };

  const loadJob = async () => {
    try {
      setLoading(true);
      
      const jobData: any = await api.getJob(id);
      
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
              // Initialize base wizard items first
              const baseWizardItems: WizardChecklistItem[] = [
                { id: "photo_before", label: "Take before photos of the pool", required: true, category: "documentation", requiresPhoto: true },
                { id: "clean_surface", label: "Skim pool surface - remove all floating debris", required: true, category: "cleaning", allowsPhoto: true },
                { id: "clean_floor", label: "Vacuum pool floor", required: true, category: "cleaning", allowsPhoto: true },
                { id: "clean_walls", label: "Brush pool walls and steps", required: true, category: "cleaning", allowsPhoto: true },
                { id: "clean_baskets", label: "Empty skimmer and pump baskets", required: true, category: "cleaning", allowsPhoto: true },
                { id: "clean_waterline", label: "Clean waterline/tile line", required: false, category: "cleaning", allowsNotApplicable: true, allowsPhoto: true },
                { id: "backwash", label: "Backwash filter if needed", required: false, category: "cleaning", allowsNotApplicable: true, allowsPhoto: true },
                { id: "check_pump", label: "Check pump is running properly", required: true, category: "equipment", allowsPhoto: true },
                { id: "check_filter", label: "Inspect filter pressure gauge", required: true, category: "equipment", allowsPhoto: true },
                { id: "check_valves", label: "Verify all valves are correctly positioned", required: true, category: "equipment", allowsPhoto: true },
                { id: "check_heater", label: "Check heater (if applicable)", required: false, category: "equipment", allowsNotApplicable: true, allowsPhoto: true },
                { id: "check_salt", label: "Check salt cell (if saltwater pool)", required: false, category: "equipment", allowsNotApplicable: true, allowsPhoto: true },
                { id: "safety_ladders", label: "Inspect ladders and handrails", required: true, category: "safety", allowsNotApplicable: true, allowsPhoto: true },
                { id: "safety_lights", label: "Check pool lights", required: true, category: "safety", allowsNotApplicable: true, allowsPhoto: true },
                { id: "safety_deck", label: "Inspect pool deck for hazards", required: false, category: "safety", allowsNotApplicable: true, allowsPhoto: true },
                { id: "photo_after", label: "Take after photos of the pool", required: true, category: "documentation", requiresPhoto: true },
              ];
              
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
        
        // Always initialize wizard checklist (even if visit exists) so user can continue
        // Check if wizard checklist needs initialization
        initializeWizardChecklist();
      } else {
        // No existing visit - set default checklist
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
        
        // Initialize wizard checklist with enhanced items
        initializeWizardChecklist();
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
        windowStart: windowStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        windowEnd: windowEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        status: jobStatus,
        scheduledDate: jobDate,
        isScheduledForToday,
        poolImageUrl,
      });
      
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
      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location Required", "Please enable location services.");
        throw new Error("Location permission denied");
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
      throw error;
    }
  };

  // Handle "I am here" swipe - start job (if needed) + mark as arrived in one go
  const handleIAmHere = async () => {
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

      // Get current location
        const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location Required", "Please enable location services.");
        throw new Error("Location permission denied");
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
          if (!e.message?.includes("must be scheduled") && !e.message?.includes("already")) {
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
          if (!e.message?.includes("already on_site") && !e.message?.includes("must be en_route")) {
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
      // Save before readings (without readingType - API doesn't accept it)
      if (beforeReadingsData.ph) {
        await api.saveReadings(visitId, beforeReadingsData);
      }
      
      // Save after readings
      if (afterReadingsData.ph) {
        await api.saveReadings(visitId, afterReadingsData);
      }
      
      // Save chemicals
      if (chemicalsData && chemicalsData.length > 0) {
        for (const chemical of chemicalsData) {
          if (chemical.name && chemical.qty) {
            await api.addChemical(visitId, {
              chemical: chemical.name,
              qty: parseFloat(chemical.qty) || 0,
              unit: chemical.unit || "ml",
            });
          }
        }
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14b8a6" />
          <Text style={styles.loadingText}>Loading job details...</Text>
        </View>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#d1d5db" />
          <Text style={styles.loadingText}>Job not found</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={loadJob}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const completedCount = checklist.filter(item => item.completed).length;
  const requiredCount = checklist.filter(item => item.required).length;
  const requiredCompleted = checklist.filter(item => item.required && item.completed).length;

  // Show transition loading screen
  if (transitioning) {
    return (
      <View style={styles.transitionContainer}>
        <View style={styles.transitionContent}>
          <View style={styles.transitionIconContainer}>
            <ActivityIndicator size="large" color={COLORS.text.inverse} />
          </View>
          <Text style={styles.transitionTitle}>{transitionMessage}</Text>
          <Text style={styles.transitionSubtitle}>{job?.poolName}</Text>
        </View>
      </View>
    );
  }

  // Show completion screen when job is completed
  if (job?.status === "completed") {
    return (
      <View style={styles.completionContainer}>
        <View style={styles.completionContent}>
          <View style={styles.completionIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color={COLORS.success[500]} />
          </View>
          <Text style={styles.completionTitle}>Job Completed!</Text>
          <Text style={styles.completionPoolName}>{job?.poolName}</Text>
          <Text style={styles.completionSubtitle}>
            Great work! This job has been completed successfully.
          </Text>
          
          {/* View Report Button */}
          <TouchableOpacity
            style={styles.completionReportButton}
            onPress={async () => {
              setLoadingReport(true);
              try {
                if (visitId) {
                  const report = await api.getVisitReport(visitId, "json");
                  setReportData(report);
                  setShowReportPreview(true);
                }
              } catch (error) {
                console.error("Error loading report:", error);
                Alert.alert("Error", "Could not load report");
              }
              setLoadingReport(false);
            }}
            disabled={loadingReport}
          >
            {loadingReport ? (
              <ActivityIndicator size="small" color={COLORS.primary[500]} />
            ) : (
              <>
                <Ionicons name="document-text-outline" size={20} color={COLORS.primary[500]} />
                <Text style={styles.completionReportButtonText}>View Report</Text>
              </>
            )}
          </TouchableOpacity>
          
          {/* Done Button */}
          <TouchableOpacity
            style={styles.completionDoneButton}
            onPress={() => router.back()}
          >
            <Text style={styles.completionDoneButtonText}>Back to Jobs</Text>
          </TouchableOpacity>
        </View>
        
        {/* Report Preview Modal */}
        <Modal
          visible={showReportPreview}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowReportPreview(false)}
        >
          <View style={styles.reportPreviewContainer}>
            <View style={styles.reportPreviewHeader}>
              <Text style={styles.reportPreviewTitle}>Service Report</Text>
              <TouchableOpacity onPress={() => setShowReportPreview(false)}>
                <Ionicons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.reportPreviewContent}>
              {reportData && (
                <>
                  <View style={styles.reportSection}>
                    <Text style={styles.reportSectionTitle}>Pool Information</Text>
                    <Text style={styles.reportText}>{reportData.pool?.name}</Text>
                    <Text style={styles.reportTextSecondary}>{reportData.pool?.address}</Text>
                  </View>
                  
                  <View style={styles.reportSection}>
                    <Text style={styles.reportSectionTitle}>Service Details</Text>
                    <Text style={styles.reportText}>Duration: {reportData.serviceDuration || "N/A"}</Text>
                    <Text style={styles.reportText}>Technician: {reportData.carer?.name || "N/A"}</Text>
                  </View>
                  
                  {reportData.readings && (
                    <View style={styles.reportSection}>
                      <Text style={styles.reportSectionTitle}>Water Chemistry</Text>
                      {reportData.readings.ph && <Text style={styles.reportText}>pH: {reportData.readings.ph}</Text>}
                      {reportData.readings.chlorineFree && <Text style={styles.reportText}>Free Chlorine: {reportData.readings.chlorineFree} ppm</Text>}
                      {reportData.readings.alkalinity && <Text style={styles.reportText}>Alkalinity: {reportData.readings.alkalinity} ppm</Text>}
                    </View>
                  )}
                  
                  {reportData.checklist && reportData.checklist.length > 0 && (
                    <View style={styles.reportSection}>
                      <Text style={styles.reportSectionTitle}>Completed Tasks</Text>
                      {reportData.checklist.filter((item: any) => item.completed).map((item: any, idx: number) => (
                        <View key={idx} style={styles.reportChecklistItem}>
                          <Ionicons name="checkmark-circle" size={16} color={COLORS.success[500]} />
                          <Text style={styles.reportText}>{item.task || item.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.reportCloseButton}
              onPress={() => setShowReportPreview(false)}
            >
              <Text style={styles.reportCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </View>
    );
  }

  // Show wizard mode when on site (arrived) and job is not completed
  if (arrived && job?.status === "on_site" && job?.status !== "completed" && wizardChecklist.length > 0) {
    return (
      <View style={styles.container}>
        {/* Simplified header for wizard mode */}
        <View style={styles.wizardHeader}>
          <View style={styles.wizardHeaderLeft}>
            <Ionicons name="water" size={20} color={COLORS.primary[500]} />
            <Text style={styles.wizardPoolName}>{job?.poolName}</Text>
          </View>
          <View style={styles.wizardStatusBadge}>
            <Ionicons name="location" size={14} color={COLORS.success[600]} />
            <Text style={styles.wizardStatusText}>On Site</Text>
          </View>
        </View>
        
        <ChecklistWizard
          items={wizardChecklist}
          onComplete={handleWizardComplete}
          onPhotoUpload={handleWizardPhotoUpload}
          onCancel={() => router.back()}
          disabled={job?.status === "completed"}
          initialBeforeReadings={beforeReadings}
          initialAfterReadings={afterReadings}
        />
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Job Info Card - Prominent with Pool Image */}
      <View style={styles.jobInfoCard}>
        {/* Pool Image - show placeholder if no URL or image failed to load */}
        {job?.poolImageUrl && !poolImageLoadError ? (
          <Image
            source={{ uri: job.poolImageUrl }}
            style={styles.poolImage}
            resizeMode="cover"
            onError={() => setPoolImageLoadError(true)}
          />
        ) : (
          <View style={styles.poolImagePlaceholder}>
            <Ionicons name="water" size={48} color="#d1d5db" />
          </View>
        )}
        
        <View style={styles.jobInfoContent}>
        <View style={styles.jobInfoHeader}>
          <View style={styles.jobInfoHeaderLeft}>
              <View style={[styles.jobStatusIndicator, { 
                backgroundColor: job?.status === "on_site" ? "#10b981" : 
                                 job?.status === "en_route" ? "#f59e0b" : "#14b8a6" 
              }]} />
            <View style={styles.jobInfoText}>
              <Text style={styles.jobInfoTitle}>{job?.poolName}</Text>
              <Text style={styles.jobInfoSubtitle}>{job?.address}</Text>
            </View>
          </View>
        </View>
        <View style={styles.jobInfoDetails}>
          <View style={styles.jobInfoDetailItem}>
          <Ionicons name="time-outline" size={18} color="#6b7280" />
            <Text style={styles.jobInfoDetailText}>
            {job?.windowStart} - {job?.windowEnd}
          </Text>
          </View>
          <View style={styles.jobInfoDetailItem}>
            <Ionicons name="flag-outline" size={18} color="#6b7280" />
              <Text style={[styles.jobInfoDetailText, {
                color: job?.status === "on_site" ? "#10b981" : 
                       job?.status === "en_route" ? "#f59e0b" : "#6b7280"
              }]}>
              {job?.status?.replace("_", " ").toUpperCase()}
            </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Map View with Geofence - Show when pool location is available and not arrived */}
      {poolLocation && !arrived && job.status !== "completed" && (
        <View style={styles.mapCard}>
          <View style={styles.mapHeader}>
            <Ionicons name="map-outline" size={20} color="#374151" />
            <Text style={styles.mapTitle}>Location Check</Text>
            {distanceMeters !== null && (
              <View style={[styles.distanceBadge, isWithinGeofence && styles.distanceBadgeSuccess]}>
                <Text style={[styles.distanceText, isWithinGeofence && styles.distanceTextSuccess]}>
                  {distanceMeters < 1000 
                    ? `${Math.round(distanceMeters)}m away`
                    : `${(distanceMeters / 1000).toFixed(1)}km away`}
                </Text>
              </View>
            )}
          </View>
          
          {/* Google Maps View */}
          <View style={styles.mapContainer}>
            {poolLocation && MapView ? (
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={{
                  latitude: carerLocation?.lat || poolLocation.lat,
                  longitude: carerLocation?.lng || poolLocation.lng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                region={{
                  latitude: carerLocation?.lat || poolLocation.lat,
                  longitude: carerLocation?.lng || poolLocation.lng,
                  latitudeDelta: Math.max(
                    0.01,
                    distanceMeters ? (distanceMeters / 111000) * 2 : 0.01
                  ),
                  longitudeDelta: Math.max(
                    0.01,
                    distanceMeters ? (distanceMeters / 111000) * 2 : 0.01
                  ),
                }}
                showsUserLocation={true}
                showsMyLocationButton={true}
                followsUserLocation={carerLocation !== null}
              >
                {/* Pool Location Marker */}
                <Marker
                  coordinate={{
                    latitude: poolLocation.lat,
                    longitude: poolLocation.lng,
                  }}
                  title="Pool Location"
                  description={job?.address || "Pool"}
                  pinColor="#14b8a6"
                />
                
                {/* Carer Location Marker */}
                {carerLocation && (
                  <Marker
                    coordinate={{
                      latitude: carerLocation.lat,
                      longitude: carerLocation.lng,
                    }}
                    title="Your Location"
                    description="You are here"
                    pinColor={isWithinGeofence ? "#10b981" : "#ef4444"}
                  />
                )}
                
                {/* Geofence Circle */}
                <Circle
                  center={{
                    latitude: poolLocation.lat,
                    longitude: poolLocation.lng,
                  }}
                  radius={GEOFENCE_RADIUS_METERS}
                  strokeColor={isWithinGeofence ? "#10b981" : "#ef4444"}
                  fillColor={isWithinGeofence ? "#10b98120" : "#ef444420"}
                  strokeWidth={2}
                />
              </MapView>
            ) : poolLocation ? (
              // WebView-based Google Maps (works in Expo Go)
              googleMapsApiKey ? (
                <WebView
                  style={styles.map}
                  source={{
                    html: `
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                          <style>
                            * { margin: 0; padding: 0; box-sizing: border-box; }
                            body, html { height: 100%; width: 100%; overflow: hidden; }
                            #map { height: 100%; width: 100%; }
                            #error { 
                              display: none; 
                              position: absolute; 
                              top: 50%; 
                              left: 50%; 
                              transform: translate(-50%, -50%); 
                              text-align: center; 
                              padding: 20px;
                              background: white;
                              border-radius: 8px;
                              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                            }
                          </style>
                        </head>
                        <body>
                          <div id="map"></div>
                          <div id="error">
                            <p style="color: #ef4444; font-weight: bold; margin-bottom: 8px;">Map Error</p>
                            <p style="color: #6b7280; font-size: 12px;" id="errorMsg"></p>
                          </div>
                          <script>
                            let map;
                            const poolLocation = { lat: ${poolLocation.lat}, lng: ${poolLocation.lng} };
                            const carerLocation = ${carerLocation ? `{ lat: ${carerLocation.lat}, lng: ${carerLocation.lng} }` : 'null'};
                            const geofenceRadius = ${GEOFENCE_RADIUS_METERS};
                            
                            // Define initMap globally for Google Maps callback
                            window.initMap = function() {
                              try {
                                if (typeof google === 'undefined' || !google.maps) {
                                  throw new Error('Google Maps API not loaded');
                                }
                                
                                const center = carerLocation || poolLocation;
                                map = new google.maps.Map(document.getElementById('map'), {
                                  center: center,
                                  zoom: carerLocation ? 16 : 15,
                                  mapTypeId: 'roadmap',
                                  disableDefaultUI: false,
                                  zoomControl: true,
                                  mapTypeControl: false,
                                  streetViewControl: false,
                                  fullscreenControl: true
                                });
                                
                                // Pool marker
                                new google.maps.Marker({
                                  position: poolLocation,
                                  map: map,
                                  title: 'Pool Location',
                                  icon: {
                                    path: google.maps.SymbolPath.CIRCLE,
                                    scale: 10,
                                    fillColor: '#14b8a6',
                                    fillOpacity: 1,
                                    strokeColor: '#ffffff',
                                    strokeWeight: 2
                                  }
                                });
                                
                                // Carer marker
                                if (carerLocation) {
                                  new google.maps.Marker({
                                    position: carerLocation,
                                    map: map,
                                    title: 'Your Location',
                                    icon: {
                                      path: google.maps.SymbolPath.CIRCLE,
                                      scale: 8,
                                      fillColor: '#ef4444',
                                      fillOpacity: 1,
                                      strokeColor: '#ffffff',
                                      strokeWeight: 2
                                    }
                                  });
                                  
                                  // Fit bounds to show both locations
                                  const bounds = new google.maps.LatLngBounds();
                                  bounds.extend(new google.maps.LatLng(poolLocation.lat, poolLocation.lng));
                                  bounds.extend(new google.maps.LatLng(carerLocation.lat, carerLocation.lng));
                                  map.fitBounds(bounds);
                                }
                                
                                // Geofence circle
                                new google.maps.Circle({
                                  strokeColor: '#ef4444',
                                  strokeOpacity: 0.8,
                                  strokeWeight: 2,
                                  fillColor: '#ef4444',
                                  fillOpacity: 0.15,
                                  map: map,
                                  center: poolLocation,
                                  radius: geofenceRadius
                                });
                              } catch (error) {
                                console.error('Map initialization error:', error);
                                document.getElementById('error').style.display = 'block';
                                document.getElementById('errorMsg').textContent = error.message || 'Failed to load map';
                              }
                            };
                            
                            // Fallback if callback doesn't fire
                            setTimeout(function() {
                              if (typeof google !== 'undefined' && google.maps && !map) {
                                window.initMap();
                              }
                            }, 2000);
                            
                            // Error handler
                            window.gm_authFailure = function() {
                              document.getElementById('error').style.display = 'block';
                              document.getElementById('errorMsg').textContent = 'Google Maps API authentication failed. Please check API key configuration in Settings → Integrations → Google Maps.';
                            };
                          </script>
                          <script src="https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=geometry&callback=initMap"></script>
                        </body>
                      </html>
                    `,
                  }}
                  javaScriptEnabled={true}
                  onError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('WebView error:', nativeEvent);
                  }}
                  onHttpError={(syntheticEvent) => {
                    const { nativeEvent } = syntheticEvent;
                    console.error('WebView HTTP error:', nativeEvent);
                  }}
                />
              ) : (
                // Fallback when no API key
                <View style={styles.mapFallback}>
              <TouchableOpacity
                    style={styles.mapFallbackButton}
                    onPress={() => {
                      const url = Platform.select({
                        ios: `maps://maps.apple.com/?daddr=${poolLocation.lat},${poolLocation.lng}&ll=${carerLocation?.lat || poolLocation.lat},${carerLocation?.lng || poolLocation.lng}`,
                        android: `geo:${poolLocation.lat},${poolLocation.lng}?q=${poolLocation.lat},${poolLocation.lng}`,
                      });
                      if (url) {
                        Linking.openURL(url);
                      }
                    }}
                  >
                    <Ionicons name="map" size={48} color={isWithinGeofence ? "#10b981" : "#ef4444"} />
                    <Text style={styles.mapFallbackText}>
                      {carerLocation 
                        ? isWithinGeofence 
                          ? "✓ You are within range"
                          : "Move closer to the pool location"
                        : "Getting your location..."}
                  </Text>
                    <Text style={styles.mapFallbackSubtext}>
                      Tap to open in Maps app
                    </Text>
                    {poolLocation && (
                      <Text style={styles.mapFallbackSubtext}>
                        Pool: {poolLocation.lat.toFixed(4)}, {poolLocation.lng.toFixed(4)}
                      </Text>
                    )}
                    {carerLocation && (
                      <Text style={styles.mapFallbackSubtext}>
                        You: {carerLocation.lat.toFixed(4)}, {carerLocation.lng.toFixed(4)}
                      </Text>
                    )}
        </TouchableOpacity>
      </View>
              )
            ) : null}
            
            {/* Status Overlay */}
            <View style={styles.mapStatusOverlay}>
              {carerLocation ? (
                isWithinGeofence ? (
                  <View style={styles.geofenceIndicator}>
                    <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                    <Text style={styles.geofenceText}>Within 200m</Text>
                </View>
                ) : (
                  <View style={[styles.geofenceIndicator, styles.geofenceIndicatorWarning]}>
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                    <Text style={[styles.geofenceText, styles.geofenceTextWarning]}>
                      {distanceMeters ? `${Math.round(distanceMeters)}m away` : "Too far"}
              </Text>
      </View>
                )
              ) : (
                <View style={styles.geofenceIndicator}>
                  <ActivityIndicator size="small" color="#14b8a6" />
                  <Text style={styles.geofenceText}>Getting location...</Text>
                </View>
              )}
            </View>
          </View>
          
          {/* Open in Maps button */}
            <TouchableOpacity
            style={styles.openMapsButton}
            onPress={() => {
              const url = Platform.select({
                ios: `maps://maps.apple.com/?daddr=${poolLocation.lat},${poolLocation.lng}`,
                android: `geo:${poolLocation.lat},${poolLocation.lng}?q=${poolLocation.lat},${poolLocation.lng}`,
              });
              if (url) {
                Linking.openURL(url);
              }
            }}
          >
            <Ionicons name="navigate-outline" size={18} color="#14b8a6" />
            <Text style={styles.openMapsText}>Open in Maps</Text>
        </TouchableOpacity>
              </View>
            )}

      {/* Swipe Action Buttons */}
      {!arrived && job.status !== "completed" && job.isScheduledForToday && (
        <View style={styles.swipeActionContainer}>
          {/* Wait for location to be determined before showing actions */}
          {!carerLocation ? (
            <View style={styles.locationLoadingContainer}>
              <ActivityIndicator size="small" color={COLORS.primary[500]} />
              <Text style={styles.locationLoadingText}>Getting your location...</Text>
            </View>
          ) : isWithinGeofence ? (
            /* Show "I am here" if within geofence - ONE swipe does everything */
            <>
              <View style={styles.swipeHintContainer}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success[500]} />
                <Text style={styles.swipeHintText}>
                  You're at the location! Swipe to start and begin work.
                    </Text>
              </View>
              <SwipeButton
                title="I am here"
                onSwipeComplete={handleIAmHere}
                variant="success"
                iconName="checkmark"
              />
            </>
          ) : (
            /* Location known but not within geofence */
            <>
              {/* Show distance indicator */}
              {distanceMeters !== null && (
                <View style={styles.swipeHintContainer}>
                  <Ionicons name="navigate" size={20} color={COLORS.neutral[500]} />
                  <Text style={styles.swipeHintText}>
                    {distanceMeters < 1000 
                      ? `${Math.round(distanceMeters)}m to destination`
                      : `${(distanceMeters / 1000).toFixed(1)}km to destination`}
                    </Text>
                </View>
              )}
              {/* Show "I'm on my way" if not started yet */}
              {job.status === "scheduled" && (
                <SwipeButton
                  title="I'm on my way"
                  onSwipeComplete={handleOnMyWay}
                  variant="primary"
                  iconName="navigate"
                />
              )}
              {/* Show en_route status message if already started */}
              {job.status === "en_route" && (
                <View style={styles.enRouteCard}>
                  <View style={styles.enRouteIconContainer}>
                    <Ionicons name="car" size={24} color={COLORS.warning[500]} />
            </View>
                  <View style={styles.enRouteTextContainer}>
                    <Text style={styles.enRouteTitle}>On your way!</Text>
                    <Text style={styles.enRouteSubtitle}>
                      Move within {GEOFENCE_RADIUS_METERS}m to confirm arrival
                    </Text>
      </View>
                </View>
          )}
        </>
      )}
                  </View>
      )}
      
      {/* Date warning for jobs not scheduled today */}
      {!arrived && job.status !== "completed" && !job.isScheduledForToday && (
        <View style={styles.dateWarningCard}>
          <Ionicons name="calendar-outline" size={20} color="#f59e0b" />
          <Text style={styles.dateWarningText}>
            This job is scheduled for {job.scheduledDate?.toLocaleDateString() || "another day"}. 
            You can only start this job on the scheduled date.
          </Text>
                  </View>
      )}


      {/* All old checklist/readings/chemicals/photos sections removed - now handled by wizard */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafafa",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  // Wizard mode styles
  wizardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  wizardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  wizardPoolName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  wizardStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#dcfce7",
    borderRadius: 16,
    gap: 4,
  },
  wizardStatusText: {
    fontSize: 12,
    color: "#16a34a",
    fontWeight: "600",
  },
  // Completion screen styles
  completionContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  completionContent: {
    alignItems: "center",
    width: "100%",
  },
  completionIconContainer: {
    marginBottom: 24,
  },
  completionTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  completionPoolName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#14b8a6",
    marginBottom: 16,
  },
  completionSubtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  completionReportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#14b8a6",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 12,
    width: "100%",
    gap: 8,
  },
  completionReportButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#14b8a6",
  },
  completionDoneButton: {
    backgroundColor: "#14b8a6",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  completionDoneButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  // Report preview styles for completion screen
  reportPreviewContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  reportPreviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  reportPreviewTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  reportPreviewContent: {
    flex: 1,
    padding: 16,
  },
  reportCloseButton: {
    backgroundColor: "#14b8a6",
    padding: 16,
    margin: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  reportCloseButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  reportText: {
    fontSize: 15,
    color: "#111827",
    marginBottom: 4,
  },
  reportTextSecondary: {
    fontSize: 14,
    color: "#6b7280",
  },
  transitionContainer: {
    flex: 1,
    backgroundColor: "#14b8a6", // Theme primary color
    justifyContent: "center",
    alignItems: "center",
  },
  transitionContent: {
    alignItems: "center",
    padding: 40,
  },
  transitionIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  transitionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
    textAlign: "center",
  },
  transitionSubtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
  },
  jobInfoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  poolImage: {
    width: "100%",
    height: 160,
  },
  poolImagePlaceholder: {
    width: "100%",
    height: 120,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  jobInfoContent: {
    padding: 20,
  },
  jobInfoHeader: {
    marginBottom: 16,
  },
  jobInfoHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  jobStatusIndicator: {
    width: 4,
    height: 48,
    borderRadius: 2,
    marginRight: 16,
  },
  jobInfoText: {
    flex: 1,
  },
  jobInfoTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  jobInfoSubtitle: {
    fontSize: 15,
    color: "#6b7280",
  },
  jobInfoDetails: {
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  jobInfoDetailItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  jobInfoDetailText: {
    fontSize: 14,
    color: "#6b7280",
    marginLeft: 10,
  },
  primaryActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#14b8a6",
    padding: 18,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: "#14b8a6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "600",
    marginLeft: 10,
  },
  progressCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  progressCount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  progressBar: {
    height: 10,
    backgroundColor: "#f3f4f6",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#16a34a",
  },
  progressWarning: {
    fontSize: 13,
    color: "#14b8a6",
    fontWeight: "600",
    marginTop: 4,
  },
  progressCompleted: {
    fontSize: 13,
    color: "#16a34a",
    fontWeight: "600",
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#6b7280",
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  checklistItemDisabled: {
    opacity: 0.6,
  },
  checklistTextReadOnly: {
    color: "#6b7280",
  },
  checklistContent: {
    flex: 1,
    marginLeft: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checklistText: {
    fontSize: 15,
    color: "#111827",
    flex: 1,
    fontWeight: "500",
  },
  checklistTextCompleted: {
    textDecorationLine: "line-through",
    color: "#9ca3af",
  },
  requiredBadge: {
    backgroundColor: "#14b8a615",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  requiredBadgeText: {
    fontSize: 11,
    color: "#14b8a6",
    fontWeight: "600",
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a15",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  completedBadgeText: {
    fontSize: 12,
    color: "#16a34a",
    fontWeight: "600",
    marginLeft: 6,
  },
  sectionActionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fafafa",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionActionButtonDisabled: {
    opacity: 0.5,
    backgroundColor: "#f3f4f6",
  },
  sectionActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  sectionActionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  chemicalsList: {
    marginTop: 12,
  },
  chemicalItem: {
    padding: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    marginBottom: 6,
  },
  chemicalText: {
    fontSize: 14,
    color: "#111827",
  },
  photoButtons: {
    flexDirection: "row",
    gap: 12,
  },
  photoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#fff7ed",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#14b8a6",
  },
  photoButtonDisabled: {
    opacity: 0.5,
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
  },
  photoButtonCompleted: {
    backgroundColor: "#16a34a20",
    borderColor: "#16a34a",
  },
  photoButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
    marginLeft: 8,
  },
  photoButtonTextCompleted: {
    color: "#16a34a",
  },
  completeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16a34a",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  completeButtonDisabled: {
    backgroundColor: "#9ca3af",
    opacity: 0.6,
  },
  completeButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 8,
  },
  mapCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  mapHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  distanceBadge: {
    backgroundColor: "#ef444415",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  distanceBadgeSuccess: {
    backgroundColor: "#10b98115",
  },
  distanceText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ef4444",
  },
  distanceTextSuccess: {
    color: "#10b981",
  },
  mapContainer: {
    height: 300,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#f9fafb",
  },
  map: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  mapFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    padding: 20,
  },
  mapFallbackButton: {
    alignItems: "center",
    width: "100%",
  },
  mapFallbackText: {
    fontSize: 16,
    color: "#374151",
    marginTop: 16,
    textAlign: "center",
    fontWeight: "600",
  },
  mapFallbackSubtext: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 8,
    textAlign: "center",
  },
  mapStatusOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  geofenceIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 6,
  },
  geofenceIndicatorWarning: {
    backgroundColor: "#fef2f2",
  },
  geofenceText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10b981",
  },
  geofenceTextWarning: {
    color: "#ef4444",
  },
  openMapsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#f0fdfa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#14b8a6",
    gap: 8,
  },
  openMapsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
  },
  primaryActionButtonSuccess: {
    backgroundColor: "#10b981",
  },
  primaryActionButtonDisabled: {
    backgroundColor: "#9ca3af",
    opacity: 0.6,
  },
  dateWarningCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef3c7",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  dateWarningText: {
    flex: 1,
    fontSize: 14,
    color: "#92400e",
    marginLeft: 12,
    lineHeight: 20,
  },
  geofenceWarning: {
    fontSize: 13,
    color: "#ef4444",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
    fontWeight: "500",
  },
  swipeActionContainer: {
    marginBottom: 20,
  },
  locationLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f0fdfa",
    borderRadius: 12,
    gap: 12,
  },
  locationLoadingText: {
    fontSize: 14,
    color: "#14b8a6",
    fontWeight: "500",
  },
  swipeHintContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    gap: 8,
  },
  swipeHintText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  enRouteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef3c7",
    padding: 20,
    borderRadius: 16,
    marginVertical: 12,
  },
  enRouteIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fef3c7",
    borderWidth: 2,
    borderColor: "#f59e0b",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  enRouteTextContainer: {
    flex: 1,
  },
  enRouteTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#92400e",
    marginBottom: 4,
  },
  enRouteSubtitle: {
    fontSize: 14,
    color: "#a16207",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
  chemicalInputGroup: {
    flexDirection: "row",
    marginBottom: 12,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#14b8a6",
    borderRadius: 8,
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
    marginLeft: 8,
  },
  modalButton: {
    backgroundColor: "#14b8a6",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
  modalButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: "#14b8a6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#14b8a6",
    marginTop: 12,
    gap: 8,
  },
  reportButtonText: {
    color: "#14b8a6",
    fontSize: 16,
    fontWeight: "600",
  },
  reportModalContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  reportModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  reportModalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  reportModalCloseButton: {
    padding: 8,
  },
  reportLoadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  reportLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6b7280",
  },
  reportContent: {
    flex: 1,
    padding: 20,
  },
  reportSection: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  reportSectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  reportInfoRow: {
    flexDirection: "row",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  reportInfoLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
    minWidth: 120,
  },
  reportInfoValue: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
  },
  reportChecklistItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  reportChecklistText: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
  },
  reportChecklistTextIncomplete: {
    color: "#9ca3af",
    textDecorationLine: "line-through",
  },
  reportRequiredMark: {
    fontSize: 12,
    color: "#6b7280",
    fontStyle: "italic",
  },
  reportPhotoSection: {
    marginBottom: 12,
  },
  reportPhotoLabel: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  reportSuccessCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#d1fae5",
  },
  reportSuccessTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#065f46",
    marginTop: 12,
    marginBottom: 8,
  },
  reportSuccessText: {
    fontSize: 14,
    color: "#047857",
    textAlign: "center",
    lineHeight: 20,
  },
  reportActions: {
    paddingBottom: 40,
  },
  reportDownloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0fdfa",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#14b8a6",
  },
  reportDownloadButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#14b8a6",
  },
  reportDoneButton: {
    backgroundColor: "#14b8a6",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  reportDoneButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  reportErrorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  reportErrorText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
    marginBottom: 24,
  },
  reportRetryButton: {
    backgroundColor: "#14b8a6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  reportRetryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
