import { ref, readonly } from 'vue'

// Singleton state — connection persists across component mounts
const connected  = ref(false)
const deviceName = ref(null)
const _char      = ref(null)

// Service/char pairs to try in order (ISSC → FF00 → 18F0)
const CANDIDATES = [
  ['49535343-fe7d-4ae5-8fa9-9fafd205e455', '49535343-8841-43f4-a8d4-ecbe34729bb3'],
  ['0000ff00-0000-1000-8000-00805f9b34fb', '0000ff02-0000-1000-8000-00805f9b34fb'],
  ['000018f0-0000-1000-8000-00805f9b34fb', '00002af1-0000-1000-8000-00805f9b34fb'],
]

export function usePrinter() {
  async function connect() {
    try {
      if (!navigator.bluetooth) {
        throw new Error(
          'Web Bluetooth is not available. Make sure the site is served over HTTPS and you are using Chrome or Edge.'
        )
      }
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: CANDIDATES.map(([s]) => s),
      })

      device.addEventListener('gattserverdisconnected', () => {
        connected.value  = false
        deviceName.value = null
        _char.value      = null
      })

      const server = await device.gatt.connect()
      let found = null

      for (const [svcUUID, charUUID] of CANDIDATES) {
        try {
          const svc = await server.getPrimaryService(svcUUID)
          found = await svc.getCharacteristic(charUUID)
          break
        } catch { /* try next */ }
      }

      if (!found) throw new Error('No writable characteristic found on this device')

      _char.value      = found
      connected.value  = true
      deviceName.value = device.name
      return true
    } catch (e) {
      console.error('[usePrinter] connect error:', e)
      return false
    }
  }

  async function print(bytes /* Uint8Array */) {
    if (!_char.value) throw new Error('Printer not connected')
    const CHUNK = 20
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk = bytes.slice(i, i + CHUNK)
      try {
        await _char.value.writeValueWithoutResponse(chunk)
      } catch {
        await _char.value.writeValue(chunk)
      }
      await new Promise(r => setTimeout(r, 30))
    }
  }

  function disconnect() {
    try { _char.value?.service?.device?.gatt?.disconnect() } catch { /* ignore */ }
    _char.value      = null
    connected.value  = false
    deviceName.value = null
  }

  return {
    connected:  readonly(connected),
    deviceName: readonly(deviceName),
    connect,
    print,
    disconnect,
  }
}
