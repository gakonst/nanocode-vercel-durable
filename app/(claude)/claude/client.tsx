"use client";

import dynamic from "next/dynamic";

export const Client = dynamic(() => import("./app"), { ssr: false });
