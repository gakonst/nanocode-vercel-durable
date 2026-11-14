import { nanocode } from "@/lib/agent";

export const maxDuration = 300;

const instance = { id: crypto.randomUUID().slice(0, 8), served: 0 };

export const { GET } = nanocode;

export async function POST(request: Request): Promise<Response> {
  const served = instance.served++;
  const response = await nanocode.POST(request);
  if (response.status < 200) return response;
  const headers = new Headers(response.headers);
  headers.set("x-nanocode-instance", `${instance.id};${served};${Math.round(performance.now())}`);
  return new Response(response.body, { headers, status: response.status, statusText: response.statusText });
}
