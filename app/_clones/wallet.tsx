"use client";

import { Wallet } from "nanocode-ts/machines";
import { login, logout, useWallet } from "./hand";

export function WalletButton(props: { className?: string }) {
  const wallet = useWallet();
  if (wallet.connected) return <button className={props.className} onClick={() => void logout()} title="Log out and revoke the key" type="button">{Wallet.short(wallet.connected.address)}</button>;
  return (
    <span className="nc-wallet">
      <button className={props.className} disabled={wallet.busy} onClick={() => void login()} type="button">{wallet.busy ? "Connecting…" : "Connect Tempo Wallet"}</button>
      {wallet.device && <a className="nc-wallet-code" href={wallet.device.verificationUriFull ?? wallet.device.verificationUri} rel="noreferrer" target="_blank">Approve code {wallet.device.userCode}</a>}
      {wallet.error && <span className="nc-wallet-error">{wallet.error}</span>}
    </span>
  );
}

export function HandBadge(props: { className?: string }) {
  const { hand } = useWallet();
  const label = hand.state === "attached" ? "Code runs in this tab" : hand.state === "connecting" ? "Attaching this tab…" : "Code runs on Vercel";
  return <span className={props.className} data-state={hand.state} title="The agent is durable in Vercel Functions; its Code Mode cells run in this browser tab with your wallet.">{label}</span>;
}

export function Brand(props: { className?: string }) {
  return (
    <a className={props.className} href="https://nanocode.xyz/vercel" rel="noreferrer" target="_blank">
      <svg aria-hidden="true" height="12" viewBox="0 0 76 65" width="14"><path d="M37.5 0 75 65H0z" fill="currentColor" /></svg>
      on Vercel
    </a>
  );
}

