import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mood Tracker',
    short_name: 'Mood',
    description: 'A tiny app for tracking daily mood over time.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5efe4',
    theme_color: '#f5efe4',
    orientation: 'portrait'
  };
}
