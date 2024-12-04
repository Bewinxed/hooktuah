import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { EventForwarder } from './src';
import { Observable } from 'rxjs';
import { Server } from 'bun';

interface SensorData {
  deviceId: string;
  temperature: number;
  timestamp: number;
}

interface TransformedData {
  id: string;
  tempCelsius: number;
  tempFahrenheit: number;
  readingTime: string;
}

describe('EventForwarder Integration Tests', () => {
  let forwarder: EventForwarder<unknown, SensorData, TransformedData>;
  let testServer: Server;
  let receivedWebhookData: TransformedData[] = [];
  const TEST_PORT = 3333;
  const WEBHOOK_URL = `http://localhost:${TEST_PORT}/webhook`;

  beforeEach(() => {
    forwarder = new EventForwarder();
    receivedWebhookData = [];

    // Setup test server to capture webhook calls
    testServer = Bun.serve({
      port: TEST_PORT,
      websocket: {
        message() {
          // Required but not used in these tests
        }
      },
      fetch(req) {
        if (req.url.endsWith('/webhook')) {
          return req.json().then((data: TransformedData) => {
            receivedWebhookData.push(data);
            return new Response(JSON.stringify({ status: 'ok' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        }
        return new Response('Not Found', { status: 404 });
      }
    });
  });

  afterEach(() => {
    forwarder.unsubscribeAll();
    testServer.stop();
  });

  test('should handle custom event sources with transformation', async () => {
    const mockReadings: SensorData[] = [
      {
        deviceId: 'sensor-001',
        temperature: 25.0,
        timestamp: Date.now()
      }
    ];

    const mockStream = new Observable<SensorData>((subscriber) => {
      mockReadings.forEach((reading) => subscriber.next(reading));
      return () => {
        /* cleanup */
      };
    });

    forwarder.subscribe('custom-source', {
      type: 'custom',
      webhookUrl: WEBHOOK_URL,
      createStream: async () => mockStream,
      transform: (data: SensorData): TransformedData => ({
        id: data.deviceId,
        tempCelsius: data.temperature,
        tempFahrenheit: (data.temperature * 9) / 5 + 32,
        readingTime: new Date(data.timestamp).toISOString()
      })
    });

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify webhook received transformed data
    expect(receivedWebhookData.length).toBe(1);
    expect(receivedWebhookData[0]).toHaveProperty('tempCelsius', 25.0);
    expect(receivedWebhookData[0]).toHaveProperty('tempFahrenheit', 77.0);
    expect(receivedWebhookData[0]).toHaveProperty('id', 'sensor-001');
  });

  test('should handle subscription cleanup', async () => {
    let emitCount = 0;
    const mockStream = new Observable<SensorData>((subscriber) => {
      const interval = setInterval(() => {
        emitCount++;
        subscriber.next({
          deviceId: 'sensor-001',
          temperature: 25.0,
          timestamp: Date.now()
        });
      }, 50);

      return () => clearInterval(interval);
    });

    forwarder.subscribe('cleanup-test', {
      type: 'custom',
      webhookUrl: WEBHOOK_URL,
      createStream: async () => mockStream
    });

    // Wait for some emissions
    await new Promise((resolve) => setTimeout(resolve, 120));

    // Store the emission count
    const emissionsBeforeCleanup = emitCount;

    // Unsubscribe and wait
    forwarder.unsubscribe('cleanup-test');
    await new Promise((resolve) => setTimeout(resolve, 120));

    // Verify emissions stopped
    expect(emitCount).toBe(emissionsBeforeCleanup);
  });

  test('should handle conditional event processing', async () => {
    let processCount = 0;
    const mockData: SensorData = {
      deviceId: 'sensor-001',
      temperature: 25.0,
      timestamp: Date.now()
    };

    const mockStream = new Observable<SensorData>((subscriber) => {
      // Emit the same data twice with a delay
      subscriber.next(mockData);
      setTimeout(() => subscriber.next(mockData), 100);
      return () => {
        /* cleanup */
      };
    });

    await new Promise<void>((resolve) => {
      forwarder.subscribe('conditional-test', {
        type: 'custom',
        webhookUrl: WEBHOOK_URL,
        createStream: async () => mockStream,
        shouldFetch: async () => {
          const should = processCount === 0;
          processCount++;
          return should;
        }
      });

      // Give enough time for both events to be processed
      setTimeout(resolve, 300);
    });

    // Verify only first event was processed
    expect(receivedWebhookData.length).toBe(1);
    expect(processCount).toBe(2);
  });
});
