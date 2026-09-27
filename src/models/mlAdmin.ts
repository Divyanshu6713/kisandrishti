/**
 * Contracts for the admin-only AI Model Training area. Shapes mirror the Python backend
 * (backend/kd_backend). Every number in these types is computed by the backend — the UI never fills
 * in a missing value; `null` renders as "Not available".
 */

export type PermissionStatus = 'owned' | 'licensed_commercial' | 'research_only' | 'permission_required' | 'unknown';

export const PERMISSION_OPTIONS: { value: PermissionStatus; label: string }[] = [
  { value: 'owned', label: 'Owned/collected by Kisan Drishti' },
  { value: 'licensed_commercial', label: 'Licensed for commercial use' },
  { value: 'research_only', label: 'Research/non-commercial only' },
  { value: 'permission_required', label: 'Permission required' },
  { value: 'unknown', label: 'Unknown' },
];

export type DatasetStatus = 'awaiting_upload' | 'uploading' | 'upload_failed' | 'queued' | 'validating' | 'ready' | 'ready_with_warnings' | 'invalid' | 'failed';

export interface ValidationWarning {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export interface DuplicateStats {
  method: string;
  exact_duplicate_groups: number;
  exact_duplicate_images: number;
  near_duplicate_links: number;
  duplicate_groups: number;
  images_in_duplicate_groups: number;
  cross_class_groups: number;
  cross_split_groups: number;
  large_similarity_clusters?: number;
  images_in_large_similarity_clusters?: number;
  examples: { class: string; split: string | null; file: string }[][];
}

export interface ValidationReport {
  status: DatasetStatus;
  structure?: 'predefined_splits' | 'class_folders';
  error?: { message: string; code: string };
  summary?: {
    total_images: number;
    class_count: number;
    total_bytes: number;
    split_counts: Record<string, number>;
    split_percent: Record<string, number>;
    dimensions: { min_width: number | null; max_width: number | null; min_height: number | null; max_height: number | null; common: { width: number; height: number; count: number }[] };
    formats: Record<string, number>;
    rejected: Record<string, number>;
    skipped: Record<string, number>;
    tiny_images: number;
  };
  classes?: { raw_name: string; display_name: string; count: number; by_split: Record<string, number> }[];
  empty_classes?: string[];
  duplicates?: DuplicateStats;
  warnings: ValidationWarning[];
  rejected_samples?: { file: string; reason: string }[];
  skipped_samples?: Record<string, string[]>;
  stripped_prefix?: string;
}

export interface Split {
  id: string;
  dataset_version_id: string;
  strategy: 'predefined' | 'stratified_random';
  train_pct: number | null;
  val_pct: number | null;
  test_pct: number | null;
  seed: number | null;
  train_count: number;
  val_count: number;
  test_count: number;
  per_class: Record<string, { train: number; val: number; test: number }>;
  warnings: ValidationWarning[];
  manifest_sha256: string;
  created_by: string;
  created_at: string;
}

export interface DatasetVersion {
  id: string;
  dataset_id: string;
  dataset_name?: string;
  version: string;
  description: string | null;
  source: string | null;
  owner: string | null;
  license: string | null;
  permission_status: PermissionStatus;
  collection_method: string | null;
  notes: string | null;
  original_filename: string | null;
  upload_bytes: number | null;
  received_bytes: number;
  archive_sha256: string | null;
  status: DatasetStatus;
  status_detail: string | null;
  progress: number | null;
  structure: 'predefined_splits' | 'class_folders' | null;
  total_images: number | null;
  class_count: number | null;
  total_bytes: number | null;
  content_hash: string | null;
  locked_at: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  warning_count?: number;
  model_count?: number;
  validation?: ValidationReport | null;
  classes?: { class_index: number; raw_name: string; display_name: string; image_count: number }[];
  splits?: Split[];
  models?: { id: string; version: string; status: ModelStatus; split_id: string }[];
}

export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  versions: DatasetVersion[];
}

