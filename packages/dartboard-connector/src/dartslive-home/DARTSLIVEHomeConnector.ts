import { DartsboardBluetoothConnector } from "../DartsboardBluetoothConnector.js"
import { format } from "./format.js"
import type { Signal } from "./Signal.js"

const uuid = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"

const hasValue = (target: unknown): target is EventTarget & { value: DataView } => {
  if (typeof target !== "object" || target == null) {
    return false
  }
  return "value" in target
}

export class DARTSLIVEHomeConnector implements DartsboardBluetoothConnector<Signal> {
  private _server: BluetoothRemoteGATTServer | null = null

  async connect() {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [uuid] }],
      })
      const { gatt } = device
      if (gatt == null) {
        return false
      }
      this._server = await gatt.connect()

      return true
    } catch (_error) {
      return false
    }
  }

  disconnect() {
    this._server?.disconnect()
    this._server = null
  }

  get isConnected() {
    return this._server?.connected ?? false
  }

  /**
   * Returns `unsubscribe` function.
   */
  async subscribe(callback: (value: Signal, raw?: { code: number; hex: string }) => void) {
    if (this._server == null) {
      throw new Error("No device has been connected. `connect` first.")
    }
    const services = [await this._server.getPrimaryService(uuid)]
    if (services.length !== 1) {
      console.error(services)
      throw new Error("`getPrimaryServices` returns unexpected services. Please create issue with error logs.")
    }
    const [service] = services
    const characteristics = await service.getCharacteristics()
    const filtered = characteristics.filter((c) => c.properties.notify)
    if (filtered.length !== 1) {
      console.error(characteristics)
      throw new Error("`getCharacteristics` returns unexpected characteristics. Please create issue with error logs.")
    }
    const [characteristic] = filtered
    const handler: CharacteristicEventHandlers["oncharacteristicvaluechanged"] = (event) => {
      const target = event.target
      if (target == null) {
        throw new Error("event.target is unexpectedly null.")
      }
      if (!hasValue(target)) {
        throw new Error("target doesn't have 'value' field unexpectedly.")
      }
      const dataview = target.value
      if (dataview.byteLength < 3) return
      const value = dataview.getUint8(2)
      const hex = Array.from(new Uint8Array(dataview.buffer, dataview.byteOffset, dataview.byteLength))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(" ")
      callback(format(value), { code: value, hex })
    }
    characteristic.addEventListener("characteristicvaluechanged", handler)
    try {
      await characteristic.startNotifications()
    } catch (error) {
      characteristic.removeEventListener("characteristicvaluechanged", handler)
      throw error
    }
    return () => characteristic.removeEventListener("characteristicvaluechanged", handler)
  }
}
