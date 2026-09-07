export type LensPipelineStatus = "provider_unconfigured" | "provider_failed" | "no_supported_social_results" | "ready";

export function lensStatusLabel(status: LensPipelineStatus) {
  return status.replaceAll("_", " ");
}

export function lensStatusTone(status: LensPipelineStatus) {
  if (status === "ready") return "success" as const;
  if (status === "provider_failed" || status === "provider_unconfigured") return "error" as const;
  return "warning" as const;
}

export function lensStatusDescription(status: LensPipelineStatus) {
  switch (status) {
    case "provider_unconfigured":
      return "Automated reverse-image search is not configured. Add the server-side provider key before searching.";
    case "provider_failed":
      return "The automated reverse-search provider could not complete the request. No result was fabricated.";
    case "no_supported_social_results":
      return "The provider returned genuine results, but none matched the supported public social-platform domains.";
    case "ready":
      return "The backend normalized genuine provider candidates for face comparison and human review.";
  }
}
