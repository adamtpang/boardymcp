import type { AppConfig } from "../config.js";
import { createSmtpMailer } from "../mail.js";
import type { BoardyBackend } from "./types.js";
import { createEmailBackend } from "./email.js";
import { createHttpBackend } from "./http.js";
import { createMockBackend } from "./mock.js";

export function createBackend(config: AppConfig): BoardyBackend {
  if (config.backend === "email") {
    return createEmailBackend({
      identity: config.identity,
      mail: config.smtp ? createSmtpMailer(config.smtp) : undefined,
    });
  }
  if (config.backend === "http") {
    return createHttpBackend({
      baseUrl: config.apiBaseUrl,
      token: config.apiToken,
      apiKey: config.apiKey,
    });
  }
  return createMockBackend();
}
