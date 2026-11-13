import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type QueryValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>;
export type Query = Record<string, QueryValue>;

// The only place that talks to HttpClient. Paths are relative to environment.apiBaseUrl.
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http.get<T>(this.url(path), { params: this.toParams(query) });
  }

  post<T>(path: string, body: unknown = null, query?: Query): Observable<T> {
    return this.http.post<T>(this.url(path), body, { params: this.toParams(query) });
  }

  put<T>(path: string, body: unknown = null): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }

  delete<T = void>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path));
  }

  // Binary download (Excel). The interceptor still adds the Bearer header.
  getBlob(path: string, query?: Query): Observable<HttpResponse<Blob>> {
    return this.http.get(this.url(path), { params: this.toParams(query), responseType: 'blob', observe: 'response' });
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }

  // Empty values are left out; arrays repeat the key (?skills=Java&skills=Angular).
  private toParams(query?: Query): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === null || value === undefined || value === '') {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          params = params.append(key, String(item));
        }
      } else {
        params = params.set(key, String(value));
      }
    }
    return params;
  }
}
