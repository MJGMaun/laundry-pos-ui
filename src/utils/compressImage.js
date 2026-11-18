// Shrinks a phone photo before upload: receipts only need to be legible, and
// a 4–12 MB camera image would be slow on shop wifi and fill the server disk.
export async function compressImage(file, maxSide = 1600, quality = 0.75) {
  if (!file || !file.type?.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], 'gcash-receipt.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// GCash proof rule shared by every payment form (matches the backend).
export function hasGcashProof(reference, receipt) {
  return String(reference || '').trim().length >= 4 || receipt instanceof Blob
}
