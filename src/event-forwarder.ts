import { from, interval, Observable, Subscription } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import { webSocket } from 'rxjs/webSocket';
import { ForwarderConfig, RequestConfig } from './types';
import { mergeHeaders, validateInput } from './utils';

/**
 * EventForwarder handles the forwarding of events from various sources to webhooks.
 * It supports WebSocket connections, HTTP polling, and custom event sources.
 */
export class EventForwarder<TRequest, TInput, TOutput = TInput> {
  private subs: Record<string, Subscription | (() => void)> = {};
  private async shouldProcessEvent(
    id: string,
    config: ForwarderConfig<TRequest, TInput, TOutput>
  ): Promise<boolean> {
    if (!config.shouldFetch) {
      return true;
    }

    const resolvedBody = config.requestConfig?.body
      ? await Promise.resolve(config.requestConfig.body)
      : undefined;

    const should = await Promise.resolve(config.shouldFetch(resolvedBody));
    if (!should) {
      console.log(
        `[${id}] Skipping event processing based on shouldFetch condition`
      );
    }
    return should;
  }

  private createCustomStream(
    config: ForwarderConfig<TRequest, TInput, TOutput>
  ): Observable<unknown> {
    if (!config.createStream) {
      throw new Error('createStream is required for custom sources');
    }
    return from(config.createStream());
  }

  private createWebSocketStream(
    id: string,
    config: ForwarderConfig<TRequest, TInput, TOutput>
  ): Observable<TInput> {
    if (!config.sourceUrl) {
      throw new Error('sourceUrl is required for websocket sources');
    }

    const ws = webSocket<TInput>({
      url: config.sourceUrl,
      deserializer: (msg: MessageEvent): TInput => {
        try {
          return validateInput<TInput>(JSON.parse(msg.data));
        } catch (error) {
          console.error(`[${id}] WebSocket parse error:`, error);
          throw error;
        }
      }
    });

    return ws.pipe(
      catchError((error: Error) => {
        console.error(`[${id}] WebSocket error:`, error);
        throw error;
      }),
      retry({
        delay: (_error: Error, retryCount: number) => {
          console.log(`[${id}] Retrying connection... attempt ${retryCount}`);
          return new Observable((subscriber) => {
            setTimeout(() => subscriber.complete(), 5000);
          });
        },
        count: 3
      })
    );
  }

  private async defaultFetch(
    id: string,
    url: string,
    config: RequestConfig<TRequest>
  ): Promise<TInput> {
    if (!url) {
      throw new Error('URL is required for fetch');
    }

    const headers = mergeHeaders(
      { 'Content-Type': 'application/json' },
      config.headers
    );

    const fetchOptions: RequestInit = {
      method: config.method || 'GET',
      headers
    };

    if (config.body !== undefined) {
      const resolvedBody = await Promise.resolve(config.body);
      fetchOptions.body = JSON.stringify(resolvedBody);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(
        `${response.status}: ${new URL(url).pathname}: ${await response.text()}`
      );
    }

    const data = await response.json();
    return validateInput<TInput>(data);
  }

  private createPollingStream(
    id: string,
    config: ForwarderConfig<TRequest, TInput, TOutput>
  ): Observable<TInput> {
    if (!config.pollInterval) {
      throw new Error('Poll interval is required for polling sources');
    }

    if (!config.sourceUrl) {
      throw new Error('sourceUrl is required for polling');
    }

    const fetchFn = config.customFetch || this.defaultFetch.bind(this);

    return new Observable<TInput>((subscriber) => {
      const subscription = interval(config.pollInterval).subscribe(async () => {
        try {
          const should = await this.shouldProcessEvent(id, config);
          if (!should) {
            console.log(
              `[${id}] Skipping fetch based on shouldFetch condition`
            );
            return;
          }

          // Ensure sourceUrl is defined before passing to fetchFn
          if (!config.sourceUrl) {
            throw new Error('sourceUrl is required for polling');
          }

          const result = await fetchFn(
            id,
            config.sourceUrl,
            config.requestConfig || { headers: {} }
          );
          subscriber.next(result);
        } catch (error) {
          console.error(`[${id}] Polling error:`, error);
          subscriber.error(error);
        }
      });

      return () => subscription.unsubscribe();
    });
  }

