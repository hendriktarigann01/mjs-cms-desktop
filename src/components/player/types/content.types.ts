// Content Forms
export type ContentForm = "upload" | "web_link" | "web_html_js";
export type FormatName =
  | "png"
  | "jpeg"
  | "jpg"
  | "webp"
  | "mp4"
  | "url"
  | "zip";

// Config Types
export interface WebHtmlConfig {
  mainFile: string;
  refreshInterval: number;
}

export interface WebLinkConfig {
  url: string;
  refreshInterval: number;
}

// Content Model
export interface Content {
  content_id: number;
  node_id: number;
  uid: number;
  form: ContentForm;
  format_name: FormatName;
  filename: string;
  duration: number | null;
  filesize: number;
  upload_file: string | null;
  converted_webp: string | null;
  web_html_config: WebHtmlConfig | null;
  web_link_config: WebLinkConfig | null;
  updated_at: string;
  created_at: string;
  node?: {
    node_id: number;
    parent_id: number;
    uid: number;
  };
  user?: {
    uid: number;
    email: string;
  };
}

export interface MinimalContent {
  content_id: number;
  filename: string;
  form: string;
  format_name: string | null;
  duration: number | null;
  filesize: number | null;
  upload_file: string | null;
  converted_webp?: string | null;
  web_html_config: WebHtmlConfig | null;
  web_link_config: WebLinkConfig | null;
}

// Request Types
export interface UploadFileRequest {
  file?: File | Blob;
  files?: (File | Blob)[];
  filename?: string;
  duration?: number;
}

export interface CreateWebLinkRequest {
  filename: string;
  url: string;
  refreshInterval: number;
}

export interface UploadWebHtmlRequest {
  file: File;
  filename: string;
  mainFile?: string;
  refreshInterval?: number;
}

export interface UpdateContentRequest {
  filename?: string;
  duration?: number;
  webHtmlConfig?: WebHtmlConfig;
  webLinkConfig?: WebLinkConfig;
}

export interface BulkDeleteRequest {
  contentIds: number[];
}

export interface GetContentsQuery {
  page?: number;
  limit?: number;
  form?: ContentForm;
  search?: string;
}

// Response Types
export interface ContentResponse {
  success: boolean;
  message: string;
  data: {
    contents: Array<{
      content: Content;
      fileUrl: string;
    }>;
    count: number;
  };
}

export interface ContentsListResponse {
  success: boolean;
  data: {
    contents: Content[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    stats: {
      totalContents: number;
      totalSize: number;
    };
  };
}

export interface ContentStatisticsResponse {
  success: boolean;
  data: {
    total: {
      totalContents: number;
      totalSize: number;
    };
    byForm: Array<{
      form: ContentForm;
      _count: { content_id: number };
      _sum: { filesize: number };
    }>;
    byFormat: Array<{
      format_name: FormatName;
      _count: { content_id: number };
      _sum: { filesize: number };
    }>;
  };
}

export interface BulkDeleteResponse {
  success: boolean;
  message: string;
  data: {
    deletedCount: number;
  };
}

export interface MessageResponse {
  success: boolean;
  message: string;
}
