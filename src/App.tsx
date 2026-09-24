import { Suspense } from 'react';
import { lazyPage as lazy } from '@/lib/lazyPage';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell, PageSkeleton } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/overlay';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RequireAuth } from '@/components/auth/RequireAuth';

// Every page is code-split; heavy 3D scenes are split again inside the pages.
const Landing = lazy(() => import('@/pages/Landing'));
const Login = lazy(() => import('@/pages/Login'));
const Overview = lazy(() => import('@/pages/app/Overview'));
const Farms = lazy(() => import('@/pages/app/Farms'));
const Soil = lazy(() => import('@/pages/app/Soil'));
const CropHealth = lazy(() => import('@/pages/app/CropHealth'));
const Organic = lazy(() => import('@/pages/app/Organic'));
const Disease = lazy(() => import('@/pages/app/Disease'));
const Risk = lazy(() => import('@/pages/app/Risk'));
const Weather = lazy(() => import('@/pages/app/Weather'));
const Advisor = lazy(() => import('@/pages/app/Advisor'));
const Insights = lazy(() => import('@/pages/app/Insights'));
const NotFound = lazy(() => import('@/pages/NotFound'));

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
                <Landing />
              </Suspense>
            }
          />
          <Route
            path="/login"
            element={
              <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
                <Login />
              </Suspense>
            }
          />
          {/* Everything under /app requires a session — the shell is not rendered without one. */}
          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Overview />} />
            <Route path="farms" element={<Farms />} />
            <Route path="soil" element={<Soil />} />
            <Route path="crop" element={<CropHealth />} />
            <Route path="organic" element={<Organic />} />
            <Route path="disease" element={<Disease />} />
            <Route path="risk" element={<Risk />} />
            <Route path="weather" element={<Weather />} />
            <Route path="advisor" element={<Advisor />} />
            <Route path="insights" element={<Insights />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route
            path="*"
            element={
              <Suspense fallback={<PageSkeleton />}>
                <NotFound />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  );
}