export interface TrainingConfig {
  architecture: string;
  pretrained: boolean;
  epochs: number;
  batch_size: number;
  learning_rate: number;
  image_size: number;
  early_stopping: boolean;
  early_stopping_patience: number;
  augmentation: boolean;
  seed: number;
  weight_decay: number;
  lr_schedule: 'cosine' | 'plateau' | 'none';
  label_smoothing: number;
  class_weighting: boolean;
  freeze_backbone_epochs: number;
  mixed_precision: boolean;
  device: 'auto' | 'cuda' | 'cpu';
  num_workers: number | null;
}

export interface ArchitectureInfo {
  id: string;
  label: string;
  weights: string;
  params_m: number;
  size_mb: number;
  note: string;
}

export interface WorkerStatus {
  online: boolean;
  last_seen: string | null;
  workers: { worker_id: string; host: string; device: string; device_name: string; last_seen: string; current_task: string | null }[];
}

export interface TrainingOptions {
  architectures: ArchitectureInfo[];
  defaults: TrainingConfig;
  limits: Record<string, { min: number | null; max: number }>;
  suggested_version: { version: string; reason: string };
  worker: WorkerStatus;
}

export type JobStatus = 'queued' | 'preparing' | 'training' | 'validating' | 'evaluating' | 'completed' | 'failed' | 'cancel_requested' | 'cancelled';

export interface EpochRecord {
  epoch: number;
  train_loss: number | null;
  train_accuracy: number | null;
  val_loss: number | null;
  val_accuracy: number | null;
  val_macro_f1: number | null;
  learning_rate: number | null;
  duration_s: number | null;
  is_best: number;
  created_at: string;
}

export interface TrainingJob {
  id: string;
  number: number;
  dataset_version_id: string;
  split_id: string;
  config: TrainingConfig & { model_version: string; model_name: string };
  status: JobStatus;
  status_detail: string | null;
  error_code: string | null;
  error_message: string | null;
  current_epoch: number;
  total_epochs: number;
  batch_index: number | null;
  batches_per_epoch: number | null;
  overall_progress: number;
  live: { phase: 'train' | 'val' | 'test'; batch: number; batches: number; running_loss?: number; running_accuracy?: number; learning_rate?: number; images_per_second?: number | null } | null;
  device: string | null;
  device_name: string | null;
  best_epoch: number | null;
  early_stopped: number;
  cancel_requested_at: string | null;
  cancel_requested_by: string | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  model_id: string | null;
  model_version: string | null;
  model_status: ModelStatus | null;
  model_name?: string;
  dataset_name: string;
  dataset_version: string;
  total_images?: number;
  class_count?: number;
  split_strategy?: Split['strategy'];
  train_count?: number;
  val_count?: number;
  test_count?: number;
  split_seed?: number | null;
  epochs?: EpochRecord[];
  worker?: WorkerStatus;
}

export type ModelStatus = 'training' | 'ready' | 'deployed' | 'archived' | 'failed' | 'evaluation_failed' | 'cancelled';

export interface ModelClass {
  index: number;
  id: string;
  display_name: string;
  crop?: string | null;
  is_healthy?: boolean;
}

export interface PerClassMetric {
  index: number;
  class_id: string;
  display_name: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
  predicted: number;
  precision_defined: boolean;
  has_test_images: boolean;
}

export interface Evaluation {
  evaluated_at: string;
  checkpoint_epoch: number | null;
  selection: string;
  test_loss: number;
  test_images: number;
  accuracy: number | null;
  top3_accuracy: number | null;
  macro: { precision: number | null; recall: number | null; f1: number | null; classes_averaged: number };
  weighted: { precision: number | null; recall: number | null; f1: number | null };
  per_class: PerClassMetric[];
  most_confused: { true: string; true_display: string; predicted: string; predicted_display: string; count: number; share_of_true: number | null }[];
  confusion_matrix: { labels: string[]; display_labels: string[]; matrix: number[][]; rows: string; columns: string };
  classes_without_test_images: string[];
  classes_never_predicted: string[];
  definitions: Record<string, string>;
}

export interface DeployBlock {
  code: string;
  message: string;
  overridable: boolean;
}

