// /auth/** uses camelCase.
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  tokenType: string;
  expiresInMs: number;
  username: string;
  fullName: string;
  role: string;
}

export interface SessionUser {
  username: string;
  fullName: string;
  role: string;
}
