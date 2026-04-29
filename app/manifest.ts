import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mood',
    short_name: 'Mood',
    description: 'A tiny daily check-in.',
    start_url: '/',
    display: 'standalone',
    background_color: '#efe6d9',
    theme_color: '#efe6d9',
    orientation: 'portrait'
  };
}
