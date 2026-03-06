import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/src/lib/supabase';
import type { Location } from '@/src/lib/types';
import { LOCATION_OPTIONS } from '@/src/lib/types';

const STORAGE_KEY = 'mana_local_location_id';

type LocationContextValue = {
  locations: Location[];
  selectedLocation: Location | null;
  setSelectedLocationId: (id: string) => void;
  isLoading: boolean;
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocationState] = useState<Location | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadLocations = useCallback(async () => {
    const { data, error } = await supabase.from('locations').select('*').order('name');
    if (!error && data?.length) {
      setLocations(data as Location[]);
      return data as Location[];
    }
    const fallback: Location[] = LOCATION_OPTIONS.map((l, i) => ({
      id: `fallback-${i}`,
      name: l.name,
      pincode: l.pincode,
      display_name: `${l.name} ${l.pincode}`,
    }));
    setLocations(fallback);
    return fallback;
  }, []);

  const setSelectedLocationId = useCallback(
    async (id: string) => {
      const list = locations.length ? locations : await loadLocations();
      const loc = list.find((l) => l.id === id) ?? list[0];
      setSelectedLocationState(loc ?? null);
      if (loc) await AsyncStorage.setItem(STORAGE_KEY, loc.id);
    },
    [locations, loadLocations]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await loadLocations();
      if (!mounted) return;

      // Prefer the location from the signed-in user's profile (their default/home location).
      let profileLocationId: string | null = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('location_id')
            .eq('id', user.id)
            .single();
          profileLocationId = (profile as { location_id: string | null } | null)?.location_id ?? null;
        }
      } catch {
        // ignore – fall back to saved/default location
      }

      // Fall back to the last location explicitly selected in this app.
      const savedId = await AsyncStorage.getItem(STORAGE_KEY);

      const defaultLoc =
        list.find((l) => l.id === profileLocationId) ??
        list.find((l) => l.id === savedId) ??
        list[0] ??
        null;

      setSelectedLocationState(defaultLoc);
      if (defaultLoc) {
        await AsyncStorage.setItem(STORAGE_KEY, defaultLoc.id);
      }
      setIsLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [loadLocations]);

  const value = useMemo<LocationContextValue>(
    () => ({
      locations,
      selectedLocation,
      setSelectedLocationId,
      isLoading,
    }),
    [locations, selectedLocation, setSelectedLocationId, isLoading]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
