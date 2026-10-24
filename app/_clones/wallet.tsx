"use client";

import { Wallet } from "nanocode-ts/machines";
import { login, logout, setTab, useWallet, where } from "./hand";

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
  const { hand, tab } = useWallet();
  return <button className={props.className} data-state={tab ? hand.state : "server"} onClick={() => setTab(!tab)} title={tab ? "New sessions run their Code Mode cells in this browser tab, with a fetch that pays MPP services from your wallet. Click to run them on Vercel again." : "Code Mode cells run in the Vercel Function beside the agent. Click to run a new session's cells in this tab instead, with a fetch that pays MPP services from your wallet."} type="button">{where(hand, tab)}</button>;
}

export function Brand(props: { className?: string }) {
  return (
    <a className={props.className} href="https://nanocode.xyz/vercel" rel="noreferrer" target="_blank">
      <svg aria-hidden="true" height="12" viewBox="0 0 76 65" width="14"><path d="M37.5 0 75 65H0z" fill="currentColor" /></svg>
      on Vercel
    </a>
  );
}

