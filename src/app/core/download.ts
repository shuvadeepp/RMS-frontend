import { HttpResponse } from '@angular/common/http';

// Saves a blob response as a file, using the server's file name when it sends one.
export function saveBlob(response: HttpResponse<Blob>, fallbackName: string): void {
  const blob = response.body;
  if (!blob) return;
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
