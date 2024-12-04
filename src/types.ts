import { Observable } from 'rxjs';

export interface RequestConfig<TRequest> {
  method?: string;
  headers?: Record<string, string>;
  body?: TRequest | Promise<TRequest>;
}

export interface ForwarderConfig<TRequest, TInput, TOutput = TInput> {
  type: 'websocket' | 'poll' | 'custom';
  sourceUrl?: string;
  webhookUrl: string;
  requestConfig?: RequestConfig<TRequest>;
  pollInterval?: number;
  shouldFetch?: (context?: TRequest) => boolean | Promise<boolean>;
  customFetch?: (
    url: string,
    config: RequestConfig<TRequest>
  ) => Promise<TInput>;
  transform?: (data: TInput) => TOutput | Promise<TOutput>;
  createStream?: () => Promise<Observable<TInput> | (() => void)>;
}
