import mqtt from "mqtt";

/**
 * Same-origin broker URL, derived from the page the agent is running in.
 *
 * This is a library now, so it cannot read the host application's build-time environment.
 * An application that points at a different broker passes the URL to `getInstance`.
 */
export function defaultBrokerUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const port = window.location.protocol === "https:" ? "" : ":8083";
  return `${protocol}//${window.location.hostname}${port}/mqtt`;
}

export class MqttService {
  private static instance: MqttService;
  private client: mqtt.MqttClient;
  private messageHandlers: Set<(topic: string, message: Buffer) => void> =
    new Set();

  private constructor(brokerUrl: string) {
    const clientId = `antikythera-client-${Math.random().toString(36).substring(7)}`;
    console.log(`Initializing MQTT Service with Client ID: ${clientId}`);

    this.client = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 1000,
    });

    this.client.on("connect", () => {
      console.log("MQTT Service Connected");
    });

    this.client.on("message", (topic, message) => {
      for (const handler of this.messageHandlers) {
        handler(topic, message);
      }
    });

    this.client.on("error", (err) => console.error("MQTT Error:", err));
    this.client.on("close", () => {
      console.warn("MQTT Connection Closed");
    });
    this.client.on("offline", () => console.warn("MQTT Client Offline"));
    this.client.on("reconnect", () => console.log("MQTT Client Reconnecting"));
  }

  public static getInstance(brokerUrl?: string): MqttService {
    if (!MqttService.instance) {
      // Default to current hostname if not provided, assuming standard port 8083
      const url = brokerUrl || defaultBrokerUrl();
      MqttService.instance = new MqttService(url);
    }
    return MqttService.instance;
  }

  public async subscribe(topic: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.subscribeAsync(topic);
      console.log(`Subscribed to ${topic}`);
    } catch (err) {
      console.error(`Failed to subscribe to ${topic}:`, err);
    }
  }

  public publish(topic: string, message: Buffer | Uint8Array): void {
    if (!this.client) return;
    // mqtt.js publish accepts Buffer or Uint8Array
    this.client.publish(topic, message as Buffer);
  }

  public onMessage(handler: (topic: string, message: Buffer) => void) {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  public getClientId(): string {
    return this.client.options.clientId || "unknown";
  }

  public end() {
    if (this.client) {
      this.client.end();
    }
  }
}
