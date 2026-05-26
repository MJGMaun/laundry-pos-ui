/**
 * usePrinter — unified BLE printer composable
 *
 * On native (Capacitor Android/iOS): uses @capacitor-community/bluetooth-le
 * On web/PWA:                        uses Web Bluetooth API (Chrome only, HTTPS)
 *
 * The ESC/POS byte payload from escpos.js is identical in both paths.
 */

import { ref, readonly } from 'vue'
import { Capacitor } from '@capacitor/core'

// ─── singleton state ────────────────────────────────────────────────────────
const connected  = ref(false)
const deviceName = ref(null)

// native path state
let _nativeDeviceId = null

// web path state
let _webChar = null

// ─── BLE service/characteristic UUIDs to probe (common thermal printer chips)
const CANDIDATES = [
  // ISSC (iWRAP / common Chinese BLE printers)
  ['49535343-fe7d-4ae5-8fa9-9fafd205e455', '49535343-8841-43f4-a8d4-ecbe34729bb3'],
  // FF00 (generic)
  ['0000ff00-0000-1000-8000-00805f9b34fb', '0000ff02-0000-1000-8000-00805f9b34fb'],
  // 18F0 (Epson-compatible)
  ['000018f0-0000-1000-8000-00805f9b34fb', '00002af1-0000-1000-8000-00805f9b34fb'],
]

const CHUNK_SIZE   = 20   // max BLE write without response chunk
const CHUNK_DELAY  = 30   // ms between chunks

// ─── helpers ────────────────────────────────────────────────────────────────
function isNative() {
  return Capacitor.isNativePlatform()
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ─── NATIVE path (Capacitor BLE) ────────────────────────────────────────────
async function nativeConnect() {
  const { BleClient } = await import('@capacitor-community/bluetooth-le')

  await BleClient.initialize({ androidNeverForLocation: true })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Scan timed out')), 15_000)

    BleClient.requestDevice({
      optionalServices: CANDIDATES.map(([s]) => s),
    })
      .then(async device => {
        clearTimeout(timeout)
        try {
          await BleClient.connect(device.deviceId, () => {
            // disconnected callback
            connected.value  = false
            deviceName.value = null
            _nativeDeviceId  = null
          })

          // probe for a writable characteristic
          let foundSvc  = null
          let foundChar = null
          for (const [svcUUID, charUUID] of CANDIDATES) {
            try {
              const svcs = await BleClient.getServices(device.deviceId)
              const svc  = svcs.find(s => s.uuid.toLowerCase() === svcUUID.toLowerCase())
              if (!svc) continue
              const ch = svc.characteristics.find(
                c => c.uuid.toLowerCase() === charUUID.toLowerCase()
              )
              if (ch) {
                foundSvc  = svcUUID
                foundChar = charUUID
                break
              }
            } catch { /* try next */ }
          }

          if (!foundChar) throw new Error('No writable characteristic found on this printer')

          _nativeDeviceId  = device.deviceId
          connected.value  = true
          deviceName.value = device.name || device.deviceId
          resolve(true)
        } catch (e) {
          reject(e)
        }
      })
      .catch(e => {
        clearTimeout(timeout)
        reject(e)
      })
  })
}

async function nativePrint(bytes /* Uint8Array */) {
  const { BleClient, dataViewToNumbers } = await import('@capacitor-community/bluetooth-le')

  // find the characteristic that actually exists on the connected device
  const svcs = await BleClient.getServices(_nativeDeviceId)
  let foundSvc  = null
  let foundChar = null
  for (const [svcUUID, charUUID] of CANDIDATES) {
    const svc = svcs.find(s => s.uuid.toLowerCase() === svcUUID.toLowerCase())
    if (!svc) continue
    const ch  = svc.characteristics.find(c => c.uuid.toLowerCase() === charUUID.toLowerCase())
    if (ch) { foundSvc = svcUUID; foundChar = charUUID; break }
  }
  if (!foundChar) throw new Error('Printer characteristic not found')

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE)
    const dv    = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    try {
      await BleClient.writeWithoutResponse(_nativeDeviceId, foundSvc, foundChar, dv)
    } catch {
      await BleClient.write(_nativeDeviceId, foundSvc, foundChar, dv)
    }
    await sleep(CHUNK_DELAY)
  }
}

async function nativeDisconnect() {
  if (!_nativeDeviceId) return
  try {
    const { BleClient } = await import('@capacitor-community/bluetooth-le')
    await BleClient.disconnect(_nativeDeviceId)
  } catch { /* ignore */ }
  _nativeDeviceId  = null
  connected.value  = false
  deviceName.value = null
}

// ─── WEB path (Web Bluetooth API) ───────────────────────────────────────────
async function webConnect() {
  if (!navigator.bluetooth) {
    throw new Error(
      'Web Bluetooth is not available. ' +
      'Use Chrome/Edge on desktop or Android. ' +
      'If on HTTP, go to chrome://flags/#unsafely-treat-insecure-origin-as-secure and allowlist this URL.'
    )
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: CANDIDATES.map(([s]) => s),
  })

  device.addEventListener('gattserverdisconnected', () => {
    connected.value  = false
    deviceName.value = null
    _webChar         = null
  })

  const server = await device.gatt.connect()
  let found    = null

  for (const [svcUUID, charUUID] of CANDIDATES) {
    try {
      const svc = await server.getPrimaryService(svcUUID)
      found     = await svc.getCharacteristic(charUUID)
      break
    } catch { /* try next */ }
  }

  if (!found) throw new Error('No writable characteristic found on this printer')

  _webChar         = found
  connected.value  = true
  deviceName.value = device.name
}

async function webPrint(bytes /* Uint8Array */) {
  if (!_webChar) throw new Error('Printer not connected')
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE)
    try {
      await _webChar.writeValueWithoutResponse(chunk)
    } catch {
      await _webChar.writeValue(chunk)
    }
    await sleep(CHUNK_DELAY)
  }
}

function webDisconnect() {
  try { _webChar?.service?.device?.gatt?.disconnect() } catch { /* ignore */ }
  _webChar         = null
  connected.value  = false
  deviceName.value = null
}

// ─── public API ─────────────────────────────────────────────────────────────
export function usePrinter() {
  async function connect() {
    try {
      if (isNative()) {
        await nativeConnect()
      } else {
        await webConnect()
      }
      return true
    } catch (e) {
      console.error('[usePrinter] connect error:', e)
      return false
    }
  }

  async function print(bytes /* Uint8Array */) {
    if (isNative()) {
      await nativePrint(bytes)
    } else {
      await webPrint(bytes)
    }
  }

  function disconnect() {
    if (isNative()) {
      nativeDisconnect()
    } else {
      webDisconnect()
    }
  }

  return {
    connected:  readonly(connected),
    deviceName: readonly(deviceName),
    connect,
    print,
    disconnect,
  }
}
