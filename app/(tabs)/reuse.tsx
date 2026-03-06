import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useLocation } from '@/src/contexts/LocationContext';
import { useAuth } from '@/src/contexts/AuthContext';
import type { ReuseItem } from '@/src/lib/types';
import { REUSE_CATEGORIES } from '@/src/lib/types';
import { formatExpiryShort } from '@/src/lib/formatExpiry';
import { isVideoUrl } from '@/constants/MediaLimits';
import { MediaWithWatermark } from '@/components/MediaWithWatermark';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const THUMB_SIZE = 100;
const CARD_MIN_HEIGHT = 120;

function ReuseCard({ item }: { item: ReuseItem }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const requests = (item as any).request_count ?? 0;
  const views = item.view_count ?? 0;
  const inHandover = !!item.handover_order_id;
  const expiryText = formatExpiryShort(item.expires_at);
  const updatedStr = new Date(item.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const viewsStr = `${views} view${views === 1 ? '' : 's'}`;
  const categoryLabel = item.category ? REUSE_CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category : null;

  return (
    <Link href={{ pathname: '/reuse-item/[id]', params: { id: item.id } }} asChild>
      <Pressable
        style={({ pressed }) =>
          StyleSheet.flatten([
            styles.card,
            {
              backgroundColor: colors.cardBg ?? colors.background,
              borderColor: colors.border ?? colors.tabIconDefault,
            },
            inHandover && styles.cardHandover,
            pressed && styles.cardPressed,
          ])
        }
        disabled={inHandover}
      >
        <View style={styles.cardInner}>
          {/* Fixed-size thumbnail — explicit dimensions prevent oversized images on any platform */}
          {item.media_urls && item.media_urls.length > 0 ? (
            <View style={[styles.thumbWrap, { backgroundColor: colors.border ?? colors.tabIconDefault + '20' }]}>
              {isVideoUrl(item.media_urls[0]) ? (
                <MediaWithWatermark style={[styles.thumbFixed, styles.videoPlaceholder]}>
                  <Text style={styles.videoPlaceholderText}>Video</Text>
                </MediaWithWatermark>
              ) : (
                <MediaWithWatermark style={styles.thumbFixed}>
                  <Image
                    source={{ uri: item.media_urls[0] }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                </MediaWithWatermark>
              )}
            </View>
          ) : (
            <View style={[styles.thumbWrap, styles.thumbPlaceholder, { backgroundColor: colors.tabIconDefault + '25' }]}>
              <Text style={[styles.thumbPlaceholderText, { color: colors.tabIconDefault }]}>No image</Text>
            </View>
          )}

          <View style={styles.cardBody}>
            {categoryLabel && (
              <Text style={[styles.categoryLabel, { color: colors.tint }]} numberOfLines={1}>
                {categoryLabel}
              </Text>
            )}
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.price, { color: colors.tint }]} numberOfLines={1}>
              MRP ₹{item.mrp} · {item.delivery_option === 'self_pickup' ? 'Self pickup' : 'Delivery'}
            </Text>
            <View style={styles.metaBlock}>
              <Text style={[styles.metaLine, { color: colors.tabIconDefault }]} numberOfLines={1}>
                {updatedStr} · {viewsStr}
              </Text>
              <View style={styles.metaRow}>
                <Text
                  style={[styles.metaLine, styles.metaLineSecond, { color: colors.tabIconDefault }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {expiryText || '\u00A0'}
                </Text>
                {inHandover ? (
                  <Text style={[styles.handoverBadge, { color: '#16a34a' }]}>Handover</Text>
                ) : (
                  <Text style={[styles.requestBadge, { borderColor: colors.tint, color: colors.tint }]}>
                    {requests} request{requests === 1 ? '' : 's'}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const PAGE_SIZE = 10;

export default function ReuseScreen() {
  const { selectedLocation } = useLocation();
  const { showProfileBanner } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const canAdd = !showProfileBanner;
  const params = useLocalSearchParams<{ category?: string }>();
  const activeCategory = typeof params.category === 'string' ? params.category : undefined;
  const activeCategoryLabel =
    activeCategory && REUSE_CATEGORIES.find((c) => c.value === activeCategory)?.label;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['reuse', selectedLocation?.id, activeCategory],
    enabled: !!selectedLocation?.id,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!selectedLocation?.id) return [] as ReuseItem[];
      // When locations fail to load, selectedLocation.id is "fallback-0" etc. – resolve to real UUID by pincode so reuse items show.
      let locationId = selectedLocation.id;
      if (String(locationId).startsWith('fallback-') && selectedLocation.pincode) {
        const { data: loc } = await supabase
          .from('locations')
          .select('id')
          .eq('pincode', selectedLocation.pincode)
          .maybeSingle();
        if (!loc?.id) return [] as ReuseItem[];
        locationId = loc.id;
      }
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const nowIso = new Date().toISOString();
      let query = supabase
        .from('reuse_items')
        .select('*')
        .eq('location_id', locationId)
        .eq('is_active', true)
        .not('approved_at', 'is', null)
        .is('rejected_at', null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

      if (activeCategory) {
        query = query.eq('category', activeCategory);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).range(from, to);
      if (error) {
        console.warn('Failed to load reuse items', { error, locationId, pageParam, activeCategory });
        return [] as ReuseItem[];
      }

      const items = (data ?? []) as ReuseItem[];

      if (!error && items.length > 0) {
        try {
          const ids = Array.from(new Set(items.map((it) => it.id)));
          const { data: counts, error: countsError } = await supabase.rpc('get_reuse_request_counts', {
            reuse_item_ids: ids,
          });
          if (!countsError && counts?.length) {
            const countMap = new Map<string, number>(
              (counts as { reuse_item_id: string; request_count: number }[]).map((row) => [
                row.reuse_item_id,
                Number(row.request_count) || 0,
              ])
            );
            items.forEach((it) => {
              (it as any).request_count = countMap.get(it.id) ?? 0;
            });
          }
        } catch (e) {
          console.warn('Failed to load reuse request counts', e);
        }
      }

      return items;
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
  });

  const rawItems = useMemo(
    () => (data?.pages ? data.pages.flat() : ([] as ReuseItem[])),
    [data]
  );

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');

  const items = useMemo(() => {
    if (!productSearchQuery.trim()) return rawItems;
    const q = productSearchQuery.trim().toLowerCase();
    return rawItems.filter((i) => i.title?.toLowerCase().includes(q));
  }, [rawItems, productSearchQuery]);

  if (isLoading && !data) {
    return (
      <View style={StyleSheet.flatten([styles.centered, { backgroundColor: colors.background }])}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  const chipBorder = colors.border ?? colors.tabIconDefault + '99';

  return (
    <View style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}>
      <View style={[styles.screenHeader, { backgroundColor: colors.background, borderBottomColor: chipBorder }]}>
        <Text style={[styles.screenTitle, { color: colors.text }]}>Reuse Circle</Text>
        <Text style={[styles.screenSubtitle, { color: colors.tabIconDefault }]}>
          Give & get items in your area
        </Text>
      </View>
      {/* Single row: filter label + filter icon */}
      <Pressable
        style={[styles.filterRow, { borderBottomColor: chipBorder, backgroundColor: colors.background }]}
        onPress={() => {
          setSearchInputValue(productSearchQuery);
          setFilterModalVisible(true);
        }}
      >
        <Text style={[styles.filterRowLabel, { color: colors.text }]} numberOfLines={1}>
          {activeCategoryLabel ?? 'All'}
          {productSearchQuery.trim() ? ` · "${productSearchQuery.trim()}"` : ''}
        </Text>
        <View style={[styles.filterIconWrap, { backgroundColor: colors.tint + '22' }]}>
          <MaterialCommunityIcons name="filter-variant" size={22} color={colors.tint} />
        </View>
      </Pressable>

      {/* Filter popup: search + category list */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <Pressable style={styles.filterModalBackdrop} onPress={() => setFilterModalVisible(false)}>
          <Pressable style={[styles.filterModalBox, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.filterModalHeader, { borderBottomColor: colors.border ?? colors.tabIconDefault }]}>
              <Text style={[styles.filterModalTitle, { color: colors.text }]}>Filter & search</Text>
              <Pressable onPress={() => setFilterModalVisible(false)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={24} color={colors.tabIconDefault} />
              </Pressable>
            </View>
            <Text style={[styles.filterModalSectionLabel, { color: colors.tabIconDefault }]}>Search products</Text>
            <TextInput
              style={[styles.filterModalSearch, { color: colors.text, borderColor: colors.tabIconDefault }]}
              placeholder="Search by title..."
              placeholderTextColor={colors.tabIconDefault}
              value={searchInputValue}
              onChangeText={setSearchInputValue}
              returnKeyType="search"
            />
            <Text style={[styles.filterModalSectionLabel, { color: colors.tabIconDefault }]}>Category</Text>
            <ScrollView style={styles.filterModalCategoryList} keyboardShouldPersistTaps="handled">
              <Pressable
                style={[
                  styles.filterModalCategoryItem,
                  { borderColor: colors.border ?? colors.tabIconDefault },
                  !activeCategory && { backgroundColor: colors.tint + '20', borderColor: colors.tint },
                ]}
                onPress={() => {
                  router.push('/reuse');
                  setFilterModalVisible(false);
                }}
              >
                <Text style={[styles.filterModalCategoryText, { color: colors.text }]}>All</Text>
                {!activeCategory && <MaterialCommunityIcons name="check" size={20} color={colors.tint} />}
              </Pressable>
              {REUSE_CATEGORIES.map((c) => {
                const active = activeCategory === c.value;
                return (
                  <Pressable
                    key={c.value}
                    style={[
                      styles.filterModalCategoryItem,
                      { borderColor: colors.border ?? colors.tabIconDefault },
                      active && { backgroundColor: colors.tint + '20', borderColor: colors.tint },
                    ]}
                    onPress={() => {
                      router.push({ pathname: '/reuse', params: { category: c.value } });
                      setFilterModalVisible(false);
                    }}
                  >
                    <Text style={[styles.filterModalCategoryText, { color: colors.text }]}>{c.label}</Text>
                    {active && <MaterialCommunityIcons name="check" size={20} color={colors.tint} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={[styles.filterModalFooter, { borderTopColor: colors.border ?? colors.tabIconDefault }]}>
              <Pressable
                style={[styles.filterModalApplyBtn, { backgroundColor: colors.tint }]}
                onPress={() => {
                  setProductSearchQuery(searchInputValue.trim());
                  setFilterModalVisible(false);
                }}
              >
                <Text style={styles.filterModalApplyText}>Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {canAdd && (
        <Link href="/(tabs)/new-reuse" asChild>
          <Pressable style={StyleSheet.flatten([styles.fab, { backgroundColor: colors.tint }])}>
            <View style={styles.fabIconWrap}>
              <Text style={styles.fabIcon} numberOfLines={1}>+</Text>
            </View>
          </Pressable>
        </Link>
      )}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ReuseCard item={item} />}
        contentContainerStyle={[styles.list, items.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.tint + '18' }]}>
              <Text style={[styles.emptyIcon, { color: colors.tint }]}>♻</Text>
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No listings yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.tabIconDefault }]}>
              No reuse items in this location.
            </Text>
            <Text style={[styles.emptyHint, { color: colors.tabIconDefault }]}>
              Pull down to refresh or tap + to add an item.
            </Text>
          </View>
        }
        ListFooterComponent={
          hasNextPage && isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isFetchingNextPage}
            onRefresh={() => refetch()}
            tintColor={colors.tint}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  listEmpty: { flexGrow: 1 },
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  screenSubtitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    minHeight: CARD_MIN_HEIGHT,
  },
  cardPressed: { opacity: 0.88 },
  cardHandover: { opacity: 0.6 },
  cardInner: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'center',
    minHeight: CARD_MIN_HEIGHT,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    minWidth: THUMB_SIZE,
    maxWidth: THUMB_SIZE,
    minHeight: THUMB_SIZE,
    maxHeight: THUMB_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 14,
    flexShrink: 0,
  },
  thumbFixed: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: { fontSize: 11, fontWeight: '500' },
  videoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  videoPlaceholderText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 4,
  },
  price: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  metaBlock: { marginTop: 2 },
  metaLine: { fontSize: 11 },
  metaLineSecond: { flex: 1, minWidth: 0, marginRight: 6 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    minWidth: 0,
  },
  handoverBadge: { fontSize: 10, fontWeight: '700', flexShrink: 0 },
  requestBadge: {
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    flexShrink: 0,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  filterIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  filterModalBox: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterModalTitle: { fontSize: 18, fontWeight: '700' },
  filterModalSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 20,
    opacity: 0.9,
  },
  filterModalSearch: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginHorizontal: 20,
  },
  filterModalCategoryList: {
    maxHeight: 280,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  filterModalCategoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  filterModalCategoryText: { fontSize: 15, fontWeight: '500' },
  filterModalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  filterModalApplyBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  filterModalApplyText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyWrap: {
    paddingVertical: 48,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIcon: { fontSize: 32 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    opacity: 0.85,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    fontSize: 15,
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 28,
    textAlign: 'center',
    width: 32,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});
