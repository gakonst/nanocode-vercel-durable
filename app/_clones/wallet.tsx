"use client";

import { Wallet } from "nanocode-ts/machines";
import { type MouseEvent, useState } from "react";
import { login, logout, useWallet } from "./account";

export function WalletButton(props: { className?: string }) {
  const wallet = useWallet();
  const [hint, setHint] = useState(false);
  if (wallet.connected) return <button className={props.className} onClick={() => void logout()} title="Log out and revoke the key" type="button">{Wallet.short(wallet.connected.address)}</button>;
  return (
    <span className="nc-wallet">
      <button className={props.className} disabled={wallet.busy} onClick={() => void login()} type="button">{wallet.busy ? "Connecting…" : "Connect Tempo Wallet"}</button>
      {(wallet.device || hint || wallet.error) && (
        <span className="nc-wallet-pop">
          {wallet.device && <a className="nc-wallet-code" href={wallet.device.verificationUriFull ?? wallet.device.verificationUri} onClick={event => setHint(guard(event))} rel="noreferrer" target="_blank">Approve code {wallet.device.userCode}</a>}
          {hint && <span className="nc-wallet-hint">⌘-click the code (Ctrl-click on Windows) to approve it in a normal tab, or open it on your phone.</span>}
          {wallet.error && <span className="nc-wallet-error">{wallet.error}</span>}
        </span>
      )}
    </span>
  );
}

export function Brand(props: { className?: string }) {
  return (
    <a className={props.className} href="https://nanocode.xyz/vercel" rel="noreferrer" target="_blank">
      <svg aria-hidden="true" height="12" viewBox="0 0 76 65" width="14"><path d="M37.5 0 75 65H0z" fill="currentColor" /></svg>
      on Vercel
    </a>
  );
}

function guard(event: MouseEvent<HTMLAnchorElement>) {
  const pointer = (event.nativeEvent as PointerEvent).pointerType;
  const mouse = pointer ? pointer === "mouse" : matchMedia("(pointer: fine)").matches;
  if (!mouse || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (!Wallet.framed() || !Wallet.sandboxed()) return false;
  event.preventDefault();
  return true;
}
