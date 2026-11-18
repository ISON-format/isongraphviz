// src/index.ts - interaction-core "." (DOM-free): the public surface of design 2. Nothing of renderer-core or scene-core is re-exported.
export { IaError } from "./errors.js";
export type { IaErrorCode } from "./errors.js";
export {
  IA_INPUT, IA_BIND, IA_NAV, IA_LASSO, DRAG_THRESHOLD_MILLI, LONG_PRESS_MS, WHEEL_NOTCH_MILLI, WHEEL_MAX_NOTCHES, ZOOM_STEP_IN, ZOOM_STEP_OUT, PAN_STEP_PX,
  COORD_MAX_MILLI, REVEAL_MARGIN_PX, validateEvent,
} from "./events.js";
export type { InputEvent, PointerType, EventTarget } from "./events.js";
export { createMachine, step, serializeMachine, parseMachine, serializeStep, prepareConfig } from "./machine.js";
export type { MachineState, MachineConfig, Output, StepResult, PointerState, Gesture } from "./machine.js";
export { DEFAULT_BINDINGS, verifyBindings, serializeBindings, keyToken, isKeyToken } from "./bindings.js";
export type { Binding, BindingAction, Dir } from "./bindings.js";
export { resolveNavigation, revealPan } from "./navigation.js";
export type { NavCommand, NavEvent } from "./navigation.js";
export { lassoTargets } from "./lasso.js";
