# 🪝 HookTuah
*"Forward to that thang~!"*

[![npm version](https://img.shields.io/npm/v/hooktuah.svg)](https://www.npmjs.com/package/hooktuah)
[![License](https://img.shields.io/npm/l/hooktuah.svg)](https://github.com/bewinxed/hooktuah/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/hooktuah.svg)](https://www.npmjs.com/package/hooktuah)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-Compatible-black)](https://bun.sh)

I was building a price tracking service, Some services I was using did not offer webhooks as a feature, And some did not have a Websocket connection, This library allows you to turn any event source and post it to a webhook endpoint.

## 🌟 Features

- 📡 Multiple event source types supported:
  - WebSocket connections
  - HTTP polling with customizable intervals
  - Custom event streams
- 🔄 Automatic retry mechanisms for connection failures
- 🎯 Event transformation and filtering
- 💪 Type-safe with full TypeScript support
- 🧪 Comprehensive test coverage
- 🔌 Easy to integrate with existing systems

## 📦 Installation

```bash
# Using npm
npm install hooktuah

# Using yarn
yarn add hooktuah

# Using bun
bun add hooktuah
```

## 🚀 Quick Start

```typescript
import { EventForwarder } from 'hooktuah';

// Create a new forwarder instance
const forwarder = new EventForwarder<RequestType, InputType, OutputType>();

// Subscribe to events
forwarder.subscribe('my-source', {
  type: 'websocket',
  sourceUrl: 'wss://my-source.com/events',
  webhookUrl: 'https://my-webhook.com/endpoint',
  transform: (data) => {
    // Transform your data before forwarding
    return transformedData;
  }
});
```

## 📖 Usage Examples

### WebSocket Source

```typescript
const forwarder = new EventForwarder<void, SensorData, TransformedData>();

forwarder.subscribe('sensor-stream', {
  type: 'websocket',
  sourceUrl: 'wss://sensors.example.com/stream',
  webhookUrl: 'https://api.example.com/webhook',
  transform: (data) => ({
    id: data.deviceId,
    tempCelsius: data.temperature,
    tempFahrenheit: (data.temperature * 9) / 5 + 32,
    readingTime: new Date(data.timestamp).toISOString()
  })
});
```

### HTTP Polling

```typescript
forwarder.subscribe('api-poll', {
  type: 'polling',
  sourceUrl: 'https://api.example.com/data',
  webhookUrl: 'https://webhook.site/your-endpoint',
  pollInterval: 5000, // 5 seconds
  shouldFetch: async () => {
    // Conditionally fetch based on your requirements
    return true;
  }
});
```

### Custom Event Stream

```typescript
forwarder.subscribe('custom-source', {
  type: 'custom',
  webhookUrl: 'https://your-webhook.com/endpoint',
  createStream: async () => {
    return new Observable((subscriber) => {
      // Your custom event source logic here
      return () => {
        // Cleanup logic
      };
    });
  }
});
```

## 🔧 Configuration Options

The `ForwarderConfig` interface supports the following options:

- `type`: 'websocket' | 'polling' | 'custom'
- `sourceUrl`: URL for the event source
- `webhookUrl`: Destination webhook URL
- `transform`: Optional data transformation function
- `pollInterval`: Required for polling sources
- `shouldFetch`: Optional condition for processing events
- `requestConfig`: Optional HTTP request configuration
- `createStream`: Required for custom sources

## 🧪 Testing

```bash
# Run tests
bun test

# Run tests with coverage
bun test --coverage
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [RxJS](https://rxjs.dev/)
- Tested with [Bun](https://bun.sh)
- Inspired by the need for robust event forwarding in modern applications

---

Made with ❤️ by Bewinxed

*Don't forget to give this project a ⭐ if you found it helpful!*