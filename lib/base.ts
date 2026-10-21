export const basePath = "/vercel";

export const href = (path: string) => path === "/" ? basePath : `${basePath}${path}`;
