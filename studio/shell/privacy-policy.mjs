// FoundrySpecification.browserTelemetryBoundary: vendor telemetry is outside browser scope.
export function browserSettings(value) {
  const { telemetryUserId: _discarded, ...settings } = value || {};
  return { ...settings, telemetryConsent: "opted_out" };
}
export function assertBrowserSettingsPatch(patch) {
  if (patch?.telemetryConsent !== undefined && patch.telemetryConsent !== "opted_out") {
    throw Object.assign(new Error("Vendor telemetry is unavailable in this browser"), { code: "browserTelemetryUnavailable" });
  }
}
