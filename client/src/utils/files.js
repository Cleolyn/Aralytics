/**
 * Read a File as base64 (without the data: URL prefix) for JSON upload payloads.
 * @param {File} file
 * @param {{ onProgress?: (fraction: number) => void, errorMessage?: string }} [options]
 * @returns {Promise<string>}
 */
export function readFileAsBase64(file, { onProgress, errorMessage = 'Could not read file.' } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (onProgress) {
      reader.onprogress = event => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
    }
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error(errorMessage));
    reader.readAsDataURL(file);
  });
}

/** "12 KB" style size label. */
export const fileSizeLabel = file => `${(file.size / 1024).toFixed(0)} KB`;
