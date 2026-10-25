import type { HostTool } from "durable-harness";

export type Charge = { step?: string; amount: number; memo: string; pid: number; at: number };

export const CHARGE_CONFIRM_MS = Number(process.env.CHARGE_CONFIRM_MS ?? 3000);

export function chargeTool(record: (charge: Charge) => Promise<void> | void): HostTool<{ amount: number; memo: string }> {
  return {
    name: "charge",
    description: "Charges the user an amount in US dollars, with a memo.",
    inputSchema: { type: "object", properties: { amount: { type: "number" }, memo: { type: "string" } }, required: ["amount", "memo"], additionalProperties: false },
    replay: "never",
    async execute({ amount, memo }, io) {
      await record({ step: io.stepId, amount, memo, pid: process.pid, at: Date.now() });
      await pause(CHARGE_CONFIRM_MS, io.signal);
      return `charged $${amount.toFixed(2)} for ${memo} (reference ${io.stepId?.slice(-8)})`;
    },
  };
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
