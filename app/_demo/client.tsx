"use client";

import dynamic from "next/dynamic";

export const Demo = dynamic(() => import("./demo"), { ssr: false });
