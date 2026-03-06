import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/src/lib/supabase';

/** Expo Go does not support push (removed in SDK 53). Use a dev build to test push. */
function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

export type PushTokenResult = { token: string } | { error: string };

/**
 * Request permissions and return the Expo push token, or an error message.
 * Use this to show a specific reason when enabling push fails.
 * In Expo Go, returns an error without loading expo-notifications (not supported there).
 */
export async function getExpoPushTokenAsync(): Promise<PushTokenResult> {
  if (isExpoGo()) {
    return {
      error:
        'Push notifications are not available in Expo Go. Use a development build (npx expo run:android) to test push.',
    };
  }

  let Notifications: typeof import('expo-notifications');
  try {
    Notifications = await import('expo-notifications');
  } catch (e) {
    console.warn('expo-notifications not available', e);
    return {
      error:
        'Push notifications are not available in this build. Use a development build to enable push.',
    };
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (!Device.isDevice) {
    return { error: 'Push notifications require a physical device (not a simulator/emulator).' };
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return { error: 'Notification permission was denied. Enable it in your device Settings → Mana Local.' };
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData?.data ?? null;
    if (token) return { token };
    return {
      error:
        'Could not get push token. Try a development build (not Expo Go) or add EAS projectId in app config for production.',
    };
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
    console.warn('Failed to get Expo push token', e);
    return {
      error: msg?.includes('projectId')
        ? 'Push requires an EAS project. Run "eas build" or set projectId in app.json.'
        : 'Could not get push token. Use a physical device and a development build if possible.',
    };
  }
}

/**
 * Register the current device's push token for the user and set push_notifications_enabled = true.
 */
export async function registerPushToken(userId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await getExpoPushTokenAsync();
  if ('error' in result) {
    return { ok: false, error: result.error };
  }
  const token = result.token;

  const { error: rpcError } = await supabase.rpc('upsert_push_token', {
    p_expo_push_token: token,
  });
  if (rpcError) return { ok: false, error: rpcError.message };

  const { error: profileError } = await supabase
    .from('profiles')
    // @ts-expect-error - push_notifications_enabled added in migration 009
    .update({ push_notifications_enabled: true, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (profileError) return { ok: false, error: profileError.message };

  return { ok: true };
}

/**
 * Remove this device's token and set push_notifications_enabled = false for the user.
 */
export async function unregisterPushToken(userId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await getExpoPushTokenAsync();
  const token = 'token' in result ? result.token : null;
  if (token) {
    await supabase.from('push_tokens').delete().eq('user_id', userId).eq('expo_push_token', token);
  } else {
    await supabase.from('push_tokens').delete().eq('user_id', userId);
  }

  const { error } = await supabase
    .from('profiles')
    // @ts-expect-error - push_notifications_enabled added in migration 009
    .update({ push_notifications_enabled: false, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
