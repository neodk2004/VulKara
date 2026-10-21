// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Sharing a result and copying a picture, in the app and in the remote web UI. In the app: macOS's share menu and the
// clipboard, through the main process. In a browser: the device's own share sheet (WhatsApp, Signal, Telegram, Threema,
// Mail, Copy …) and clipboard, which phones and browsers offer only on a secure (HTTPS) page; elsewhere the buttons are
// not shown rather than shown and failing.
import { isRemote } from './remote_vk'

const remote = isRemote()

/** The file of a result as a File object (fetched from the Mac through the web UI's /file). */
async function fileOf(path: string): Promise<File> {
  const blob = await (await fetch(window.vk.files.url(path))).blob()
  return new File([blob], path.split('/').pop() ?? 'picture.png', { type: blob.type })
}

/** Can a result be shared here? In the app always; in a browser when it has a share sheet for files. */
export const canShare = (): boolean =>
  !remote || (window.isSecureContext && typeof navigator.share === 'function' && typeof navigator.canShare === 'function')

/** Can a picture be put on the clipboard here? In the app always; in a browser on a secure page. */
export const canCopyImage = (): boolean =>
  !remote || (window.isSecureContext && typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write)

export async function sharePicture(path: string): Promise<void> {
  if (!remote) {
    await window.vk.files.share(path)
    return
  }
  const file = await fileOf(path)
  if (!navigator.canShare({ files: [file] })) return
  try {
    await navigator.share({ files: [file] })
  } catch {
    // closed without choosing: nothing to do
  }
}

/** true when the picture is on the clipboard */
export async function copyPicture(path: string): Promise<boolean> {
  if (!remote) return window.vk.files.copyImage(path)
  // browsers take pictures on the clipboard as PNG only; the write starts at once with the picture still on its way,
  // since Safari allows it only within the tap itself
  const png = fileOf(path).then((file) => (file.type === 'image/png' ? file : toPng(file)))
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    return true
  } catch {
    return false
  }
}

async function toPng(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}
