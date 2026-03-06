import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

export function ExternalLink(
  props: Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string }
) {
  const { style, href, ...rest } = props;
  // On web, always flatten styles so we never pass style arrays or StyleSheet IDs
  // directly to the underlying <a> element.
  const resolvedStyle =
    Platform.OS === 'web' && style ? StyleSheet.flatten(style as any) : style;

  return (
    <Link
      target="_blank"
      {...(rest as any)}
      style={resolvedStyle as any}
      // @ts-expect-error: External URLs are not typed.
      href={href}
      onPress={(e) => {
        if (Platform.OS !== 'web') {
          // Prevent the default behavior of linking to the default browser on native.
          e.preventDefault();
          // Open the link in an in-app browser.
          WebBrowser.openBrowserAsync(href as string);
        }
      }}
    />
  );
}
