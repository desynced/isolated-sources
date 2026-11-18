import type { NameModel, NameSpan } from "./types.js";

/**
 * Placeholder for a future Transformers.js / ONNX person-name model.
 * It loads nothing and finds nothing. Hosts pass their own `NameModel`
 * to `scrub` when a local model is available. Implementations must not
 * make network calls.
 */
export class StubNameModel implements NameModel {
  readonly id = "stub-name-model";

  detect(_text: string): readonly NameSpan[] {
    return [];
  }
}
