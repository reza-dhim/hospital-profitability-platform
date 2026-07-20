/** Triggers a browser save-as for an in-memory `Blob` — the only way to hand an authenticated fetch's response to the user, since a plain `<a href>` can't carry the Bearer token this app's API requires. */
export function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
