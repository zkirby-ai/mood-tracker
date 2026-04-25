import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mood Tracker',
    short_name: 'Mood',
    description: 'A tiny app for tracking daily mood over time.',
    start_url: '/',
    display: 'standalone',
    background_color: '#10131f',
    theme_color: '#10131f',
    orientation: 'portrait'
  };
}
