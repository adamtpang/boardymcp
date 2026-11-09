import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

export function listenHttp(
  host: string,
  port: number,
  onRequest: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
): Promise<RunningServer> {
  const server = createServer((req, res) => {
    void Promise.resolve(onRequest(req, res)).catch((error: unknown) => {
      if (res.headersSent) return;
      const message = error instanceof Error ? error.message : "Unexpected error";
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "upstream", detail: message }));
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actual = typeof address === "object" && address ? address.port : port;
      resolve({
        port: actual,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
