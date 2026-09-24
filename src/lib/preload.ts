/**
 * Warm the browser cache with every app page (and the shared 3D scenes) so navigation is
 * instant. Vite dedupes these with the lazy() imports in App.tsx — each file loads once.
 */
let started = false;

export function preloadAppPages() {
  if (started) return;
  started = true;
  const pages = [
    () => import('@/pages/app/Overview'),
    () => import('@/pages/app/Soil'),
    () => import('@/pages/app/CropHealth'),
    () => import('@/pages/app/Organic'),
    () => import('@/pages/app/Insights'),
    () => import('@/pages/app/Advisor'),
    () => import('@/pages/app/Disease'),
    () => import('@/pages/app/Risk'),
    () => import('@/pages/app/Weather'),
    () => import('@/pages/app/Farms'),
    () => import('@/pages/app/garden/Garden'),
    () => import('@/pages/app/garden/Sunlight'),
    () => import('@/pages/app/garden/Nutrients'),
    () => import('@/pages/app/garden/Quantity'),
    () => import('@/pages/app/garden/GardenSetup'),
    () => import('@/three/RooftopScene'),
    () => import('@/three/PlantStudio'),
    () => import('@/three/SoilScene'),
  ];
  // Sequential, low priority — never competes with what the user is doing right now.
  pages.reduce((p, load) => p.then(() => load().then(() => undefined, () => undefined)), Promise.resolve());
}
