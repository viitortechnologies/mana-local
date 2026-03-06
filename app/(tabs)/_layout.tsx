import React, { useEffect } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View, Platform } from 'react-native';

import { Header } from '@/components/Header';
import { ProfileBanner } from '@/components/ProfileBanner';
import Colors from '@/constants/Colors';
import { useAuth } from '@/src/contexts/AuthContext';
import { useColorScheme } from '@/components/useColorScheme';

function TabsGuard({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (isLoading) return;
    if (!session) router.replace('/(auth)/phone');
  }, [session, isLoading]);
  if (!session) return null;
  return <>{children}</>;
}

function BlockedAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  return (
    <View style={[styles.blockedContainer, { backgroundColor: colors.background }]}>
      <Text style={[styles.blockedTitle, { color: colors.text }]}>Account blocked</Text>
      <Text style={[styles.blockedMessage, { color: colors.tabIconDefault }]}>
        Your account has been blocked. It will remain inactive until an admin enables it from the Users screen.
      </Text>
      <Pressable
        style={[styles.blockedButton, { borderColor: colors.tint }]}
        onPress={async () => {
          await signOut();
          router.replace('/(auth)/phone');
        }}
      >
        <Text style={[styles.blockedButtonText, { color: colors.tint }]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function TabBarIcon(props: { name: React.ComponentProps<typeof FontAwesome>['name']; color: string }) {
  return <FontAwesome size={24} style={{ marginBottom: -2 }} {...props} />;
}

const TAB_ICON_SIZE = 24;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { showProfileBanner, profile } = useAuth();
  const colors = Colors[colorScheme ?? 'light'];

  const isBlocked = profile?.account_status === 'blocked';

  return (
    <TabsGuard>
      <View style={StyleSheet.flatten([{ flex: 1, backgroundColor: colors.background }])}>
        {isBlocked ? (
          <BlockedAccountScreen />
        ) : (
          <>
            <Header />
            {showProfileBanner && Platform.OS !== 'web' && <ProfileBanner />}
            <View style={{ flex: 1 }}>
              <Tabs
            screenOptions={{
              tabBarActiveTintColor: colors.tint,
              tabBarInactiveTintColor: colors.tabIconDefault,
              tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
              tabBarStyle: {
                backgroundColor: colors.headerBg,
                borderTopColor: 'transparent',
                elevation: 8,
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 10,
                paddingTop: 4,
              },
              headerShown: false,
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Community',
                tabBarIcon: ({ color }) => <TabBarIcon name="comments" color={color} />,
              }}
            />
            <Tabs.Screen
              name="reuse"
              options={{
                title: 'Reuse Circle',
                tabBarIcon: ({ color }) => <TabBarIcon name="recycle" color={color} />,
              }}
            />
            <Tabs.Screen
              name="news"
              options={{
                title: 'News',
                tabBarIcon: ({ color }) => <TabBarIcon name="newspaper-o" color={color} />,
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title:
                  profile?.profile_completed_at && profile?.name?.trim()
                    ? profile.name.trim().slice(0, 8)
                    : 'Profile',
                tabBarIcon: ({ color }) =>
                  profile?.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={{
                        width: TAB_ICON_SIZE,
                        height: TAB_ICON_SIZE,
                        borderRadius: TAB_ICON_SIZE / 2,
                        borderWidth: 1.5,
                        borderColor: color,
                      }}
                    />
                  ) : (
                    <TabBarIcon name="user" color={color} />
                  ),
              }}
            />
            <Tabs.Screen name="new-post" options={{ href: null }} />
            <Tabs.Screen name="new-reuse" options={{ href: null }} />
            <Tabs.Screen name="my-reuse" options={{ href: null }} />
            <Tabs.Screen name="my-requests" options={{ href: null }} />
            <Tabs.Screen name="approve-reuse" options={{ href: null }} />
            <Tabs.Screen name="approve-posts" options={{ href: null }} />
            <Tabs.Screen name="edit-profile" options={{ href: null }} />
            <Tabs.Screen name="post/[id]" options={{ href: null }} />
            <Tabs.Screen name="reuse-item/[id]" options={{ href: null }} />
            <Tabs.Screen name="edit-reuse/[id]" options={{ href: null }} />
            <Tabs.Screen name="edit-post/[id]" options={{ href: null }} />
            <Tabs.Screen name="member/[id]" options={{ href: null }} />
            <Tabs.Screen name="send-push" options={{ href: null }} />
            <Tabs.Screen name="users" options={{ href: null }} />
          </Tabs>
            </View>
          </>
        )}
      </View>
    </TabsGuard>
  );
}

const styles = StyleSheet.create({
  blockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  blockedTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  blockedMessage: { fontSize: 16, textAlign: 'center', marginBottom: 24 },
  blockedButton: { borderWidth: 1, borderRadius: 8, padding: 14, minWidth: 120, alignItems: 'center' },
  blockedButtonText: { fontSize: 16, fontWeight: '600' },
});
