export interface ApiResponse<T> {
  data: T;
  meta?: {
    fetchedAt: string;
  };
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}
