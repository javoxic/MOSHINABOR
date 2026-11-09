export interface SmsSendRequest {
  /** E.164 phone number. */
  to: string;
  text: string;
  /** Opaque reference passed back by delivery callbacks where supported. */
  reference: string;
}

export interface SmsSendResult {
  providerMessageId: string | null;
  /** Provider accepted the message for delivery. Final delivery may be reported later via callback. */
  accepted: true;
}

export class SmsProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly providerCode?: string,
  ) {
    super(message);
    this.name = 'SmsProviderError';
  }
}

export interface SmsProvider {
  readonly name: string;
  /** True when all credentials required to call the provider are present. */
  isConfigured(): boolean;
  send(request: SmsSendRequest): Promise<SmsSendResult>;
}
