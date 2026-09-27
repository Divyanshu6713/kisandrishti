import { Route, Routes } from 'react-router';
import { lazyPage as lazy } from '@/lib/lazyPage';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import { AdminGate, AdminSubNav, Loading } from '@/features/mlAdmin/shared';
import NotFound from '@/pages/NotFound';

const Dashboard = lazy(() => import('@/features/mlAdmin/Dashboard'));
const Datasets = lazy(() => import('@/features/mlAdmin/Datasets'));
const DatasetDetail = lazy(() => import('@/features/mlAdmin/DatasetDetail'));
const Training = lazy(() => import('@/features/mlAdmin/Training'));
const TrainingJob = lazy(() => import('@/features/mlAdmin/TrainingJob'));
const Models = lazy(() => import('@/features/mlAdmin/Models'));
const ModelDetail = lazy(() => import('@/features/mlAdmin/ModelDetail'));
const TestPrediction = lazy(() => import('@/features/mlAdmin/TestPrediction'));
const Deployment = lazy(() => import('@/features/mlAdmin/Deployment'));

/**
 * AI Model Training — administrator area. Dataset → validation → split → training → evaluation →
 * registry → deployment. Every action is authorised by the ML backend, not by this page.
 */
export default function MlTraining() {
  return (
    <div lang="en">
      <PageHeader eyebrow="Administration" title="AI Model Training" description="Train, evaluate and deploy the crop-disease model from your own datasets. Every number here is measured by the training system." />
      <AdminGate>
        <AdminSubNav />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="datasets" element={<Datasets />} />
            <Route path="datasets/:id" element={<DatasetDetail />} />
            <Route path="training" element={<Training />} />
            <Route path="training/:id" element={<TrainingJob />} />
            <Route path="models" element={<Models />} />
            <Route path="models/:id" element={<ModelDetail />} />
            <Route path="test" element={<TestPrediction />} />
            <Route path="deployment" element={<Deployment />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AdminGate>
    </div>
  );
}
