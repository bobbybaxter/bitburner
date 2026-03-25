/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export interface EventSource {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}
export interface PostMessageWithOrigin {
  postMessage(message: unknown, targetOrigin: string, transfer?: Transferable[]): void;
}
export interface Endpoint extends EventSource {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  start?: () => void;
}
/** Discriminators for wire payloads (string literals avoid const-enum / unused-member lint issues). */
export type WireValueType = 'RAW' | 'PROXY' | 'THROW' | 'HANDLER';
export interface RawWireValue {
  id?: string;
  type: 'RAW';
  value: unknown;
}
export interface HandlerWireValue {
  id?: string;
  type: 'HANDLER';
  name: string;
  value: unknown;
}
export type WireValue = RawWireValue | HandlerWireValue;
export type MessageID = string;
export type MessageType = 'GET' | 'SET' | 'APPLY' | 'CONSTRUCT' | 'ENDPOINT' | 'RELEASE';
export interface GetMessage {
  id?: MessageID;
  type: 'GET';
  path: string[];
}
export interface SetMessage {
  id?: MessageID;
  type: 'SET';
  path: string[];
  value: WireValue;
}
export interface ApplyMessage {
  id?: MessageID;
  type: 'APPLY';
  path: string[];
  argumentList: WireValue[];
}
export interface ConstructMessage {
  id?: MessageID;
  type: 'CONSTRUCT';
  path: string[];
  argumentList: WireValue[];
}
export interface EndpointMessage {
  id?: MessageID;
  type: 'ENDPOINT';
}
export interface ReleaseMessage {
  id?: MessageID;
  type: 'RELEASE';
}
export type Message = GetMessage | SetMessage | ApplyMessage | ConstructMessage | EndpointMessage | ReleaseMessage;
