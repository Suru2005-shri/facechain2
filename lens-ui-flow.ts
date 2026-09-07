export type LensUiCandidate = { title: string; url: string; snippet: string; platform?: string };

export function lensSearchButtonLabel(rawResults: string) {
  return rawResults.trim() ? "Process Lens results" : "Open Google Lens";
}

export function parseLensResults(rawResults: string): Array<{ title: string; url: string; snippet?: string }> | undefined {
  if (!rawResults.trim()) return undefined;
  const parsed: unknown = JSON.parse(rawResults);
  if (!Array.isArray(parsed)) throw new Error("Lens results must be a JSON array");
  return parsed as Array<{ title: string; url: string; snippet?: string }>;
}

export function candidateEvidenceFields(candidate: LensUiCandidate) {
  return {
    title: candidate.title,
    sourceUrl: candidate.url,
    contentExcerpt: candidate.snippet,
    matchRationale: "Candidate selected for human review",
  };
}
