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
  created_at: string;
}

export type FileType = "STL" | "3MF" | "GCODE" | "OBJ" | "STEP" | "AMF" | "OTHER";

export interface ModelFile {
  id: number;
  model_id: number;
  filename: string;
  original_filename: string;
  file_type: FileType;
  file_path: string;
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
