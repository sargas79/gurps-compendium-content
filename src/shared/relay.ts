/**
 * Work a player's client may not do itself, done for it by the active GM's:
 * a shot a player fires may place an area on the scene or dose tokens the
 * player doesn't own, and only the GM may write those. The module's own
 * socket (`module.<id>`, the manifest's `socket: true`) carries the request;
 * the active GM's client runs the handler registered under its key.
 *
 * A handler is told who asked, and checks it: it acts only for a user who
 * owns the actor on whose behalf it is asked (`senderOwns`).
 */

import { MODULE_ID } from "./module.js";

const CHANNEL = `module.${MODULE_ID}`;

type Handler = (payload: any, userId: string) => unknown;

const handlers = new Map<string, Handler>();
let listening = false;

/** Whether this client is the active GM's, or a GM's where none is marked active. */
export function isActiveGm(): boolean {
  const users = (game as any).users;
  const active = users?.activeGM;
  return active ? Boolean(active.isSelf) : Boolean((game as any).user?.isGM);
}

/** Whether a GM is logged in to do the work. */
const gmPresent = (): boolean => Boolean((game as any).users?.activeGM);

/** What a request asks: the handler's key and what it is given. */
export interface RelayMessage {
  key: string;
  payload: unknown;
}

/** Runs a message on this client if it is the active GM's and a handler is registered for it. */
export async function receive(message: RelayMessage, userId: string): Promise<boolean> {
  if (!isActiveGm() || !message || typeof message.key !== "string") return false;
  const handler = handlers.get(message.key);
  if (!handler) return false;
  try {
    await handler(message.payload, String(userId ?? ""));
  } catch (error) {
    console.error(`${MODULE_ID} | relayed "${message.key}" failed`, error);
  }
  return true;
}

/** Registers the handler for a key; the socket is listened to from the first registration. */
export function registerRelay(key: string, handler: Handler): void {
  handlers.set(key, handler);
  if (listening) return;
  const socket = (game as any).socket;
  if (!socket?.on) return;
  socket.on(CHANNEL, (message: RelayMessage, userId: string) => void receive(message, userId));
  listening = true;
}

/**
 * Asks for a key's work: done here on the active GM's client, sent to it from
 * anyone else's. Resolves to `here`, `sent`, or `none` where no GM is on to
 * do it.
 */
export async function relay(key: string, payload: unknown): Promise<"here" | "sent" | "none"> {
  if (isActiveGm()) {
    await receive({ key, payload }, String((game as any).user?.id ?? ""));
    return "here";
  }
  if (!gmPresent()) return "none";
  (game as any).socket?.emit(CHANNEL, { key, payload } satisfies RelayMessage);
  return "sent";
}

/** Whether the user who asked may act for a document: a GM, or one of its owners. */
export function senderOwns(document: any, userId: string): boolean {
  const user = (game as any).users?.get?.(userId);
  if (!user || !document) return false;
  if (user.isGM) return true;
  return Boolean(document.testUserPermission?.(user, "OWNER"));
}
