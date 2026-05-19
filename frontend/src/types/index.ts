export interface Tag {
  id: number;
  name: string;
}

export interface Printer {
  id: number;
  name: string;
  brand: string | null;
  model_name: string | null;
  build_volume_x: number | null;
  build_volume_y: number | null;
  build_volume_z: number | null;
  notes: string | null;
  moonraker_url: string | null;
  created_at: string;
}

export type FileType = "STL" | "3MF" | "GCODE" | "OBJ" | "STEP" | "AMF" | "OTHER";

export interface ModelFile {
  id: number;
  model_id: number;
  filename: string;
  original_filename: string;
  file_type: FileType;
  file_size: number | null;
  printer_id: number | null;
  printer: Printer | null;
  source_file_id: number | null;
  created_at: string;
}

export interface PrintModel {
  id: number;
  name: string;
  description: string | null;
  source_url: string | null;
  license: string | null;
  thumbnail_path: string | null;
  is_public: boolean;
  owner_id: number | null;
  created_at: string;
  updated_at: string | null;
  files: ModelFile[];
  tags: Tag[];
}

export interface PrintModelSummary {
  id: number;
  name: string;
  description: string | null;
  source_url: string | null;
  license: string | null;
  thumbnail_path: string | null;
  is_public: boolean;
  owner_id: number | null;
  created_at: string;
  tags: Tag[];
  file_count: number;
  stl_count: number;
  threemf_count: number;
  gcode_count: number;
}

export interface PaginatedModels {
  items: PrintModelSummary[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

export interface UserSettings {
  date_format: DateFormat;
}

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
  settings: UserSettings;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  user: User;
}

export interface GcodeMetadata {
  print_time?: string;
  filament_g?: number;
}

export interface FileTypeStats {
  file_type: string;
  count: number;
  bytes: number;
}

export interface ModelStorageStats {
  model_id: number;
  name: string;
  file_count: number;
  bytes: number;
}

export interface UserStorageStats {
  user_id: number;
  username: string;
  file_count: number;
  bytes: number;
}

export interface StorageStats {
  total_bytes: number;
  total_files: number;
  total_models: number;
  by_file_type: FileTypeStats[];
  top_models: ModelStorageStats[];
  by_user?: UserStorageStats[];
}

export interface ImportFile {
  name: string;
  download_url: string;
  size: number | null;
  file_type: string;
}

export interface ImportPreview {
  platform: string;
  name: string;
  description: string | null;
  source_url: string;
  license: string | null;
  tags: string[];
  files: ImportFile[];
  thumbnail_url: string | null;
}
