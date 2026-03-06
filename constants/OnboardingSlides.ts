import type { ImageSourcePropType } from 'react-native';

export const ONBOARDING_STORAGE_KEY = 'mana_local_onboarding_done';

export interface OnboardingSlide {
  image: ImageSourcePropType;
  title?: string;
  subtitle?: string;
}

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    image: require('../assets/images/splash1.png'),
    title: 'Welcome to Mana Local',
    subtitle: 'Connect with your community. Voice, support, and serve together.',
  },
  {
    image: require('../assets/images/splash2.png'),
    title: 'Reuse & Share',
    subtitle: 'Give items a second life. List, discover, and request products in your area.',
  },
  {
    image: require('../assets/images/splash3.png'),
    title: 'Get Started',
    subtitle: 'Join your local circle. Post, reuse, and make a difference.',
  },
];