  private async forwardToWebhook(
    id: string,
    webhookUrl: string,
    data: TOutput
  ): Promise<void> {
    try {
      const resolvedData = await Promise.resolve(data);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolvedData)
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status}`);
      }
    } catch (error) {
      console.error(`[${id}] Error forwarding to webhook:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to an event source and start forwarding events to the webhook.
   * @param id Unique identifier for this subscription
   * @param config Configuration for the event source and webhook
   * @returns The subscription ID
   */
  subscribe(
    id: string,
    config: ForwarderConfig<TRequest, TInput, TOutput>
  ): string {
    if (this.subs[id]) {
      console.log(
        `[${id}] Cleaning up existing subscription before resubscribing`
      );
      this.unsubscribe(id);
    }

    if (config.type === 'custom') {
      const observable = from(
        (
          config.createStream ??
          (() => {
            throw new Error(
              `[${id}] createStream is required for custom sources`
            );
          })
        )()
      );

      const subscription = observable.subscribe({
        next: async (result) => {
          if (result instanceof Observable) {
            const streamSub = result.subscribe({
              next: async (data: TInput) => {
                try {
                  const should = await this.shouldProcessEvent(id, config);
                  if (!should) {
                    console.log(
                      `[${id}] Skipping process based on shouldFetch condition`
                    );
                    return;
                  }

                  let transformedData: TOutput;
                  if (config.transform) {
                    transformedData = await Promise.resolve(
                      config.transform(data)
                    );
                  } else {
                    transformedData = data as unknown as TOutput;
                  }
                  await this.forwardToWebhook(
                    id,
                    config.webhookUrl,
                    transformedData
                  );
                } catch (error) {
                  console.error(`[${id}] Error processing data:`, error);
                }
              },
              error: (error: Error) =>
                console.error(`[${id}] Stream error:`, error)
            });
            this.subs[id] = streamSub;
          } else if (typeof result === 'function') {
            this.subs[id] = result;
          }
        },
        error: (error: Error) =>
          console.error(`[${id}] Custom stream setup error:`, error)
      });

      if (!this.subs[id]) {
        this.subs[id] = subscription;
      }
    } else {
      const stream$ =
        config.type === 'websocket'
          ? this.createWebSocketStream(id, config)
          : this.createPollingStream(id, config);

      const subscription = stream$.subscribe({
        next: async (data: TInput) => {
          try {
            const should = await this.shouldProcessEvent(id, config);
            if (!should) {
              console.log(
                `[${id}] Skipping process based on shouldFetch condition`
              );
              return;
            }

            let transformedData: TOutput;
            if (config.transform) {
              transformedData = await Promise.resolve(config.transform(data));
            } else {
              transformedData = data as unknown as TOutput;
            }
            await this.forwardToWebhook(id, config.webhookUrl, transformedData);
          } catch (error) {
            console.error(`[${id}] Error processing data:`, error);
          }
        },
        error: (error: Error) => console.error(`[${id}] Stream error:`, error)
      });

      this.subs[id] = subscription;
    }

    return id;
  }

  /**
   * Unsubscribe and clean up a specific forwarder by ID.
   * @param id The subscription ID to unsubscribe
   */
  unsubscribe(id: string): void {
    const sub = this.subs[id];
    if (sub) {
      if (typeof sub === 'function') {
        sub();
      } else {
        sub.unsubscribe();
      }
      delete this.subs[id];
    }
  }

  /**
   * Unsubscribe and clean up all forwarders.
   */
  unsubscribeAll(): void {
    Object.keys(this.subs).forEach((id) => this.unsubscribe(id));
  }
}