export interface ModelSummary {
  id: string;
  name: string;
  version: string;
  training_job_id: string;
  dataset_version_id: string;
  split_id: string;
  architecture: string;
  framework: string;
  framework_version: string | null;
  status: ModelStatus;
  status_detail: string | null;
  class_count: number;
  classes: ModelClass[];
  config: TrainingConfig;
  preprocessing: Record<string, unknown> | null;
  augmentation: Record<string, unknown> | null;
  training_images: number | null;
  validation_images: number | null;
  test_images: number | null;
  epochs_configured: number | null;
  epochs_completed: number | null;
  batch_size: number | null;
  learning_rate: number | null;
  image_size: number | null;
  random_seed: number | null;
  test_accuracy: number | null;
  precision_macro: number | null;
  recall_macro: number | null;
  f1_macro: number | null;
  precision_weighted: number | null;
  recall_weighted: number | null;
  f1_weighted: number | null;
  top3_accuracy?: number | null;
  model_sha256: string | null;
  model_bytes: number | null;
  training_duration_s: number | null;
  created_by: string;
  created_at: string;
  trained_at: string | null;
  archived_at: string | null;
  dataset_version: string;
  dataset_name: string;
  dataset_id: string;
  permission_status: PermissionStatus;
  permission_label: string;
  permission_warning: string | null;
  job_number: number;
  best_epoch: number | null;
  early_stopped: number;
  train_device: string | null;
  train_device_name: string | null;
  split_strategy: Split['strategy'];
  split_seed: number | null;
  deployment_count: number;
  active_deployment_id: string | null;
  is_active: boolean;
  deploy_block: DeployBlock | null;
}

export interface Deployment {
  id: string;
  number: number;
  model_id: string | null;
  environment: string;
  action: 'deploy' | 'rollback';
  status: 'active' | 'superseded';
  deployed_by: string;
  deployed_at: string;
  ended_at: string | null;
  previous_deployment_id: string | null;
  permission_override: number;
  override_by: string | null;
  override_at: string | null;
  override_reason: string | null;
  note: string | null;
  model_version?: string;
  model_name?: string;
  model_status?: ModelStatus;
  dataset_version?: string;
  dataset_name?: string;
}

export interface ModelDetail extends ModelSummary {
  evaluation: Evaluation | null;
  deployments: Deployment[];
  artifact_present: boolean;
}

export interface ActiveDeployment {
  deployment_id: string;
  number: number;
  deployed_at: string;
  model_id: string;
  version: string;
  name: string;
  dataset_version: string;
  dataset_name: string;
}

export interface DeploymentState {
  environment: string;
  active: ActiveDeployment | null;
  history: Deployment[];
  rollback_target: { deployment_id: string; deployment_number: number; model_id: string; model_version: string } | null;
  confidence_threshold: number;
}

export interface PredictionItem {
  class_id: string;
  display_name: string;
  crop: string | null;
  is_healthy: boolean;
  probability: number;
}

export interface PredictionResult {
  status: 'ok' | 'uncertain';
  uncertain: boolean;
  prediction: Omit<PredictionItem, 'probability'> & { confidence: number };
  top_predictions: PredictionItem[];
  threshold: number;
  model: { model_id: string; model_version: string; name: string; architecture: string; dataset_name: string | null; dataset_version: string | null };
  metadata: { inference_ms: number; input_size: number; image: { width: number; height: number } };
  notice: string;
  prediction_id: string;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
}

export interface Overview {
  active: ActiveDeployment | null;
  active_model: Pick<ModelSummary, 'id' | 'name' | 'version' | 'status' | 'class_count' | 'test_accuracy' | 'f1_macro' | 'architecture' | 'dataset_name' | 'dataset_version' | 'trained_at'> | null;
  model_counts: Partial<Record<ModelStatus, number>>;
  dataset_counts: Partial<Record<DatasetStatus, number>>;
  last_training_completed_at: string | null;
  recent_jobs: TrainingJob[];
  dataset_warnings: { dataset_version_id: string; dataset_name: string; version: string; status: DatasetStatus; warnings: ValidationWarning[] }[];
  worker: WorkerStatus;
  confidence_threshold: number;
  predictions_7d: { count: number; uncertain: number; avg_inference_ms: number | null };
  limits: { max_upload_bytes: number };
}

export interface AdminIdentity {
  name: string;
  method: 'key' | 'supabase';
}
