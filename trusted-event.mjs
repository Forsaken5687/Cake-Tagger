// Use the native Event brand rather than a realm-specific constructor identity.
// Firefox content-script wrappers and page Event constructors can differ.
export function isTrustedEvent(event, eventPrototype = globalThis.Event?.prototype) {
  try {
    eventPrototype.composedPath.call(event);
    return event.isTrusted === true;
  } catch { return false; }
}
